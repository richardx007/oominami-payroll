-- オーナー/システム管理者の切り替えを、従業員マスタの画面からできるようにする(2026-10-11 オーナー依頼)。
-- 変えられるのはオーナーだけ(システム管理者が自分をオーナーにできないように)。
-- 自分自身のオーナーは外せない(オーナーが1人もいなくなるのを防ぐ。外すときは別のオーナーが行う)。
-- SQL エディタ(auth.uid() が無い)からは今まで通り変更できる。
create or replace function public.guard_employee_owner()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if auth.uid() is not null
     and (tg_op = 'INSERT' and new.is_owner
          or tg_op = 'UPDATE' and new.is_owner is distinct from old.is_owner) then
    if not public.is_owner() then
      raise exception 'オーナーの設定は、オーナーだけが変更できます';
    end if;
    if tg_op = 'UPDATE' and old.auth_user_id = auth.uid() then
      raise exception '自分自身のオーナーは外せません(別のオーナーが変更してください)';
    end if;
  end if;
  return new;
end;
$$;
