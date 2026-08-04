-- 未打刻通知(Web Push)の基盤。
--
-- 目的: シフトの出勤/退勤予定時刻を過ぎても打刻が無い場合に、管理者の端末へ
--       OS通知(アプリを閉じていても届く Web Push)を送る。
--
-- 構成上の要点:
--  - スケジューラは Supabase 側(pg_cron)。Cloudflare Workers 無料プランは CPU 10ms 制限が
--    厳しく、以前 Error 1102 を起こしているため、検出そのものは DB 内の SQL で完結させる。
--  - アプリには service_role キーが無い方針のため、API ルート側から DB を読むことはしない。
--    cron が「送るべき通知」と「送信先の購読情報」を組み立てて API へ POST し、
--    API ルートは Web Push の暗号化と送信だけを担う。

-- ============================================================
-- 1. 購読情報(端末ごと)
-- ============================================================
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  -- ブラウザが払い出すエンドポイントURL。端末+ブラウザごとに一意なのでこれを重複判定に使う
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Web Push の購読情報(端末ごと)。通知を許可した端末だけがここに登録される。';

alter table public.push_subscriptions enable row level security;

-- 自分の端末の購読だけを登録・参照・削除できる
create policy push_subscriptions_self on public.push_subscriptions
  for all
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

grant select, insert, delete on public.push_subscriptions to authenticated;

-- ============================================================
-- 2. 通知済みの記録(重複防止)
-- ============================================================
-- 同じ人・同じ業務日・同じ種別(出勤/退勤)につき通知は1回だけにする。
-- cron は5分ごとに走るため、これが無いと同じ未打刻を延々と通知し続けてしまう。
create table if not exists public.punch_alerts (
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  kind text not null check (kind in ('in', 'out')),
  notified_at timestamptz not null default now(),
  primary key (employee_id, work_date, kind)
);

comment on table public.punch_alerts is
  '未打刻通知の送信済み記録。(従業員, 業務日, 種別)で重複送信を防ぐ。';

alter table public.punch_alerts enable row level security;

-- 管理者のみ参照できる(送信履歴の確認用)。書き込みは collect_punch_alerts() が行う。
create policy punch_alerts_admin_read on public.punch_alerts
  for select using (public.is_admin());

grant select on public.punch_alerts to authenticated;

-- ============================================================
-- 3. 枠の時刻文字列("8:00" / "24:00")を interval に直すヘルパー
-- ============================================================
-- 深夜0時は 24:00 とも 0:00 とも表記されうるため、時は 24 で割った余りに丸める。
-- パースできない値は null を返し、呼び出し側で既定値にフォールバックさせる。
create or replace function public.parse_slot_time(t text)
returns interval
language sql
immutable
as $$
  select case
    when t is null or trim(t) !~ '^\d{1,2}:\d{1,2}$' then null
    else make_interval(
      hours => (split_part(trim(t), ':', 1))::int % 24,
      mins  => (split_part(trim(t), ':', 2))::int
    )
  end;
$$;

-- ============================================================
-- 4. 未打刻の検出 + 通知済み記録 + 送信ペイロード組み立て
-- ============================================================
-- pg_cron から呼ばれる。返り値をそのまま API ルートへ POST する。
-- 送るものが無ければ alerts が空配列になるので、API 側は何もしない。
create or replace function public.collect_punch_alerts()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_now timestamp;
  v_enabled boolean;
  -- 予定時刻から何分過ぎたら通知するか。出勤は遅刻に早く気付きたいので短く、
  -- 退勤は残業で延びるのが普通なので長めに取る(オーナー指定)。
  v_delay_in interval := interval '5 minutes';
  v_delay_out interval := interval '30 minutes';
  -- 遡って通知する上限。機能を有効にした瞬間に過去の未打刻が一斉に飛ぶのを防ぐ。
  v_window interval := interval '12 hours';
  v_alerts jsonb;
  v_subs jsonb;
begin
  -- 既定はオン(未設定時にfalseへ倒さない)。app_settingsの行がまだ無い新規環境でも
  -- 通知が効いた状態から始まるようにするため。明示的に'false'にした場合のみオフ。
  select coalesce(
    (select value <> 'false' from app_settings where key = 'notify_missing_punch'),
    true
  ) into v_enabled;

  if not v_enabled then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
  end if;

  v_now := (now() at time zone 'Asia/Tokyo');

  with slot_def as (
    select 'A'::text as slot,
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_a_start')), interval '8 hours') as s,
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_a_end')), interval '17 hours') as e
    union all
    select 'B',
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_b_start')), interval '15 hours'),
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_b_end')), interval '0 hours')
    union all
    select 'C',
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_c_start')), interval '0 hours'),
           coalesce(parse_slot_time((select value from app_settings where key = 'shift_slot_c_end')), interval '9 hours')
  ),
  -- シフト1件ごとの「実際の開始/終了日時」を求める。
  -- work_date は業務日付なので、深夜帯(5時未満)の開始は翌日にずれる。
  -- 終了は「開始からの経過時間」で出す(終了<=開始なら日をまたぐ)。こうしないと
  -- 深夜番(0:00〜9:00)の終了が同日9:00と誤って解釈される。
  raw as (
    select
      sa.employee_id,
      sa.work_date,
      coalesce(parse_slot_time(nullif(trim(sa.custom_start), '')), sd.s) as s,
      coalesce(parse_slot_time(nullif(trim(sa.custom_end), '')), sd.e) as e
    from shift_assignments sa
    join slot_def sd on sd.slot = sa.slot
    -- 直近の日付だけを見る(全期間を走査しない)
    where sa.work_date between (v_now::date - 2) and (v_now::date + 1)
  ),
  sched as (
    select
      r.employee_id,
      r.work_date,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end) as start_at,
      (r.work_date + r.s + case when r.s < interval '5 hours' then interval '1 day' else interval '0' end)
        + (case when r.e > r.s then r.e - r.s else r.e - r.s + interval '24 hours' end) as end_at
    from raw r
  ),
  found as (
    -- 出勤予定を過ぎたのに勤務実績の行が無い
    select s.employee_id, s.work_date, 'in'::text as kind, s.start_at as due_at
    from sched s
    left join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where w.id is null
      and v_now >= s.start_at + v_delay_in
      and s.start_at >= v_now - v_window
    union all
    -- 出勤はしているが、退勤予定を過ぎても退勤時刻が入っていない
    select s.employee_id, s.work_date, 'out', s.end_at
    from sched s
    join work_entries w
      on w.employee_id = s.employee_id and w.work_date = s.work_date
    where w.end_time is null
      and v_now >= s.end_at + v_delay_out
      and s.end_at >= v_now - v_window
  ),
  -- 未通知のものだけを記録して取り出す(主キー衝突=通知済みなので何もしない)
  inserted as (
    insert into punch_alerts (employee_id, work_date, kind)
    select employee_id, work_date, kind from found
    on conflict (employee_id, work_date, kind) do nothing
    returning employee_id, work_date, kind
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'name', coalesce(nullif(trim(e.nickname), ''), e.name),
        'work_date', to_char(i.work_date, 'YYYY-MM-DD'),
        'kind', i.kind,
        'due_at', to_char(f.due_at, 'HH24:MI')
      )
    ),
    '[]'::jsonb
  )
  into v_alerts
  from inserted i
  join employees e on e.id = i.employee_id
  join found f
    on f.employee_id = i.employee_id and f.work_date = i.work_date and f.kind = i.kind;

  if v_alerts = '[]'::jsonb then
    return jsonb_build_object('alerts', '[]'::jsonb, 'subscriptions', '[]'::jsonb);
  end if;

  -- 送信先は「通知を許可した管理者の端末」だけ
  select coalesce(
    jsonb_agg(
      jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
    ),
    '[]'::jsonb
  )
  into v_subs
  from push_subscriptions ps
  join employees e on e.id = ps.employee_id
  where e.is_admin and e.status = 'active';

  return jsonb_build_object('alerts', v_alerts, 'subscriptions', v_subs);
end;
$$;

comment on function public.collect_punch_alerts() is
  '未打刻を検出し、通知済みとして記録したうえで Web Push 送信用のペイロードを返す。pg_cron から呼ぶ。';

-- 呼ぶのは pg_cron(postgres ロール)だけ。アプリのロールには渡さない。
revoke all on function public.collect_punch_alerts() from public;
