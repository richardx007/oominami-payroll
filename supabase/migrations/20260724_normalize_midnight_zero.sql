-- 夜中0時の表記を "24:00" から "0:00" に統一する。
-- norm_hhmm / toInputTime は既に % 24 で 24:00 と 0:00 を同一視するため、
-- この更新は勤務予実の突き合わせ・給与計算の処理結果を変えない(表示のみの統一)。

-- シフト枠の既定時刻(app_settings)
update public.app_settings set value = '0:00'
  where key in ('shift_slot_b_end', 'shift_slot_c_start') and value = '24:00';

-- 変則出勤/退勤予定(shift_assignments)
update public.shift_assignments set custom_start = '0:00' where custom_start = '24:00';
update public.shift_assignments set custom_end = '0:00' where custom_end = '24:00';
