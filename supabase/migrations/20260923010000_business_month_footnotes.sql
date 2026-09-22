-- 営業カレンダーの月ごとの注釈（2行）
-- 2026-09-23: オーナー依頼「営業カレンダーの下部に2行の注釈欄。月単位に設定できること」。
--
-- business_months に1行目・2行目を持つ（作成済みの月だけ設定できる）。書き込みは set_business_month_footnotes() 経由。
-- HP埋め込み（public_business_calendar）・プレビュー・ポスター・管理画面のカレンダー下部に表示する。

alter table public.business_months
  add column if not exists footnote1 text check (char_length(footnote1) <= 80),
  add column if not exists footnote2 text check (char_length(footnote2) <= 80);

comment on column public.business_months.footnote1 is '営業カレンダー下部の注釈(1行目)。公開。';
comment on column public.business_months.footnote2 is '営業カレンダー下部の注釈(2行目)。公開。';

/** 月の注釈を保存する（管理者のみ）。空文字は null にする。 */
create or replace function public.set_business_month_footnotes(p_ym date, p_footnote1 text, p_footnote2 text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym date := date_trunc('month', p_ym)::date;
  v_1 text := nullif(trim(p_footnote1), '');
  v_2 text := nullif(trim(p_footnote2), '');
begin
  if not is_admin() then
    raise exception '管理者のみ実行できます';
  end if;

  update business_months set footnote1 = v_1, footnote2 = v_2 where ym = v_ym;
  if not found then
    raise exception '%年%月分はまだ作成されていません', extract(year from v_ym), extract(month from v_ym);
  end if;

  perform log_activity(
    '営業カレンダーの注釈を変更',
    format('%s年%s月分: %s', extract(year from v_ym), extract(month from v_ym),
           coalesce(nullif(concat_ws(' / ', v_1, v_2), ''), '（なし）'))
  );
end;
$$;

revoke all on function public.set_business_month_footnotes(date, text, text) from public, anon;
grant execute on function public.set_business_month_footnotes(date, text, text) to authenticated;

/**
 * HP埋め込み用の営業カレンダー（20260917100000 に notes を追加）。anon から呼ばれる。
 * - p_to は JST の翌月末で頭打ち（準備中の月は返さない）。範囲は最大約14ヶ月。
 * - 営業情報・公開イベント・凡例用の種類・月の注釈だけを返す（メモ・更新者・手修正フラグは返さない）。
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
    return jsonb_build_object('days', '[]'::jsonb, 'events', '[]'::jsonb, 'types', '[]'::jsonb, 'notes', '[]'::jsonb);
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
      from calendar_event_types t), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ym', to_char(m.ym, 'YYYY-MM'), 'footnote1', m.footnote1, 'footnote2', m.footnote2
      ) order by m.ym)
      from business_months m
      where m.ym between date_trunc('month', v_from)::date and v_to
        and (m.footnote1 is not null or m.footnote2 is not null)), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.public_business_calendar(date, date) from public;
grant execute on function public.public_business_calendar(date, date) to anon, authenticated;
