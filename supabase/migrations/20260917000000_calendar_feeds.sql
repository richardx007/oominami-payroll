-- シフトのカレンダー購読フィード（ICS / webcal）
-- 2026-09-17: 従業員ごとの購読URL用トークンと、トークンから本人のシフトを返す関数
--
-- カレンダーアプリ（iPhone標準カレンダー・Googleカレンダー等）はログインできないため、
-- 推測不能なトークンをURLに含めて本人を識別する。URLを知る人は誰でもそのシフトを
-- 閲覧できるため、返す内容は「本人のシフトの日時と枠名」だけに絞る（氏名は含めない）。
-- トークンは本人がアカウント設定画面から作り直せる（作り直すと古いURLは無効になる）。

create table if not exists public.calendar_feeds (
  employee_id uuid primary key references public.employees(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);
comment on table public.calendar_feeds is
  'シフトのカレンダー購読URL用トークン(従業員ごと1つ)。直接の参照・更新は不可で、関数 my_calendar_token()/calendar_feed() 経由でのみ扱う。';

-- ポリシーは作らない（= authenticated/anon から直接は一切読めない・書けない）。
alter table public.calendar_feeds enable row level security;
revoke all on table public.calendar_feeds from anon, authenticated;

/**
 * 自分の購読トークンを返す。未発行なら発行する。p_rotate=true なら作り直す（古いURLは無効）。
 * トークンは UUID 2個分の16進数(64文字・約244ビット)。
 */
create or replace function public.my_calendar_token(p_rotate boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := current_employee_id();
  v_token text;
begin
  if v_emp is null then
    raise exception '従業員が見つかりません';
  end if;

  if not p_rotate then
    select token into v_token from calendar_feeds where employee_id = v_emp;
    if v_token is not null then
      return v_token;
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into calendar_feeds (employee_id, token) values (v_emp, v_token)
  on conflict (employee_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;

revoke all on function public.my_calendar_token(boolean) from public;
grant execute on function public.my_calendar_token(boolean) to authenticated;

/**
 * 購読フィードの中身。トークンが無効（未発行・作り直し済み・退職者）なら null。
 * 返す内容: シフト枠の設定(app_settings の shift_slot_*)、会社名、
 *           本人のシフト(62日前以降)と、その日が「調整中」かどうか。
 * カレンダーアプリからは未ログイン(anon)で呼ばれるため anon にも実行を許可する。
 */
create or replace function public.calendar_feed(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp uuid;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select f.employee_id into v_emp
  from calendar_feeds f
  join employees e on e.id = f.employee_id
  where f.token = p_token and e.status = 'active';

  if v_emp is null then
    return null;
  end if;

  return jsonb_build_object(
    'employee_id', v_emp,
    'company_name', (select value from app_settings where key = 'company_name'),
    'slots', coalesce(
      (select jsonb_agg(jsonb_build_object('key', s.key, 'value', s.value))
       from app_settings s where s.key like 'shift\_slot\_%'),
      '[]'::jsonb
    ),
    'shifts', coalesce(
      (select jsonb_agg(
         jsonb_build_object(
           'work_date', sa.work_date,
           'slot', sa.slot,
           'custom_start', sa.custom_start,
           'custom_end', sa.custom_end,
           'draft', is_shift_draft(sa.work_date)
         ) order by sa.work_date)
       from shift_assignments sa
       where sa.employee_id = v_emp
         and sa.work_date >= ((now() at time zone 'Asia/Tokyo')::date - 62)),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;
