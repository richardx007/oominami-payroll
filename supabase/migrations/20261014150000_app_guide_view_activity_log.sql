-- アプリの解説: 動画を開いたら操作ログにも残す(2026-10-14 オーナー依頼。操作ログで探したため)
-- 操作ログの種類は既存の「アプリの解説」、内容は「視聴: <タイトル>」。どこまで再生したかは視聴履歴(/admin/guides/views)で見る。

create or replace function public.app_guide_view_start(p_guide_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee uuid;
  v_title text;
  v_id uuid;
begin
  select e.id into v_employee
  from public.employees e
  where e.id = public.current_employee_id() and e.status = 'active';
  if v_employee is null then
    return null;
  end if;
  select g.title into v_title
  from public.app_guides g
  where g.id = p_guide_id and g.video_path is not null and (public.is_admin() or g.for_employee);
  if v_title is null then
    return null;
  end if;
  insert into public.app_guide_views (guide_id, employee_id) values (p_guide_id, v_employee)
  returning id into v_id;
  perform public.log_activity('アプリの解説', '視聴: ' || v_title);
  return v_id;
end;
$$;

revoke execute on function public.app_guide_view_start(uuid) from public, anon;
grant execute on function public.app_guide_view_start(uuid) to authenticated;
