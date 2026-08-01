-- 前払金を勤務実績に外部キーで結びつける（2026-08-01）
--
-- これまで advance_payments は (employee_id, work_date) が work_entries と一致するかどうかだけで
-- 紐付いており、**外部キー制約が無かった**。そのため
--   ・勤務実績を削除する
--   ・打刻の修正で勤務日をずらす
-- と前払金だけが取り残され、日別実績の表には出ないのに給与計算では控除され続ける、という
-- 「理由の分からない控除」が発生しうる状態だった（2026-08-01に実際に発生）。
--
-- work_entries には UNIQUE (employee_id, work_date) があるので、同じ組を参照する
-- 複合外部キーを張れる。
--
-- ● ON UPDATE CASCADE
--   勤務実績の work_date を直すと、前払金の work_date も自動で追従する。
--   （打刻の誤りを後から修正するケース＝今回の事故を構造的に防ぐ）
--
-- ● ON DELETE NO ACTION
--   前払金が記録されている日の勤務実績は削除できない。現金を渡した記録だけが残る事故を防ぐ。
--   アプリ側は 23503 を捕まえて「先に前払金を取り消してください」と案内する
--   （src/app/(employee)/timesheet/schema.ts の deleteEntryErrorMessage）。
--
--   ⚠️ **RESTRICT ではなく NO ACTION にすること。**
--   従業員を削除すると employees からの ON DELETE CASCADE で work_entries と
--   advance_payments が"同じ1文の中で"消える。RESTRICT は即時チェックのため、
--   カスケードの順序次第で「まだ前払金が残っている」と判定して従業員削除が失敗しうる。
--   NO ACTION は文末チェックなので、両方消え終わった時点で参照は無く、正常に通る。

-- 事前確認: 孤立レコードが1件でもあると、この制約は追加できない。
-- 追加前に必ず下記が 0 件であることを確認すること。
--   select count(*) from advance_payments a
--   left join work_entries w
--     on w.employee_id = a.employee_id and w.work_date = a.work_date
--   where w.id is null;

alter table public.advance_payments
  add constraint advance_payments_work_entry_fkey
  foreign key (employee_id, work_date)
  references public.work_entries (employee_id, work_date)
  on update cascade
  on delete no action;
