-- 営業カレンダー（フェーズ1: DB・作成処理）
-- 2026-09-17: docs/business-calendar-plan.md §5・§6.1・§6.2
--
-- Google カレンダーでの手入力をやめ、「区分ごとの営業時間の定義」から月ごとに1日1行を作り、
-- いつもと違う日だけ管理画面で直す。HP埋め込みは anon で public_business_calendar() を呼ぶ。
--
-- 時刻は「その日の0:00からの分」で持つ（600=10:00、1440=24:00、1740=翌5:00）。
-- 区分の判定順（オーナー決定）: 翌日が祝日→祝前日 / その日が祝日→祝（金・土の祝日は除く）/ 曜日。
-- ※TS側 src/lib/business-calendar-view.ts の classifyDayType() が同じ規則を持つ。**片方だけ変えないこと。**

-- ============================================================
-- テーブル
-- ============================================================

-- 営業時間の定義（6区分固定）
create table if not exists public.business_hour_patterns (
  day_type text primary key
    check (day_type in ('weekday', 'fri', 'sat', 'sun', 'holiday', 'pre_holiday')),
  is_open boolean not null default true,
  open_min int check (open_min between 0 and 1439),
  close_min int check (close_min between 1 and 2880),
  overnight boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);
comment on table public.business_hour_patterns is
  '営業カレンダーの営業時間の定義(区分ごと)。overnight=true は翌日まで通し(お泊まり可)で close_min は使わない。';

-- 月ごとの作成記録
create table if not exists public.business_months (
  ym date primary key check (extract(day from ym) = 1),
  generated_at timestamptz not null default now(),
  generated_by uuid references public.employees(id) on delete set null,
  notified_at timestamptz
);
comment on table public.business_months is
  '営業カレンダーの月ごとの作成記録。自動作成は generated_by = null。notified_at は作成通知の重複送信防止。';

-- 1日1行（HP表示の元データ）
create table if not exists public.business_days (
  date date primary key,
  day_type text not null
    check (day_type in ('weekday', 'fri', 'sat', 'sun', 'holiday', 'pre_holiday')),
  holiday_name text,
  status text not null check (status in ('open', 'closed', 'temp_closed')),
  open_min int check (open_min between 0 and 1439),
  close_min int check (close_min between 1 and 2880),
  overnight boolean not null default false,
  is_manual boolean not null default false,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null
);
comment on table public.business_days is
  '営業カレンダーの日ごとの営業情報。is_manual=true は手で変更した日で、作り直しで上書きしない。note は非公開。';

-- イベントの種類と色
create table if not exists public.calendar_event_types (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  color text not null default 'gold'
    check (color in ('gold', 'blue', 'purple', 'pink', 'orange', 'gray')),
  sort_order int not null default 0,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.calendar_event_types is
  '営業カレンダーのイベントの種類と色。is_default の種類は削除不可(種類未設定のイベントの表示に使う)。';
create unique index if not exists calendar_event_types_one_default
  on public.calendar_event_types (is_default) where is_default;

-- イベント・お知らせ
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  title text not null check (length(trim(title)) > 0),
  type_id uuid references public.calendar_event_types(id) on delete set null,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.employees(id) on delete set null,
  check (end_date >= start_date)
);
comment on table public.calendar_events is
  '営業カレンダーのイベント・お知らせ(単日/複数日)。is_public=false は管理画面だけに表示。';
create index if not exists calendar_events_range on public.calendar_events (start_date, end_date);

-- 祝日マスタ（作成処理をDB内で行うため）
create table if not exists public.jp_holidays (
  date date primary key,
  name text not null,
  synced_at timestamptz not null default now()
);
comment on table public.jp_holidays is
  '日本の祝日(holidays-jp から pg_cron で毎日同期)。書き込みは関数 apply_jp_holidays_sync() 経由のみ。';

-- 祝日同期の状態（1行）
create table if not exists public.jp_holiday_sync (
  id int primary key default 1 check (id = 1),
  request_id bigint,
  requested_at timestamptz,
  synced_at timestamptz,
  holiday_count int,
  last_error text
);
comment on table public.jp_holiday_sync is
  '祝日同期の状態(1行)。request_id は pg_net の要求ID。';
insert into public.jp_holiday_sync (id) values (1) on conflict do nothing;

-- ============================================================
-- RLS（管理者のみ。祝日・同期状態は参照のみ）
-- ============================================================
alter table public.business_hour_patterns enable row level security;
alter table public.business_months enable row level security;
alter table public.business_days enable row level security;
alter table public.calendar_event_types enable row level security;
alter table public.calendar_events enable row level security;
alter table public.jp_holidays enable row level security;
alter table public.jp_holiday_sync enable row level security;

drop policy if exists business_hour_patterns_admin on public.business_hour_patterns;
create policy business_hour_patterns_admin on public.business_hour_patterns
  for all to authenticated using (is_admin()) with check (is_admin());

-- 作成記録は関数経由で書く（参照のみ）
drop policy if exists business_months_admin_read on public.business_months;
create policy business_months_admin_read on public.business_months
  for select to authenticated using (is_admin());

drop policy if exists business_days_admin on public.business_days;
create policy business_days_admin on public.business_days
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists calendar_event_types_admin on public.calendar_event_types;
create policy calendar_event_types_admin on public.calendar_event_types
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists calendar_events_admin on public.calendar_events;
create policy calendar_events_admin on public.calendar_events
  for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists jp_holidays_admin_read on public.jp_holidays;
create policy jp_holidays_admin_read on public.jp_holidays
  for select to authenticated using (is_admin());

drop policy if exists jp_holiday_sync_admin_read on public.jp_holiday_sync;
create policy jp_holiday_sync_admin_read on public.jp_holiday_sync
  for select to authenticated using (is_admin());

revoke all on table
  public.business_hour_patterns, public.business_months, public.business_days,
  public.calendar_event_types, public.calendar_events, public.jp_holidays, public.jp_holiday_sync
from anon;

-- 既定の種類は削除させない
create or replace function public.protect_default_event_type()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_default then
    raise exception '既定の種類は削除できません';
  end if;
  return old;
end;
$$;
drop trigger if exists calendar_event_types_protect_default on public.calendar_event_types;
create trigger calendar_event_types_protect_default
  before delete on public.calendar_event_types
  for each row execute function public.protect_default_event_type();

-- ============================================================
-- 初期データ
-- ============================================================
-- 営業時間の定義（2026年9月のHP表示に合わせた初期値。定義画面で変更できる）
--   月〜木 10〜24 / 金 10〜通し / 土 通し / 日 〜24 / 祝 10〜24 / 祝前日 10〜通し
insert into public.business_hour_patterns (day_type, is_open, open_min, close_min, overnight) values
  ('weekday',     true, 600, 1440, false),
  ('fri',         true, 600, null, true),
  ('sat',         true, 600, null, true),
  ('sun',         true, 600, 1440, false),
  ('holiday',     true, 600, 1440, false),
  ('pre_holiday', true, 600, null, true)
on conflict (day_type) do nothing;

insert into public.calendar_event_types (name, color, sort_order, is_default)
select v.name, v.color, v.sort_order, v.is_default
from (values ('イベント', 'gold', 1, true), ('お知らせ', 'blue', 2, false)) as v(name, color, sort_order, is_default)
where not exists (select 1 from public.calendar_event_types);

insert into public.app_settings (key, value) values ('notify_business_calendar', 'true')
on conflict (key) do nothing;

-- ============================================================
-- 祝日の同期（pg_net で取得 → 30分後に取り込み）
-- ============================================================

/** holidays-jp の date.json（前年〜翌年）を要求する。応答は net._http_response に入る。 */
create or replace function public.request_jp_holidays_sync()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  v_id := net.http_get(
    url := 'https://holidays-jp.github.io/api/v1/date.json',
    timeout_milliseconds := 15000
  );
  update jp_holiday_sync set request_id = v_id, requested_at = now() where id = 1;
  return v_id;
end;
$$;

/**
 * 直近の要求の応答を jp_holidays に取り込む。応答に含まれる年の範囲内で、
 * 応答に無くなった日（祝日の移動など）は削除する。失敗時は前日までのデータを残す。
 */
create or replace function public.apply_jp_holidays_sync()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req bigint;
  v_status int;
  v_body text;
  v_json jsonb;
  v_count int;
  v_min date;
  v_max date;
begin
  select request_id into v_req from jp_holiday_sync where id = 1;
  if v_req is null then
    return 0;
  end if;

  select status_code, content into v_status, v_body
  from net._http_response where id = v_req;

  if v_status is distinct from 200 then
    update jp_holiday_sync
      set last_error = format('取得失敗(status=%s)', coalesce(v_status::text, '応答なし'))
      where id = 1;
    return 0;
  end if;

  begin
    v_json := v_body::jsonb;
  exception when others then
    update jp_holiday_sync set last_error = '応答がJSONではありません' where id = 1;
    return 0;
  end;

  select count(*), min(key::date), max(key::date) into v_count, v_min, v_max
  from jsonb_each_text(v_json);

  if v_count = 0 then
    update jp_holiday_sync set last_error = '祝日が0件でした' where id = 1;
    return 0;
  end if;

  insert into jp_holidays (date, name, synced_at)
  select key::date, value, now() from jsonb_each_text(v_json)
  on conflict (date) do update set name = excluded.name, synced_at = excluded.synced_at;

  delete from jp_holidays h
  where h.date between date_trunc('year', v_min)::date
                   and (date_trunc('year', v_max) + interval '1 year - 1 day')::date
    and not (v_json ? h.date::text);

  update jp_holiday_sync
    set synced_at = now(), holiday_count = v_count, last_error = null
    where id = 1;
  return v_count;
end;
$$;

revoke all on function public.request_jp_holidays_sync() from public, anon, authenticated;
revoke all on function public.apply_jp_holidays_sync() from public, anon, authenticated;

-- pg_cron は UTC。02:00 JST = 17:00 UTC、02:30 JST = 17:30 UTC
select cron.unschedule(jobid) from cron.job where jobname in ('jp-holidays-request', 'jp-holidays-apply');
select cron.schedule('jp-holidays-request', '0 17 * * *', $job$select public.request_jp_holidays_sync();$job$);
select cron.schedule('jp-holidays-apply', '30 17 * * *', $job$select public.apply_jp_holidays_sync();$job$);

-- ============================================================
-- 区分の判定と月の作成
-- ============================================================

/** 区分の判定（祝前日 → 祝（金・土を除く） → 曜日）。 */
create or replace function public.business_day_type(p_date date)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when exists (select 1 from jp_holidays where date = p_date + 1) then 'pre_holiday'
    when exists (select 1 from jp_holidays where date = p_date)
         and extract(dow from p_date) not in (5, 6) then 'holiday'
    else case extract(dow from p_date)::int
      when 5 then 'fri'
      when 6 then 'sat'
      when 0 then 'sun'
      else 'weekday'
    end
  end;
$$;

/**
 * 指定月（p_ym の月）の business_days を定義から作る。
 * - 既存の行は is_manual = false の行だけ置き換える（手で直した日は祝日名だけ更新）。
 * - 対象月の年・翌月1日の年の祝日が1件も無ければ中止（祝日なしで誤作成しないため）。
 * - 管理画面（authenticated）からは管理者のみ。作成済みの月は p_regenerate = true のときだけ作り直す。
 *   pg_cron（auth.uid() が null）からの呼び出しは自動作成として記録する。
 * 戻り値: 作成・更新した日数。
 */
create or replace function public.generate_business_month(p_ym date, p_regenerate boolean default false)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym date := date_trunc('month', p_ym)::date;
  v_end date := (date_trunc('month', p_ym) + interval '1 month - 1 day')::date;
  v_by uuid := null;
  v_count int;
begin
  if auth.uid() is not null then
    if not is_admin() then
      raise exception '管理者のみ実行できます';
    end if;
    v_by := current_employee_id();
  end if;

  if not p_regenerate and exists (select 1 from business_months where ym = v_ym) then
    raise exception '%年%月分は作成済みです', extract(year from v_ym), extract(month from v_ym);
  end if;

  if not exists (select 1 from jp_holidays
                 where date >= date_trunc('year', v_ym)
                   and date < date_trunc('year', v_ym) + interval '1 year')
     or not exists (select 1 from jp_holidays
                    where date >= date_trunc('year', v_end + 1)
                      and date < date_trunc('year', v_end + 1) + interval '1 year') then
    raise exception '祝日データを取得できていません（%年%月分の作成を中止しました）',
      extract(year from v_ym), extract(month from v_ym);
  end if;

  with src as (
    select d::date as date, business_day_type(d::date) as day_type
    from generate_series(v_ym, v_end, interval '1 day') d
  )
  insert into business_days
    (date, day_type, holiday_name, status, open_min, close_min, overnight, is_manual, updated_at, updated_by)
  select s.date, s.day_type, h.name,
         case when p.is_open then 'open' else 'closed' end,
         case when p.is_open then p.open_min end,
         case when p.is_open and not p.overnight then p.close_min end,
         p.is_open and p.overnight,
         false, now(), v_by
  from src s
  join business_hour_patterns p on p.day_type = s.day_type
  left join jp_holidays h on h.date = s.date
  on conflict (date) do update set
    holiday_name = excluded.holiday_name,
    day_type   = case when business_days.is_manual then business_days.day_type  else excluded.day_type  end,
    status     = case when business_days.is_manual then business_days.status    else excluded.status    end,
    open_min   = case when business_days.is_manual then business_days.open_min  else excluded.open_min  end,
    close_min  = case when business_days.is_manual then business_days.close_min else excluded.close_min end,
    overnight  = case when business_days.is_manual then business_days.overnight else excluded.overnight end,
    updated_at = case when business_days.is_manual then business_days.updated_at else excluded.updated_at end,
    updated_by = case when business_days.is_manual then business_days.updated_by else excluded.updated_by end;
  get diagnostics v_count = row_count;

  insert into business_months (ym, generated_at, generated_by)
  values (v_ym, now(), v_by)
  on conflict (ym) do update set generated_at = excluded.generated_at, generated_by = excluded.generated_by;

  if v_by is not null then
    perform log_activity(
      case when p_regenerate then '営業カレンダー作り直し' else '営業カレンダー作成' end,
      format('%s年%s月分', extract(year from v_ym), extract(month from v_ym))
    );
  end if;

  return v_count;
end;
$$;

revoke all on function public.generate_business_month(date, boolean) from public, anon;
grant execute on function public.generate_business_month(date, boolean) to authenticated;

-- ============================================================
-- 公開用（HP埋め込み）
-- ============================================================

/**
 * HP埋め込み用の営業カレンダー。anon から呼ばれる。
 * - p_to は JST の翌月末で頭打ち（準備中の月は返さない）。範囲は最大約14ヶ月。
 * - 営業情報・公開イベント・凡例用の種類だけを返す（メモ・更新者・手修正フラグは返さない）。
 */
create or replace function public.public_business_calendar(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_max date := (date_trunc('month', v_today) + interval '2 month - 1 day')::date;
  v_to date := least(p_to, v_max);
  v_from date := greatest(p_from, v_max - 430);
begin
  if p_from is null or p_to is null or v_from > v_to then
    return jsonb_build_object('days', '[]'::jsonb, 'events', '[]'::jsonb, 'types', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.date, 'holiday_name', d.holiday_name, 'status', d.status,
        'open_min', d.open_min, 'close_min', d.close_min, 'overnight', d.overnight
      ) order by d.date)
      from business_days d
      where d.date between v_from and v_to), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'start_date', e.start_date,
        'end_date', least(e.end_date, v_to), 'title', e.title, 'type_id', e.type_id
      ) order by e.start_date, e.end_date desc)
      from calendar_events e
      where e.is_public and e.start_date <= v_to and e.end_date >= v_from), '[]'::jsonb),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'color', t.color, 'sort_order', t.sort_order, 'is_default', t.is_default
      ) order by t.sort_order, t.created_at)
      from calendar_event_types t), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.public_business_calendar(date, date) from public;
grant execute on function public.public_business_calendar(date, date) to anon, authenticated;
