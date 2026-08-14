# 給与管理システム 設計書

最終更新: 2026-07-19
対象リポジトリ: `richardx007/oominami-payroll`
本番URL: https://oominami-payroll.shinsekai.workers.dev

> UI: ブランドロゴ（`public/logo.svg`、新世界オオミナミ）を各ヘッダー左上に表示。
> メニューバーはネイビー（`#152449`）で統一。

---

## 1. システム概要

アルバイト従業員（本システムでは「従業員」と表記）の勤務時間・交通費申告をもとに
給与を計算し、給与明細の配信および税理士向け資料の作成・送付までを行う、
小規模事業者向けのシンプルな給与管理システム。

- 締め日: 毎月25日（対象期間は前月26日〜当月25日）
- 支払日: 月末
- 給与 = 時給 × 勤務時間 + 深夜勤務手当（22:00〜翌5:00の勤務に時給25%割増）+ 残業手当（1日8時間超過分に時給25%割増）
  + 交通費実費 + 昼食補助（勤務日数 × 定額）− 源泉所得税

### スコープ外
- 年末調整、社会保険・雇用保険の管理
- 銀行振込連携（支払いは手動）
- 正社員給与（月給制）

---

## 2. 技術スタック

| 項目 | 採用技術 |
|------|---------|
| フロントエンド | Next.js 16（App Router）+ TypeScript + React 19 |
| スタイル | Tailwind CSS v4 |
| ホスティング | Cloudflare Workers（`@opennextjs/cloudflare` アダプター） |
| DB / 認証 | Supabase（PostgreSQL + Auth） |
| メール送信 | Gmail SMTP（自前の最小SMTPクライアント `src/lib/smtp.ts`、multipart添付対応） |
| バリデーション | Zod v4 |
| テスト | Vitest（給与計算ロジック） |
| PDF | ブラウザの「印刷 / PDF保存」機能を利用（専用ライブラリなし） |
| 祝日 | holidays-jp（`https://holidays-jp.github.io/`）から実行時fetch、1日キャッシュ |

### 外部サービスの識別子
- Supabase プロジェクト: `oominami-payroll`（project_id: `zvrwkmriosaldjqpxdwi`、region: ap-northeast-1）
  - 既存の別システム `bottle-keep`（project_id: `tzkidxbtchwgmrjvntsr`）と同一組織 `richardx007's Org` に同居
- Cloudflare Worker 名: `oominami-payroll`
- 組織/アカウント: richard.nishikawa@gmail.com

---


### 🔴 業務日付（日をまたぐ深夜勤務の扱い。2026-08-02統一）

**日をまたぐ深夜勤務は、その前日の業務として扱う。これを「業務日付」と呼ぶ。**
`work_entries.work_date` / `shift_assignments.work_date` はすべて業務日付であり、実日付ではない。

- **切り替わり時刻は朝5時**（`lib/period.ts` の `BUSINESS_DAY_START_HOUR`）。
  **5時より前に始まる勤務は前日扱い**。変換は `businessDateOf(実日付, 時刻)`。
  - 例: 実日付 2026-08-01 の 00:00 開始（深夜枠）→ 業務日付 **2026-07-31**
  - 例: 実日付 2026-08-01 の 08:00 開始（早番）→ 業務日付 2026-08-01
- **なぜ必要か**: シフトの「深夜」枠は **0:00〜9:00** で日付が変わってから始まる。実日付で記録すると
  シフト表（業務日付で予定を入れる）と勤務表・日別（実日付で記録）が**必ず1日ずれ**、
  予実がすべて不一致になっていた（2026-08-02に発覚し統一）。
- **25日締めも業務日付ベース**。8/25夜の深夜勤務（実際は8/26未明）は8月度に含まれる。
  - 労基法の行政解釈（昭63.1.1 基発第1号）では、継続勤務が2暦日にわたる場合は
    **始業時刻の属する日の労働として1日で扱う**。日をまたぐ勤務を1日にまとめる考え方自体は
    これと整合的。ただし「0:00開始を前日に寄せる」のは独自の管理ルールなので、
    **賃金規程・就業規則に明記し一貫適用すること**（顧問税理士・社労士に確認済みの前提）。
  - 支払いが早まる方向なので労働者に不利益はない。源泉徴収は**支払時**基準のため税務上の影響もない。
- ⚠️ **金額計算は日付ラベルの影響を受けない。** 深夜割増（22:00〜5:00）も8時間超の割増も
  **実時刻・1勤務単位**で計算しているため、業務日付にしても支給額は変わらない。
- ⚠️ **`BUSINESS_DAY_START_HOUR` は設定画面に出していない。** 変えると過去データとの整合が崩れるため、
  変更する場合は既存 `work_entries.work_date` の移行とセットで行うこと。
  深夜枠の開始（0:00）より後、早番の開始（8:00）より前である必要がある。
- **前提: 1従業員1業務日につき1勤務**（`work_entries` の `UNIQUE(employee_id, work_date)`）。
  同じ業務日に2回勤務する形（例: 早番の後、日付が変わってから深夜）は記録できないが、
  **業務上そうした勤務は発生しない前提でよいとオーナー確認済み**（2026-08-02）。
  将来そうした勤務が生じる場合は、この一意制約を含めた設計の見直しが必要。

### 用語: 「月度」（2026-07-27統一）

25日締めの給与期間（前月26日〜当月25日）を指す月の表現は **「○年○月度」** に統一する
（例: 2026年8月度 = 2026/07/26〜2026/08/25、支払日 2026/08/31）。暦月と紛らわしいため。

- 対象: 勤務表・給与明細（締め処理）・日当設定のカレンダー月選択、`pay_periods.period_label`、
  給与明細メール・税理士メールの件名など、`periodOf()` が返す `label` を使う箇所すべて。
- **暦月**（シフト予定表の「1日始まり」設定時に使う `monthPeriodOf()`）は月度ではないため
  **「○年○月」のまま**にする。
- 実装は `lib/period.ts` の `periodOf()` の `label` 1箇所。ここを直すと全画面・メールに波及する。
- 既存の `pay_periods.period_label`（"○月分"で保存済み）は 2026-07-27 にSQLで一括置換済み。


### 配色の意味づけ（アプリ全体の原則。2026-07-31確立）

**背景色は「その情報が確定しているか」を表す。** 新しい画面・表を作るときもこの原則に従うこと。

| 意味 | 色 | 例 |
|---|---|---|
| **確定**を明示する | **グリーン系**（`result-*`） | 締め済みの給与明細の表、勤務実績 |
| **未確定**を明示する | **イエロー系**（`yellow-*`） | 未締め（給与計算プレビュー）の給与明細の表、シフトの「調整中」 |
| それ以外（通常） | **ブルー系**（`plan-*`） | シフト予定表、勤務表の予定行 |

- イエローは**シフトの「調整中」モードと同じ `yellow-200`** に揃える（見出し行）。
  カードの見出し帯は `yellow-50`、枠線は `yellow-300`。
- 給与明細（`admin/close/page.tsx`）は `status === "open"`（未締め）のときだけイエローになる。
  締め済み・支払済みはグリーン。

### 配色: 予定=ブルー / 実績=グリーン（2026-07-27統一）

- **予定（シフト予定表）はブルー系**、**実績（勤務表・給与明細・日当）はグリーン系**で統一する。
- 実績側のグリーンは Tailwind 標準の `green` だと彩度が高くギラつくため、**彩度を抑えたセージ系**を
  `globals.css` の `@theme inline` に独自定義している（`result-50/100/200/700`）。
  予定側のブルーも `blue-50` では淡すぎてメリハリが出ないため、少し濃い `plan-50/100/200` を同様に定義している。
  **色味の調整はこの1箇所を直せばよい**（`bg-result-100` / `bg-plan-100` などのユーティリティが自動生成される）。
- 適用箇所（実績=グリーン）: 勤務表カレンダーの曜日行・予実一覧の実績、
  給与明細/日当の表の見出し行・カードの見出し帯・枠線。
- 適用箇所（予定=ブルー）: シフト表の曜日行、勤務表の予実一覧の予定行。
  **ただしシフトが「調整中」の月は曜日行をモードバッジと同じイエロー（`bg-yellow-200`）にする**（§13）。
  一目で調整中と分かるようにするため。

## 3. データベース設計

Supabase（PostgreSQL）。全テーブルで RLS（行レベルセキュリティ）有効。

### テーブル一覧

| テーブル | 用途 | 主なカラム |
|---------|------|-----------|
| `employees` | 従業員（管理者含む） | id, employee_no, name, furigana(ふりがな・任意), nickname(ニックネーム・任意), color(シフト表の識別色・任意), email, auth_user_id, is_admin, status(active/retired) |
| `shift_assignments` | 勤務予定/希望（1日3枠A/B/Cの交代制・1従業員1日1枠） | employee_id, work_date, slot(A/B/C), custom_start, custom_end, unique(employee_id,work_date)。RLS は月のモードで変わる（§13）|
| `shift_modes` | シフトの月ごとのモード（確定/調整中。§13） | period_key("YYYY-MM"), status(draft/confirmed), updated_at。RLS=閲覧は全ログインユーザー・変更は管理者のみ |
| `wage_rates` | 時給履歴（値上げ対応） | employee_id, hourly_wage, effective_from |
| `tax_settings` | 税区分履歴 | employee_id, tax_category(kou/otsu), dependents, effective_from |
| `allowance_settings` | 昼食補助設定 | lunch_allowance_per_day, effective_from |
| `pay_periods` | 給与計算期間（`period_label` は「2026年8月度」形式。§用語参照） | period_label, start_date, end_date, payment_date, status(open/closed/paid) |
| `work_entries` | 勤務表 | employee_id, work_date, start_time, end_time, break_minutes, transport_cost, transport_mode(手段), station_from(駅1), station_to(駅2), round_trip(往復), note ／ ※深夜勤務(退勤翌日, 例18:00→2:00)を許容するため `end_time > start_time` のCHECK制約は撤去済み。end≤start は翌日とみなし `workMinutes` が24時間加算 |
| `payslips` | 給与明細（締め時に確定保存） | employee_id, pay_period_id, work_days, total_minutes, night_minutes(深夜帯勤務分), overtime_minutes(1日8h超過分), hourly_wage, base_pay, night_pay(深夜勤務手当=時給25%割増分), overtime_pay(残業手当=時給25%割増分), transport_total, lunch_total, gross_pay, income_tax, advance_deduction(前払金控除。既定0), net_pay, tax_category, finalized_at, emailed_at |
| `advance_payments` | 前払金（日当として先に現金で支払った分。§11） | employee_id, work_date, amount, note, created_at, unique(employee_id,work_date)。**(employee_id, work_date) が `work_entries` への複合FK**（`ON UPDATE CASCADE`／`ON DELETE NO ACTION`。§11.3.3）。RLS=従業員は自分の行を参照のみ・登録/変更/削除は管理者(`is_admin()`) |
| `notifications` | 連絡・催促・一斉報知 | sender_id, recipient_id(null=全員), type(individual/broadcast/reminder), subject, body, emailed, sent_at |
| `tax_reports` | 税理士送付記録（※現在は書き込みなし・将来用に残置） | pay_period_id, emailed_to, emailed_at |
| `withholding_tax_table` | 源泉徴収税額表（月額表。国税庁公開の甲欄0〜7人＋乙欄を保持） | year, min_amount, max_amount, tax_kou_0..7, tax_otsu, created_at(取り込み日時) |
| `app_settings` | アプリ設定（キー値） | key, value（gmail_user / tax_accountant_name / tax_accountant_email / company_name / break_window_{1,2,3}_{start,end} / work_rules_{path,filename,mime,uploaded_at} 等） |
| `activity_logs` | 操作ログ（閲覧は管理者のみ・挿入はSECURITY DEFINER関数経由） | created_at, actor_id, actor_name, action, detail ／ 保持90日（`log_activity` 内で超過分を削除・削除自体も記録） |
| `clock_events` | QR打刻の監査ログ（追記専用。管理者=全件、従業員=自分の挿入/参照） | employee_id, type(in/out), event_at, work_entry_id, latitude, longitude, accuracy, distance_m, out_of_range, location_denied, user_agent |
| `storage.objects`(work-rules バケット) | 勤務ルール文書(jpg/png/pdf)。固定パス`document`に常に上書き保存 | RLS: SELECT=authenticated全員、INSERT/UPDATE/DELETE=管理者のみ(`is_admin()`) |

### 主な設計ポイント
- **従業員No の自動採番**: 新規登録時に区分（管理者/従業員）を選ぶと、管理者は `M001〜`、
  従業員は `E001〜` を既存の最大値から自動採番（手入力なし）。管理者は時給・税区分・扶養親族数の入力不要。
- **氏名・ふりがな・ニックネーム・メール編集**: 管理画面の従業員編集（吹き出しパネル）から変更可。
  ふりがな・ニックネームは任意項目（2026-07-19追加）。登録・編集フォームとも入力順は
  「氏名 → ふりがな/ニックネーム（同じ行に横並び）→ メールアドレス」。**メール変更時は `auth_user_id`
  を null に戻して「未登録」化**し、再招待→新メールでの初回登録（email一致で再連携）を促す。
- **招待日**: `employees.invited_at` に最後に招待メールを送った日時を記録（再招待で更新）。未登録の従業員は
  一覧に「招待日 M/D」を表示し、招待ボタンは初回=「招待」/2回目以降=「再招待」になる。
- **時給・税区分の履歴編集UI（`admin/employees/ui.tsx`の`WageHistory`/`TaxHistory`。2026-07-24整理）**:
  従業員詳細パネル下部に、時給(`wage_rates`)・税区分(`tax_settings`)とも**同じフォーマット**で並ぶ
  （md以上は2カラム）。各履歴一覧は**適用年月日の昇順**（古い順）で表示し、1行は「適用年月日（左）→
  値（右。時給は¥金額、税区分は"甲欄/乙欄(扶養N人)"）→現在有効バッジ→編集/削除ボタン」の構成。
  編集フォームも「適用開始日（左）→値（右）」の順。**iOSの`<input type=date>`は内容(YYYY/MM/DD)に
  合わせた実測幅を要求し、full幅や50%グリッドだと数字が枠からはみ出す／隣の入力に重なる**ため、
  日付だけ**固定幅クラス`historyDateClass`（`w-36 shrink-0`≒144px、iOSウィジェットが余裕で収まる幅）**にし、
  値・区分の入力は`historyFieldClass`（`min-w-0 flex-1`）で残り幅に伸ばす。フィールド行は`flex flex-wrap`で
  横並びを基本にしつつ収まらない時のみ折り返す（縦積み`flex-col`は行が増えすぎ、50%グリッドは重なるため、
  この「日付固定幅＋値flex＋wrap」に落ち着いた。2026-07-24）。時給フォームは日付＋金額で1行に収まる。
  税区分フォームは項目が多い（日付・甲乙・扶養人数）ため、日付＋甲乙で1行・扶養人数＋ボタンで1行に
  意図的に2段組みし、扶養は「扶養〔n〕人」形式の小さな数値入力にする。一覧の下に新規追加フォーム
  （同じ左右順）があり、追加ボタンは右寄せ・「更新」ボタンと同サイズ（`px-4 py-2`）。
  税区分の表示行（適用年月日＋"甲欄/乙欄(扶養N人)"）は文字数が多いため、ラベルに`whitespace-nowrap`、
  編集/削除ボタン側に`ml-auto`＋外側`flex-wrap`で、収まらない場合はボタンごと次行へ折り返す。
  税区分履歴の訂正・削除は`editTaxSetting`/`deleteTaxSetting`（`admin/employees/actions.ts`。
  `editWageRate`/`deleteWageRate`と同じ、適用開始日変更時は一意制約の衝突確認→旧行削除→再作成のパターン）。
- **時給の値上げ対応**: `wage_rates` に適用開始日つき履歴。勤務日ごとに有効な時給を適用（`effectiveAt()`）。
  **0円を許容**（経営者が現場ヘルプで入る場合など無給勤務の記録用途。DBのCHECK制約・入力欄とも `>=0`）。
- **税区分**: 従業員ごとに甲欄/乙欄・扶養親族数を適用開始日つきで保持。管理画面から変更可。当面は全員乙欄デフォルト。
  管理画面の税区分入力欄の直下に「**甲欄を適用するには従業員から「扶養控除等（異動）申告書」の提出を
  受けていることが税法上の要件**」である旨を表示している（2026-07-29追加。誤って甲欄を選ぶのを防ぐため）。
- **締め処理**: `pay_periods.status` が open 以外になると、該当期間の `work_entries` が RLS で編集ロックされる。締め時に `payslips` を確定保存。
- **設定の置き場所**:
  - 送信元Gmail・税理士アドレス・会社名 → `app_settings`（管理画面から変更）
  - `GMAIL_APP_PASSWORD`（秘密）→ Cloudflare の Secret
  - Supabase 公開値 → `wrangler.jsonc` の vars

### RLS の要点（DB関数）
- `is_admin()`: ログインユーザーが管理者か（SECURITY DEFINER）
- `current_employee_id()`: ログインユーザーの employee.id
- `is_period_open(date)`: その日を含む期間が open か（勤務表の編集可否判定）
- `email_registered(text)`: 未連携の登録済みメールか（初回登録前に匿名で呼べる唯一の関数）
- `link_employee_account()`: ログイン済みユーザーを employees 行に紐付け（auth_user_id のみ更新）
- `count_employee_work_entries(uuid)`: 指定従業員の勤務実績件数（削除前警告用。管理者チェック内包）
- `delete_employee(uuid)`: 従業員の完全削除（管理者チェック内包）。`notifications`（FK が NO ACTION）を
  先に削除し、`employees` 行を削除 → `work_entries`/`payslips`/`wage_rates`/`tax_settings` は FK CASCADE で
  自動削除。認証アカウント（`auth.users`）はサービスロール鍵不要方針のため残る（同メール再登録で再連携）。
- `log_activity(action, detail)`: 操作ログを1行追加（SECURITY DEFINER）。actor は `auth.uid()` から解決
  （未ログインは「(未ログイン)」）。90日超過ログを間引き削除し、削除時は「ログ削除」も記録。
  ログイン/初回登録/再設定申請でも呼べるよう **authenticated と anon に実行付与**（他のDEFINER関数はanon revoke）。
- `get_shift_roster()`: 在籍・非管理者の id/氏名/ニックネーム/色を返す（SECURITY DEFINER・authenticated）。
  従業員は他人の `employees` 行を直接 SELECT できないため、シフト表の名簿表示に使う。
- `get_shift_settings()`: `app_settings` の `shift_slot_*`（枠ラベル・時刻）だけを返す（SECURITY DEFINER・authenticated）。
  `app_settings` は管理者のみ SELECT 可のため、従業員のシフト閲覧・勤務表の予定時刻表示に使う。
- `get_shift_status(start, end)`: シフト予定と勤務実績を突き合わせ、状態
  （match / missing=予定あり実績なし / timediff=時刻相違 / unplanned=実績あり予定なし）だけを返す
  （SECURITY DEFINER・authenticated）。**実際の勤務時刻は返さない**ため、従業員セッションでも他人の
  予実相違（赤太字）を安全に描画できる。`norm_hhmm(text)` で "8:00"/"24:00" 等を "HH24:MI" に正規化して比較。
- `get_clock_settings()`: QR打刻用に `app_settings` の `clock_*` だけを返す（SECURITY DEFINER）。
  `app_settings` は管理者のみ SELECT 可のため、従業員セッションの打刻処理はこの関数で設定を読む。authenticated に実行付与。
- `get_timesheet_lock()`: `app_settings` の `lock_employee_time_edit` を返す（SECURITY DEFINER・authenticated）。§9参照。
- `get_contact_settings()`: `app_settings` の `company_name`・`gmail_user` を返す（SECURITY DEFINER・authenticated）。
  従業員下部メニュー「管理者へ✉️」の `mailto:`（宛先＝送信元メール、本文＝会社名 管理者様/氏名）組み立てに使う。
- `get_break_settings()`: `app_settings` の `break_window_*`（標準休憩時間帯3枠）を返す（SECURITY DEFINER・authenticated）。§10.1参照。
- `get_work_rules_meta()`: `app_settings` の `work_rules_*`（勤務ルール文書のストレージパス・元ファイル名・MIME）を返す
  （SECURITY DEFINER・authenticated）。§10.2参照。
- いずれの SECURITY DEFINER 関数も anon から revoke 済み（`email_registered`・`log_activity` のみ anon 実行可）。
- 従業員は自分のレコードのみ read/write、管理者は全件。`activity_logs` は管理者のみ select。

---

## 4. アプリケーション構成

### アプリシェル（`.app-shell` / `.app-scroll`。2026-07-29導入）

従業員・管理者の各レイアウトは、**ビューポートに固定した縦フレックス（`.app-shell`）＋
本文だけを内部スクロール（`.app-scroll`）＋ 下部タブナビは最下段の通常フロー要素**という構成にする。
定義は `globals.css`。

- **下部タブナビに `position: fixed` を使わないこと。** iOS Safari では fixed 要素がスクロール中に
  再配置されず**画面途中に取り残される**ことがある（2026-07-29に実機で発生）。
  `transform: translateZ(0)` / `will-change: transform` によるGPUレイヤー化は**逆効果**で、
  症状を誘発するうえ、子孫の `position: fixed`（ハンバーガーメニューのオーバーレイ）の
  包含ブロックを乗っ取ってしまう。**この回避策を再導入しないこと。**
- **シェルの高さは `height: 100dvh` ではなく `position: fixed; inset: 0`** で取る。
  `100dvh` だと、PDF生成などでビューポート高さが再計算されたときにシェルの高さがずれ、
  **下部ナビの下に隙間ができて少しずつせり上がる**（2026-07-31に実機で発生。QRのPDF
  ダウンロードを往復するたびに隙間が累積した）。`inset: 0` なら常にビューポートと一致する。
  なおシェル自体は画面全体を覆って動かないため、fixed でも「取り残される」不具合は起きない
  （問題になるのは、スクロールする本文の"上に"浮かせる場合）。
- **`.app-scroll` は `overflow-x: hidden`**（縦だけスクロールさせる）。横スクロールが要る表などは
  それぞれの `overflow-x: auto` の枠内で個別にスクロールさせる。
- **印刷時は `@media print` で `.app-shell` の `position` / 高さ / overflow を必ず解除する。**
  解除しないと**印刷が1画面ぶんで切れる**（日別実績・給与明細の表の続きが出ない）。
  `position: static` に戻す指定を消さないこと。
- **md 以上（管理画面のサイドバー表示）は通常のページスクロールへ戻す**（`.app-shell--sidebar`）。
  この幅では下部タブナビ自体が `md:hidden` で出ないため、シェルの固定も内部スクロールも不要。
- **管理画面の横幅制限は `layout.tsx` ではなく各ページ側で持つ**（2026-08-05変更）。
  `admin/layout.tsx` の `<main>` は `max-w` を付けずパディングのみ。表の列を多く見せたい
  「日別」「給与明細」は横幅いっぱいまで広げ、それ以外の画面（シフト・勤務表・従業員・設定・
  操作ログ・配信）は各ページの最上位 `<div>` に `mx-auto w-full max-w-5xl` を付けて読みやすい
  幅に収めている。新しい管理画面を追加するときは、表中心の画面でなければこのクラスを
  忘れずに付けること（付け忘れると横に間延びして見える）。

### ディレクトリ（`src/`）
```
app/
  (employee)/            従業員向け（スマホ基本+PC/iPadは2カラム、下部タブナビ）
    layout.tsx           スマホ:max-w-lg / lg以上:max-w-5xl（ヘッダーはネイビー+ロゴ）。ヘッダー右肩は
                         ニックネーム(未設定は氏名)。最新お知らせの sent_at と get_contact_settings()
                         (会社名・送信元メール)を取得し EmployeeNav に渡す（未読バッジ・管理者メール用）。
    loading.tsx          画面遷移中のスピナー
    actions.ts           signOut サーバーアクション（クライアントnavから form action で呼ぶ）
    nav.tsx              下部ナビ(単色フラットSVGアイコン)。シフト/勤務表/給与明細＋4つ目。4つ目はスマホ=
                         ハンバーガー(キャプション「その他」。タップで出退勤の記録/お知らせ/管理者へ✉️/
                         区切り線/ログアウトのポップアップ＝管理者ナビと同書式の右寄せ・ネイビー背景)、
                         iPad/PC(lg)=閉じずお知らせ/管理者へ✉️/ログアウトを直接列挙(grid lg:grid-cols-6)。
                         「管理者へ✉️」は mailto:(宛先=送信元メール, 件名「給与管理システムより」,
                         本文=会社名 管理者様/氏名です。)。お知らせに未読赤ドット
                         （localStorage `notices_seen_at` と最新お知らせ時刻を useSyncExternalStore で比較）
    timesheet/           勤務表カレンダー入力（page/ui/actions/schema）。ui.tsx の TimesheetCalendar は
                         管理者の /admin/timesheet と共用（save/del アクションと基準パスを props で受ける）。
                         入力スキーマ entrySchema は schema.ts に分離（"use server" は関数しか export 不可のため）。
                         ヘッダは ＜ 年月(text-xl) ＞ + 右肩(従業員=「勤務実績」タイトル固定/管理者=従業員セレクト)を1行に。
                         カレンダーは濃いアウトライン(border-2)＋曜日行に塗り。当日背景・祝日赤字・PC/iPad 2カラム。
                         カレンダーの曜日・日のフォントはシフト画面(ShiftSchedule)と統一（曜日=text-sm font-semibold、
                         日付=text-base font-bold sm:text-lg）。カレンダー上部の合計表示は廃止（2026-07-29）。
                         未選択時はカレンダー下(スマホ)/右(PC)に勤務一覧表(日・曜・出勤・退勤・勤務(h:mm右寄せ)・
                         交通費／日と曜は祝日/日=赤・土=青)を表示、日タップで入力枠。新規(未入力)日は最後に表示/
                         入力した内容を既定値に流用(WorkListの行や既存日を開くと既定値更新、保存時も保持)。
                         入力枠(EntryForm)はタイトル=日付のみ(「勤務記録」表記は廃止)＋右に閉じる「×」
                         (押すと勤務一覧表示に戻る)。登録/更新ボタンは枠の右下（削除ボタンと同じ行）に配置。
                         交通費は 手段/区間1/区間2/往復・片道/金額 を全入力 or 全空欄（サーバ側 refine）。
                         交通費欄の「×クリア」ボタンは廃止（2026-07-29）。
                         深夜勤務(退勤翌日, 例18:00→2:00)対応=workMinutesが end≤start に24時間加算
    payslips/            給与明細閲覧（内側 max-w-lg で狭幅維持）。2026-07-29に月度ナビ方式へ刷新
                         (page.tsx が指定月度の payslips を1件だけ取得、新設 ui.tsx の PayslipView が
                         表示・useSwipeNav で左右スワイプ)。ヘッダは ＜ 月度 ＞ + 右に「給与明細」タイトル
                         （「{氏名} 様」表記は廃止）。カード見出し行は「〜月度」(ヘッダと重複)ではなく
                         差引支給額を表示し、日別実績の一覧見出しと同色(bg-result-100)にする。支払日の
                         表示は廃止、支払済みバッジは見出し行の右上に表示。明細が無い月度は専用メッセージ。
    notices/             お知らせ閲覧（内側 max-w-lg）。開くと既読化（赤ドット消去）。上部はバージョン表記のみ
                         右寄せ（ログアウトはハンバーガーメニューへ移動済み）
  admin/                 管理者向け（レスポンシブ。md以上は左サイドバー/スマホは下部タブナビ、ネイビー）
    layout.tsx           認証ガード + ナビ（md以上=左縦サイドバー、スマホ=上部スリムヘッダー+下部タブナビ）
                         サイドバー最下部に氏名・ログアウト・ver.（NEXT_PUBLIC_BUILD_TIME）。モバイルヘッダー右上は
                         ニックネーム(未設定は氏名)のみ（ログアウトはハンバーガーへ移設）。
                         スマホは main に pb-24 を付け下部ナビと重ならないようにする
    actions.ts           signOut サーバーアクション（layout・nav から共用）
    nav.tsx              Logo / AdminSidebarNav / AdminBottomNav（現在ページをハイライト）
                         メニュー(アイコン+キャプション): ホーム(家) / 勤務表(カレンダー) /
                         給与明細(¥) / 日当(紙幣) / 従業員(人が重なる) / 配信(紙飛行機) / 設定(歯車) / 操作ログ(書類)。
                         下部タブナビはヘッダと同じネイビー背景＋白アイコン/文字（従業員ナビも同配色）。
                         **下部タブナビは position:fixed ではなくシェル(.app-shell)最下段の通常フロー要素**
                         （iOSでfixedがスクロール中に画面途中へ取り残される不具合への対策。§4「アプリシェル」参照）。
                         スマホ下部タブは主要4項目(ホーム/勤務表/給与明細/日当)＋「その他」(ハンバーガー)で、
                         従業員・配信・設定・操作ログ＋区切り線＋ログアウトを右下の最小幅カード(右寄せ)に収める。
                         「従業員」は PC サイドバーでは日当の直後に並ぶ（2026-07-26に日当と従業員の順を入替）。
                         ※「税理士資料」はメニュー・画面とも廃止（部品は close から利用）
    logs/                操作ログ閲覧(管理者)。表形式=時刻｜種別バッジ｜操作者｜詳細、1行1ログ・列揃え、
                         日替わりで太い区切り線。新しい順・最新300件。
                         種別バッジの配色は**4段階のランク制**（2026-07-19導入）。カテゴリ(action文字列)ごとに
                         色を決め打ちせず、まずランクを割り当ててからランクの色を適用する（`src/app/admin/logs/page.tsx`
                         の`RANK_BY_ACTION`/`RANK_CLASS`）。詳細は「6.2 操作ログのランク制」参照。
    loading.tsx          画面遷移中のスピナー（連打防止・iPad体感改善）
    page.tsx             ホーム=シフト表(2026-07-19に旧ダッシュボードから置換)。ShiftSchedule を editable＋
                         canSwitchMode(モード切替可)で表示。
                         右上に状態バッジ。旧 DashboardCalendar(勤務者数カレンダー)は廃止。
    shifts/              シフト表の共有部品(ShiftSchedule.tsx=管理者は常に編集可/従業員は「調整中」の月だけ
                         自分の希望を編集可。§13)と
                         サーバーアクション(assignShift/clearShift)。カレンダーの各日にニックネームを色付きチップで表示、
                         予実相違(get_shift_status が match 以外)の従業員名を太字の赤字にする。従業員側は
                         (employee)/shifts/page.tsx が同じ ShiftSchedule を使う(確定の月は読み取り専用、
                         調整中の月は editableEmployeeId=自分 で編集可)。詳しくは「8. 勤務予定・シフト管理」「13. シフトのモード」
    timesheet/           管理者用の勤務表（page/actions）。従業員用 TimesheetCalendar を共用し、
                         右上の従業員セレクトで対象を切替(?e=)、管理者は任意従業員の勤務記録を CRUD。
                         RLS の work_entries_admin(ALL/is_admin) により締め済みでも編集可(closed=false固定)
    employees/           従業員管理（登録・氏名/メール編集・時給・税区分・退職・招待・パスワード再設定・完全削除）
                         区分(管理者M/従業員E)を選んで自動採番。一覧は iPhone 考慮で「氏名/招待状態/状態」
                         の3列に集約（各セルwhitespace-nowrapで折り返し防止）、行タップで吹き出し詳細
                         (レスポンシブ)を開く。詳細トップにパスワード再設定 / 招待・再招待ボタン。
                         招待状態=未招待→招待済→登録済。詳細下部に時給・税区分の履歴編集（下記参照）
    daily/               日当設定（page/ui/actions）。給与期間ごとの「従業員×日ごと」の勤務時間・支給額一覧。
                         期間指定は給与明細画面と同じ月度単位（＜ 年月度 ＞ で前月/翌月移動・`?p=YYYY-MM`）。
                         合計枠(対象期間)は開閉式で既定は閉。CSV/印刷ボタンはその枠の中に収める。
                         従業員の見出しはニックネーム優先(未設定なら氏名)。CSVは氏名。
                         列は 日付(固定列) / 支給額 / 前払金 / 出勤 / 退勤 / 休憩 / 実働 / 深夜 / 残業 / 時給 /
                         基本給 / 深夜手当 / 残業手当 / 昼食補助 / 交通費（スマホで横スクロールせずに
                         「いくら・前払済か」を確認できるよう金額2列を日付の直後に置く）。各行の「前払済」ボタンで
                         その日の支給額を前払金として記録/取消（`setAdvancePayment`）。CSV出力・印刷対応。詳しくは「11. 日当レポート・前払金」
    close/               締め処理 + 税理士資料を統合（プレビュー・締め・支払済み・明細メール配信）。
                         タイトルは省略、期間は「締め日：{終了日}、支払日 {支払日}」の1行。操作ボタンはヘッダ部に配置。
                         締め済みは 1行目=締め解除/支払済みにする、2行目=明細をメール配信(アイコン+「従業員へ」)/
                         税理士へ(アイコン+「税理士へ」)/PDF/CSV(後2つは文字ラベルのボタン)。明細配信は0円明細を宛先除外。
                         「PDF」は**window.print()ではなくPDFダウンロード**(スマホのPWAでは印刷が動かないため。
                         2026-07-31に印刷ボタンから置換)。詳細は§11.5。
                         見出し下に 総支給/源泉所得税/差引支給 を1項目1行・濃い黒字・金額右寄せで表示。
                         表は No 省略・氏名1行・日数/勤務時間/うち深夜/うち残業/基本時給/基本給/深夜手当/残業手当/交通費/昼食補助/
                         総支給/所得税/差引支給の列順（時間は H:MM、深夜・残業0分は「―」表示。残業列は2026-07-24追加）。所得税も改行させない。
                         列数が多く横スクロールが必要なため、**左端の「氏名」列は`sticky left-0`で固定**し、
                         横スクロールしても常に見える（見出しセル・データセルとも背景色を明示＋右端に薄い影で
                         区切りを示す。2026-07-24追加）
    notices/             連絡・催促・一斉報知の送信（メニュー名「配信」・画面タイトルも「配信」）。
                         個別=管理者にCC / 一斉=管理者にも配信。フォームは sm:2カラム、送信履歴は折返し対応
    report/              税理士資料の部品のみ残置（page は廃止）。actions.ts(sendTaxReport/buildTaxReportCsv)と
                         ui.tsx(税理士メール送信=アイコン+文字 / PDF・CSV=文字ラベルのボタン)を close から利用
    settings/            メール設定（会社名/送信元/税理士 氏名・アドレスを2カラム）・シフト枠・休憩時間(3枠)・
                         勤務表ロック・昼食補助・QR打刻の位置設定+出退勤QRコード・勤務ルール文書アップロード・
                         源泉徴収税額表、の順に並ぶ（§10参照）。右上に ver.表示。税額表は「源泉徴収税額表(月額表)」
                         Web検索リンク＋手順、Excelからのタブ区切り貼付に対応（桁区切りカンマ除去→タブをカンマ化、
                         空行スキップ、数字のみ正規化）。
                         年度ごとに取り込み日時を表示。取り込みは例外安全化し body上限を5mbに拡張（next.config）
    settings/clock.tsx   QR打刻の位置設定＋出退勤QRの生成/印刷/PDFダウンロード。PC(lg以上)は地図を左2/3(縦長 lg:h-96)、
                         許容半径/圏外の扱い/丸め/保存ボタンを右1/3に配置（スクロール時の地図ズーム誤操作を軽減）。
                         印刷内容: 「{会社名}　出退勤登録用QRコード」＋大QR2つ＋説明3項目（丸め単位を反映）＋
                         下部に「アプリをスマホのホーム画面に登録しましょう」の案内文＋案内QR（28mm四方、
                         出退勤QRの70mmより小さめ・`/install`へのQR。設定画面下部にも同じQRのプレビューを表示）。
                         QR画像の縦横比は `aspect-ratio`+`object-fit:contain` で固定。
                         - **印刷**: 独立ウィンドウ方式（`handlePrint()`が`window.open("", "_blank")`で完全に
                           空の新規ウィンドウを開き、印刷内容専用の最小限HTMLを`document.write()`で書き出して
                           そこで`print()`する）。ポップアップブロック時は alert で案内。シートの高さは
                           `297mm`に固定せず`min-height:230mm`の`flexbox`にとどめ、案内QRは`margin-top:auto`で
                           その範囲内で下寄せする（出退勤QRを日常読み取る際に邪魔にならないよう配慮）。
                           iPhone/iPadを**ホーム画面に追加した状態(PWA standalone)では`window.print()`が
                           動作しない**ため、その環境を検出して「印刷」ボタン自体を非表示にする
                           （検出: `navigator.userAgent`のiPad/iPhone/iPod判定＋iPadOSがmacOSを名乗る問題への
                           対応(`navigator.platform==="MacIntel"&&maxTouchPoints>1`)＋`navigator.standalone`
                           または`matchMedia("(display-mode: standalone)")`)。
                         - **PDFダウンロード**: `html2canvas`で非表示の印刷用シート(`.qr-print-sheet`。
                           `display:flex`+`height:297mm`固定+`overflow:hidden`。印刷用シートとは別実装)を
                           画像化し、`jsPDF`でA4 1枚のPDFに貼り付けて保存する（日本語テキストはブラウザ側の
                           canvas描画に任せるため、jsPDF側に日本語フォントを埋め込む必要がない）。案内QRは
                           `margin-top:auto`でシート最下部へ正確に着地する（印刷側とは高さの扱いが異なる。
                           下記「⚠️ 印刷の実装で踏んだ罠」参照）。iPhone/iPad standaloneでも動作する代替手段。
                           依存追加: `html2canvas`/`jspdf`（動的import・クライアント側のみ・ボタン押下時にのみ
                           読み込む）。
                         **⚠️ 印刷の実装で踏んだ罠（再発防止のため経緯を残す）**: 当初は現在のページの
                         `document.body`にクラスを付けて他要素を`display:none`にする方式だったが、空白の
                         2ページ目が生成される不具合があり、独立ウィンドウ方式に変更した。それでも解消せず、
                         原因は「印刷シートの高さを`297mm`(用紙1枚分)ぴったりに固定し`@page{margin:0}`を
                         指定していたこと」（OS/ブラウザが独自に確保する印刷余白と競合し、はみ出した分が
                         2ページ目に流れ込んでいた）と判明。**印刷シートは高さを固定せず内容の実寸なりに
                         収める**方針にして解決した（PDF生成用シートは`html2canvas`経由でOSの印刷余白の
                         影響を受けないため、`height:297mm`固定のままで問題ない＝両者で扱いが異なる点に注意）。
                         詳細・試行錯誤の経緯はスキル`.claude/skills/print-and-pdf-download/`にまとめてある。
  login/                 ログイン
  register/              初回登録（メールのみ入力→マジックリンク送信）
  set-password/          マジックリンク/再設定リンク後のパスワード設定
  auth/callback/         Supabase 認証コールバック。token_hash+verifyOtp で初回登録(magiclink)・
                         再設定(recovery)を検証。setup=1/recovery で /set-password へ
  install/               スマホのホーム画面に追加してもらうための案内ページ。未ログインでもQRから直接開ける
                         よう公開（middlewareの publicPaths に追加）。`AddToHomeScreenBanner`（下記）を
                         表示するだけの薄いラッパー。設定画面「出勤・退勤QRコード」の下部・QR印刷ポスター/PDF
                         にこのページへのQRを掲載する（上記`settings/clock.tsx`参照）。
  manifest.ts            PWA マニフェスト（/manifest.webmanifest）
  pwa/
    ReloadPrompt.tsx     更新バナー（新版検知→ワンタップ更新）
    reloadApp.ts         ロゴ1タップ最新化（LogoButtonから使用）
    AddToHomeScreenBanner.tsx  ホーム画面追加の手順を端末判定して案内するバナー。iOS/Android/LINE内蔵
                         ブラウザを判定し、Android+通常ブラウザは`beforeinstallprompt`を使ったワンタップ
                         追加、iOSは共有ボタンからの手順テキスト、LINE内蔵ブラウザは外部ブラウザ
                         (Chrome/Safari)で開き直す案内を出し分ける。既にスタンドアロン起動中やPC等の対象外
                         環境では何も表示しない。**`/install`ページ専用**（アプリ全体には常設しない。下部固定
                         表示のため通常利用中は下部タブナビと重なってしまうため）。
                         iOSの案内文には**バージョン判定を行わず**「共有ボタン（画面下の□に↑のアイコン、
                         無い場合はアドレスバーを長押し）」と両方の導線を1文で併記している。iOS26（2025年秋
                         以降。Appleが暦年式に改称した新バージョン体系。旧「iOS 19」相当）でSafariの共有
                         ボタンが画面下から消えアドレスバー長押し方式に変わったが、旧バージョンとの併用期間・
                         正式リリースでのUI微調整の可能性を踏まえ、あえてUA判定で分岐しない設計にした
                         （オーナーとの合意事項）。共有アイコン自体（四角＋上向き矢印）はiOS26でも変わって
                         いないため、同アイコンを模したインラインSVG（`ShareIcon`）を案内文に併記している。
  layout.tsx             ルート（ReloadPrompt常設・viewport-fit=cover）, page.tsx, globals.css
lib/
  supabase/              client.ts / server.ts / middleware.ts
  auth.ts                requireEmployee() / requireAdmin()
  period.ts              給与期間（26日〜25日）計算・勤務分計算・todayJST()
                         WEEKDAYS/weekdayOf()（曜日）・formatRoute()（区間 ⇔/→）も提供
  period-status.ts       期間ステータスのラベル/バッジ配色（ダッシュボード・締め処理で共用）
  payroll.ts             給与計算エンジン（純粋関数）
  payroll.test.ts        Vitest テスト（20件）
  payroll-data.ts        DBから集計して計算（締め/プレビュー共通）
  email.ts               メール送信・設定取得（DB優先）・添付対応。送信成否は log.ts で操作ログに記録
  smtp.ts                Gmail SMTP 最小実装（cloudflare:sockets）・multipart添付
  log.ts                 操作ログ記録ヘルパー（`log_activity` RPC を best-effort 実行。失敗は握りつぶす）
  holidays.ts            日本の祝日取得（holidays-jp）
middleware.ts            未認証は /login へ
```

### 認証・ロール
- Supabase Auth。ログインはメール+パスワード。
- 🔴 **退職済み(`employees.status <> 'active'`)は認証に成功してもログインさせない**
  （2026-08-06）。Supabase Auth自体はDBの`status`を知らないため認証は通ってしまう。
  `login/page.tsx`が`signInWithPassword`成功後に`status`を確認し、`active`でなければ
  `signOut()`のうえ**通常の認証エラーと同じ文言**を出す（退職を理由に案内しない）。
  `lib/auth.ts`の`requireEmployee()`にも同じチェックがあり、ログイン後に退職処理された
  場合の保険になっている。
- **メールリンクは3種類とも `token_hash` + `verifyOtp` 方式に統一**（初回登録=magiclink /
  管理者発行の再設定=recovery / ログイン画面「パスワードを忘れたら」=recovery）。
- **⚠️ `/auth/callback` は検証を直接行わない（2026-07-18 に変更・重要）**: メールのリンク先は
  `/auth/callback` のままだが、ここでは `verifyOtp`/`exchangeCodeForSession` を実行せず、
  クエリパラメータをそのまま `/auth/confirm` へ302リダイレクトするだけ。実際の検証は
  `/auth/confirm`（クライアントコンポーネント）で**「続ける」ボタンが押された時**に初めて実行し、
  成功後 `setup=1` または `type=recovery` なら `/set-password` へ遷移する。
  - **理由**: Supabase監査ログで、同一の再設定トークンに対し `POST /verify` が約2分20秒差で2回
    実行され、1回目は成功・2回目が `403 One-time token not found` で失敗する事象を確認した。
    旧実装は `/auth/callback` がGETを受けた瞬間に検証（1回限りのトークンを消費する状態変更操作）を
    実行していたため、メールのセキュリティスキャナー/リンクプレビュー機能がリンクを自動で
    先読み（プリフェッチ）した時点でトークンが消費されてしまい、本人が実際にクリックした頃には
    既に無効という不具合が発生していた（症状: 再設定リンクを押すと再設定画面ではなくログイン画面が
    表示される）。ボタン押下という人の操作を挟むことで、JSを実行しない自動プリフェッチでは
    トークンが消費されなくなる。
  - 実装: `src/app/auth/callback/route.ts`（リダイレクトのみ）、`src/app/auth/confirm/page.tsx`
    （確認ボタン・検証実行・`link_employee_account`呼び出し・遷移）。
- **`code` + `exchangeCodeForSession` 経路も `/auth/confirm` 側で同様にサポート**（PKCEのため後述の
  弱点があり、現状の自前フローでは使っていないが、互換のため残置）。
- **⚠️ PKCE の落とし穴（最重要・再発注意）**: Supabase SSR は既定で **PKCE フロー**。
  `signInWithOtp` / `resetPasswordForEmail` を **PKCE クライアント**で呼ぶと、照合用 `code_verifier` が
  「発行したブラウザ」の Cookie に紐づき、メール内リンクの `token_hash` にも `pkce_` プレフィックスが付く。
  本人はメールを**別端末（スマホのメールアプリ内ブラウザ）**で開くため verifier が無く、`verifyOtp` すら
  失敗して `/login` に戻る（症状: リンクを開くと通常ログイン画面。URL は
  `.../auth/callback?token_hash=pkce_...&type=...`）。管理者発行の再設定は端末が必ず別なので特に顕著。
- **対策: メールを発行するサーバー処理は `flowType: 'implicit'` のクライアントで実行する。**
  `createClient({ flowType: 'implicit' })`（`src/lib/supabase/server.ts`）を使うと、Supabase は
  **`pkce_` の付かない端末非依存の `token_hash`** を発行し、`verifyOtp` が単独で検証できる。
  - 初回登録: `/register` はサーバーアクション `sendRegisterLink`（`register/actions.ts`）で
    `email_registered` を確認 → implicit クライアントで `signInWithOtp`（`shouldCreateUser:true`,
    `emailRedirectTo=/auth/callback?setup=1`）。未登録メールでも列挙対策のため実際には送信せず
    成功と同じ応答を返す（2026-07-18対応）。
  - 管理者発行の再設定: `resetEmployeePassword`（`employees/actions.ts`）が implicit クライアントで
    `resetPasswordForEmail`。
  - ログイン画面の自己申請: `requestPasswordReset`（`login/actions.ts`）が同様に implicit で送信。
    実際の送信失敗（レート超過など）は画面に表示する（空欄時のみ送信せず入力を促す）。
  - ログイン用の通常ブラウザ/サーバークライアント（セッション管理）は **PKCE のまま**（影響を分離）。
  - **リンク生成元のURLは環境変数 `NEXT_PUBLIC_SITE_URL` で固定**（`src/lib/site-url.ts` の
    `getSiteUrl()`）。以前はリクエストの `x-forwarded-host`/`host` ヘッダーから組み立てていたが、
    Hostヘッダー詐称（Host Header Injection）により認証リンクを攻撃者ドメインへ誘導される
    リスクがあったため2026-07-18に修正（セキュリティレビュー致命的#1、下記参照）。
- **⚠️ これは Supabase 側のメールテンプレート変更が「3つ」必須（コードだけでは直らない・再発の主因）**:
  Authentication → Emails の
  - **「Magic Link」**テンプレート →
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1`
  - **「Reset password」**テンプレート →
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1`
  - **「Confirm signup」テンプレート**（★見落としやすい・2026-07-19に発覚）→
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&setup=1`
    - **なぜ必要か**: `sendRegisterLink`（初回招待）が呼ぶ `signInWithOtp({ shouldCreateUser: true })` は、
      そのメールアドレスの `auth.users` レコードが**まだ存在しない**(＝そのメールへの初回招待、または
      従業員削除後の初回再招待)場合、Supabase内部で**「サインアップ」フロー**として扱われ、
      「Magic Link」ではなく**「Confirm signup」テンプレート**でメールが送られる。このテンプレートを
      未設定のままにしておくと既定の `{{ .ConfirmationURL }}`（Supabase自身の検証URLへの生リンク、
      PKCE同様に一度きりのトークンをリンクを開いた瞬間に消費する方式）のままになり、メールセキュリティ
      スキャナーの自動先読みでトークンが消費され「有効期限切れ」エラーになる（本セクション末尾の
      プリフェッチ問題と同根）。**2回目以降の再招待では`auth.users`が残っているため「Magic Link」に
      切り替わり症状が出ない**ことがあり、原因特定が難しい。実機テストでは Supabase 監査ログ
      （`get_logs` service=auth）で `user_confirmation_requested`（Confirm signup送信）
      → `GET /verify`（Supabase側で直接検証・303）という並びが出ていれば、このテンプレート未設定が原因。
  - 既定の `{{ .ConfirmationURL }}` のままだと PKCE リンク（`/auth/v1/verify?token=pkce_...`）になり壊れる。
    テンプレの「Reset template（初期化）」を実行すると既定に戻り再発する。**3つとも**再確認すること。
  - この認証パターンはスキル `.claude/skills/supabase-invite-auth/` に文書化済み。
- `/set-password` でパスワードを設定（`updateUser`）→ 完了。サービスロールキーは不要
  （anon/公開キー + ユーザーセッションのみ）。**過去パスワードとの一致チェックは不要方針**のため、
  Supabase(GoTrue)が返す `same_password` エラー（「以前と同じパスワード」）は成功扱いにして
  そのまま進める（同じパスワードでも再設定可）。**8文字以上・英字と数字の両方を含める・確認一致**の
  検証を実施（英数字混在は2026-07-18追加。Supabaseの「漏洩パスワード保護」機能はProプラン以上限定で
  無料プランでは利用できないため、その代替の緩和策として追加した）。
- 🔴 **アクセストークン有効期限を28800秒(8時間)に延長済み（2026-08-08、既定3600秒から変更）**:
  複数端末で同時にテストしていると、操作途中で強制的にログイン画面へ戻される事象が発生した。
  Supabase Auth ログ（`get_logs` service=auth）で `error":"Session not found"`（`session_not_found`,
  403）を実際に確認。原因は端末間の競合ではなく、**同一ブラウザ内で発生する
  リフレッシュトークンの競合(race condition)**: `src/middleware.ts` はほぼ全ページ遷移で
  `supabase.auth.getUser()` を呼び、アクセストークン期限が近い/切れていれば自動リフレッシュするが、
  Next.jsは1回の画面遷移で複数リクエスト（RSCフェッチ・プリフェッチ等）を並行送信することがある。
  アクセストークン失効タイミングでこれが重なると、複数リクエストが同じ（既に古い）リフレッシュ
  トークンを同時に使おうとし、Supabase側の「リフレッシュトークン再利用検知」機能が働いて
  そのユーザーの**全セッションが失効**する（＝再試行しても直らない・実際にログインし直すしかない
  症状と一致）。恒久対策としてリフレッシュ頻度自体を下げるため、Supabaseダッシュボード
  （Authentication → Sessions → Access Tokens → Access token expiry time）で28800秒に変更した。
  コード変更は不要。再発する場合は同ログの`session_not_found`を確認して発生頻度を評価すること。
- `requireAdmin()` で管理画面を保護。ログイン後、管理者は `/admin`、従業員は `/timesheet` へ。
- 最初の管理者: employee_no `0001`（seed 投入済み）。
- **Supabase 認証メール**: カスタムSMTP（自社Gmail）を設定済み。無料枠のままテンプレート編集が可能な状態
  （Authentication → Emails）。件名/本文は運用側で日本語化する。送信はレート制限があり、テスト連投で
  一時的に届かなくなることがある（数十分で回復）。

### 給与計算エンジン（`lib/payroll.ts`）
- `computePayslip()`: 勤務日ごとに時給を適用して基本給を日割り（分単位、日ごとに切り捨て）、昼食補助 = 勤務日数 × 定額、交通費 = 実費合計。
- **標準休憩ルール（2026-07-23導入）**: 休憩は労使合意の**標準休憩時間帯 12:00-13:00 / 19:00-20:00 / 4:00-5:00**に取る前提で計算する（`lib/period.ts` の `standardBreakMinutes()`。勤務区間に重なる休憩帯の合計）。深夜の人が休憩を5:00の前後どちらで取るかで深夜割増が変わる問題を避けるため、休憩の都度申告を廃止し原則ルールで一意に定める。**勤務時間・深夜割増とも入力された `break_minutes` は使わず標準ルールから導出**する（勤務表の休憩入力欄は廃止し、保存時・QR打刻時に標準ルールで自動計算して `break_minutes` に格納）。
- **深夜勤務手当**: 勤務時間のうち **22:00〜翌5:00** に該当する分数から**標準休憩帯ぶんを除いた**分数（`lib/period.ts` の `nightMinutes()`。特に 4:00-5:00 の休憩は深夜帯に取るため深夜割増から除外される）に対し、**時給の25%**を割増手当として基本給とは別に追加支給する（日ごとに切り捨て）。課税対象額・総支給額に含める。明細（アプリ・メール）と締め処理表・税理士CSVに深夜勤務時間/手当の内訳を表示（深夜勤務があるときのみ）。
- **残業手当（2026-07-24導入）**: **1日の勤務分数(休憩控除後)のうち8時間(480分)を超えた分**（`lib/period.ts` の `overtimeMinutes(workedMinutes)`。日ごとの `workMinutes()` の結果に適用）に対し、**時給の25%**を割増手当として基本給とは別に追加支給する（日ごとに切り捨て）。課税対象額・総支給額に含める。深夜勤務手当と同様、明細（アプリ・メール）と締め処理表・税理士CSVに残業時間/手当の内訳を表示（残業があるときのみ）。深夜割増と残業割増は独立に加算する（同じ時間帯が両方に該当する日でも二重には計算しないが、それぞれの条件を満たす分をそれぞれ計上する＝両方付く時間帯があり得る）。勤務表の予実一覧では実績行の勤務時間の後ろに `(深夜)<残業>` の順で表示する。
- `computeIncomeTax()`: 源泉所得税。
  - 課税対象額（基本給+深夜勤務手当+残業手当+昼食補助）が **月88,000円未満** → 乙欄は 3.063% 切り捨て、甲欄は 0円
  - **88,000円以上** → `withholding_tax_table`（設定画面から貼付取込。形式は国税庁公開様式に準拠: 以上,未満,甲0〜甲7,乙。乙欄のみ3列も可）を参照。取り込み済みデータは設定画面に表形式で表示。甲欄は扶養0〜7人まで参照（`Math.min(dependents,7)`）。データが無ければエラーで締めを止める（誤計算防止）。
    - 取込時、国税庁月額表の先頭にある「(最小額)円未満→0」の変則行（未満欄が空で「以上」に最小額が入る行）は**取り込み対象外**（上限なしの正当な行は最終行=最大の「以上」のみ）。その帯（=**表の最小「以上」金額未満**）は `computeIncomeTax` が**非課税(0円)**と判定する。
  - 国税庁からの自動取得は非対応（NTAは月額表をPDF/Excelでのみ公開しており安定した機械可読源が無く、当環境からnta.go.jpはネットワーク遮断のため）。年に1度、国税庁の月額表を貼り付けて取り込む運用。
- **前払金控除（2026-07-26導入）**: 当期の勤務日について `advance_payments` に記録された額の合計を `computePayslip()` の
  `advanceTotal` に渡し、**差引支給額からのみ控除**する（`net_pay = gross_pay - income_tax - advance_deduction`）。
  **総支給額・課税対象額・源泉所得税は前払金があっても変わらない**（所得の控除ではなく既払い分の精算のため、
  源泉徴収は月額表による月単位の計算のまま）。詳細は「11. 日当レポート・前払金」参照。
- テストは `npm test`（Vitest 29件）。

### メール送信（`lib/smtp.ts` / `lib/email.ts`）
- 外部ライブラリなし。`cloudflare:sockets` で smtp.gmail.com:465 に TLS 接続し AUTH PLAIN。
- 送信元・会社名（差出人名）・税理士アドレスは DB（app_settings）から取得。パスワードは env（Secret）。
- **ローカル開発では送信不可**（cloudflare:sockets は本番Workersのみ）。未設定・失敗時はエラーメッセージを返し、アプリ内通知は動作。
- 用途: ①招待メール ②パスワード再設定メール（Supabase Auth 経由）③給与明細配信
  ④連絡・催促 ⑤税理士向け資料（CSV添付）。
  - 連絡は宛先が空＝全員（一斉報知）、宛先を選べば個別。両方とも有効（種別は連絡/催促）。
    **個別連絡は管理者に CC、一斉報知は管理者にも配信**（`getAdminEmails()` を利用）。
  - 併送失敗時は失敗理由（例: アプリパスワード未設定）を画面に表示。
  - **配信メールの冒頭1行（2026-07-29追加）**: `admin/notices/actions.ts` の `sendNotice` が本文の先頭に
    宛先に応じた挨拶行を追加してから送信する。**個別**は対象従業員の`{ニックネーム（未設定なら氏名）} さん`、
    **全員**は`従業員のみなさまへ`。アプリ内お知らせ（`notifications`テーブル）にはこの挨拶行を含めない
    （メール本文のみに付与、`d.body`自体は変更しない）。
- `email.ts` は `cc?` に対応。`getTaxName()`（税理士氏名）・`getAdminEmails()`
  （is_admin=true の在籍者メール）も提供。
- 送信は一時的失敗に備え **最大2回リトライ**、SMTP応答に **15秒タイムアウト**（ハング防止）。
- 給与明細メール（`buildPayslipMailText`）は集計に加え **日別明細**（＜日別明細＞: 日付・出勤〜退勤・休憩・
  勤務時間・交通費・昼食補助）を本文末尾に付ける。日付は **MM/DD**、時刻・休憩・勤務時間は **HH:MM**（時も
  2桁ゼロ埋め）で桁を揃える。日別行は `admin/close/actions.ts` の `emailPayslips` が当期 `work_entries` と
  昼食補助日額（`allowance_settings` の期末有効値）から生成し `PayslipDailyRow[]` として渡す。
- `Message-ID` ヘッダー付き（迷惑メール判定対策）。
- **添付対応**: `smtpSendMail` は `attachments` を受け取り multipart/mixed で送信可能。

#### 税理士向け資料（`admin/report`）
- 画面に支給一覧表を表示。ボタンは3つ：
  1. **印刷 / PDF保存**（ブラウザ印刷）
  2. **CSVダウンロード**（BOM付き `payroll_YYYY-MM.csv` をBlobで保存）
  3. **税理士へメール送信**（アプリから **自動送信**。宛先=税理士、CC=送信元、CSVを添付）
- CSVの列順（税理士送付・ダウンロードとも共通の `buildCsv()`）: 従業員No/氏名/勤務日数/**勤務時間**/
  **うち深夜**/**うち残業**/**基本時給**/基本給/深夜勤務手当/残業手当/交通費/昼食補助/総支給額/源泉所得税/差引支給額/税区分
  （勤務時間・うち深夜・うち残業は H:MM。2026-07-23に深夜列、2026-07-24に残業列を追加、締め処理画面の一覧表と列構成を統一）。
- 送信ボタンはダイアログを開き、**補足事項/申し送り事項**（textarea）を入力できる。入力内容は
  本文末尾に追記される。本文に勤務データ表は載せない（数値は添付CSVに集約）。
- 宛名は **税理士の氏名 + 様**（設定の `tax_accountant_name` を使用。「税理士 御中」ではない）。
  氏名未設定時は「税理士 御中」にフォールバック。
- 実装: `admin/report/actions.ts`（`loadReport`/`buildTaxReportCsv`/`sendTaxReport(periodKey, note)`）、
  `admin/report/ui.tsx`（`SendReportButton` のモーダル + `DownloadCsvButton`）。
- （以前は mailto 方式だったが、CSV自動添付付きの自動送信に戻した。CSVダウンロードは引き続き提供。）

---

## 5. デプロイ / 運用

### デプロイ方式
- Cloudflare Workers Builds（GitHub 連携）。**main ブランチへの push で自動ビルド・デプロイ**。
- ビルドコマンド: `npx opennextjs-cloudflare build`
- デプロイコマンド: `npx opennextjs-cloudflare deploy`
- ⚠️ Cloudflare 側で過去バージョンの「Retry build」をすると、その時点のコミットで再ビルドされ、
  Plaintext 変数が消える。設定変更は必ず「最新 main の再デプロイ」または DB/Secret 側で行う。

### 環境変数
| 変数 | 置き場所 | 備考 |
|------|---------|------|
| NEXT_PUBLIC_SUPABASE_URL | wrangler.jsonc vars + .env | ビルド時にクライアントへ埋め込み |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | wrangler.jsonc vars + .env | 同上（公開キー） |
| NEXT_PUBLIC_SITE_URL | wrangler.jsonc vars + .env | 認証メールのリンク生成に使う本番URL固定値（2026-07-18追加、`src/lib/site-url.ts`） |
| GMAIL_APP_PASSWORD | **Cloudflare Secret** | Gmailアプリパスワード（2段階認証必須） |
| gmail_user / tax_accountant_email / company_name | **DB: app_settings** | 管理画面の「設定」から変更 |

### Supabase Auth 設定（本番URL）
- Authentication → URL Configuration:
  - Site URL: `https://oominami-payroll.shinsekai.workers.dev`
  - Redirect URLs: `https://oominami-payroll.shinsekai.workers.dev/auth/callback`
    （`?setup=1` 付きも同じパスなので許可される）
- Authentication → SMTP Settings: カスタムSMTP（自社Gmail）設定済み。
  これにより無料枠のままメールテンプレートを編集可能（件名/本文の日本語化は運用対応）。
- **⚠️ メールテンプレートは「3つとも」token_hash リンクに変更必須**（既定の `{{ .ConfirmationURL }}` の
  ままだと初回登録・再設定が壊れる。詳細は「4. 認証・ロール」）:
  - **「Magic Link」**（既存アカウントへの再招待・ログイン用）:
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1`
  - **「Reset password」**（パスワード再設定で使用）:
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1`
  - **「Confirm signup」**（★見落としやすい・2026-07-19に発覚。**そのメールアドレスへの初回招待時**に
    使われる。Magic Linkだけ設定して安心していると、初回招待だけがここを通り不具合が再発する）:
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&setup=1`
  - 3つとも「Reset template（初期化）」を実行すると既定に戻り再発するので注意。
- Redirect URLs に `/set-password` も登録済み（現行の token_hash 方式では `/auth/callback` 経由で
  セッションを確立してから遷移するため必須ではないが、残置しても無害）。

### 無料枠での運用
- Supabase 無料 / Cloudflare Workers 無料 / Gmail SMTP（無料枠）で運用。
- Supabase 無料プロジェクトは長期未アクセスで一時停止する点に注意（現状 cron ping は未設定 → 未実装事項参照）。

### 👤 アカウント設定画面（2026-08-06追加）
`/admin/account`（管理者）・`/account`（従業員）の2ルート。中身は共通コンポーネント
`src/app/account/AccountSettingsView.tsx` を薄い `page.tsx` から呼ぶ構成
（`DailyReportView` と同じ「共通コンポーネント＋役割ごとの薄いpage.tsx」パターン）。

- **導線**: ヘッダーの氏名/ニックネーム表示に人物アイコン（`admin/nav.tsx`の`PersonIcon`）を
  添え、タップでこの画面へ遷移する。**配置はメニューの位置に合わせて左右を変える**
  （管理者PC/タブレットの左サイドバーではアイコンが名前の左、管理者スマホの上部ヘッダーと
  従業員（常に上部ヘッダー）ではアイコンが名前の右。オーナー指定）。
- **プロフィール編集**（ニックネーム・氏名・ふりがな）: SECURITY DEFINER関数
  `update_own_profile(p_nickname, p_name, p_furigana)`経由。
  🔴 **RLSの自己UPDATEポリシー＋列単位GRANTではなく関数にした理由**: 管理者用の
  `employees_admin_all`ポリシーと本人の自己更新は**同じ`authenticated`ロール**で動くため、
  列単位GRANTで絞ると管理者が他の列（email/is_admin/status等）を更新する権限まで
  一緒に制限されてしまう。関数側で「自分の行の、この3列だけ」に固定するほうが安全。
- **通知（この端末で受け取るボタン）**: 旧`admin/settings`の`NotifySettingsForm`をここへ移設。
  **管理者・従業員の両方に表示**する（現状は従業員向けの通知は無いが、将来のための準備。
  オーナー明示）。サーバーアクションは`account/actions.ts`の
  `saveMyPushSubscription`/`deleteMyPushSubscription`（`requireEmployee()`ベース）。
- **通知種類別スイッチ（管理者のみ）**: 出勤/退勤で別々にオン/オフできる
  （`notify_missing_punch_in`/`notify_missing_punch_out`。旧: 単一スイッチ
  `notify_missing_punch`から分離）。`admin/settings`画面からは完全に削除済み。

### 🔔 未打刻通知（Web Push・2026-08-04追加）
シフトの**出勤予定を5分・退勤予定を30分**過ぎても打刻が無いとき、管理者の端末へ
**OS通知**（アプリを閉じていても届く）を送る。

- **経路**: `pg_cron`(5分ごと) → `collect_punch_alerts()` → `pg_net` で
  `POST /api/notify/punch` → Web Push 送信。
- **役割分担**: 検出・重複判定・送信先の解決は**すべてDB内のSQL**。API ルートは
  暗号化と送信だけで、**DBを一切読まない**。
  - 理由(1) Cloudflare 無料プランの CPU 10ms 制限（Error 1102 の実績あり）を避ける。
  - 理由(2) このアプリは **service_role キーを持たない**ため、サーバー側から RLS を
    越えて `push_subscriptions` を読めない。cron が購読情報ごと POST する。
- **認証**: 共有シークレット `NOTIFY_SECRET` を `x-notify-secret` ヘッダーで照合。
  🔴 **middleware の公開パスに `/api` を含めること**。含めないと cron の POST が
  `/login` にリダイレクトされ、**エラーも出ないまま通知だけが動かない**。
- **重複防止**: `punch_alerts(employee_id, work_date, kind)` が主キー。
  `insert … on conflict do nothing returning` で「今回初めて検出した分」だけを取り出す。
- **遡り上限12時間**: 機能を有効にした瞬間に過去の未打刻が一斉送信されるのを防ぐ。
- 🔴 **終了時刻は「開始＋経過時間」で求める**（終了≦開始なら+24h）。`work_date` は
  業務日付なので、深夜番(0:00〜9:00)は開始が翌日。単純に `work_date + 終了時刻` に
  すると深夜番の終了が同日9:00になり検出が壊れる。
- **鍵**: VAPID。`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`(Secret) /
  `VAPID_SUBJECT`。生成は `scripts/generate-vapid-keys.mjs`。
  🔴 **鍵を作り直すと既存の購読が全て無効**になる（各端末で再登録が必要）。
- **暗号化**: `src/lib/web-push.ts`。npm の `web-push` は Node 依存で Workers での動作が
  保証されないため **Web Crypto API のみで自前実装**（RFC 8292 VAPID / RFC 8291 aes128gcm）。
  **RFC 8291 の公式テストベクタで固定テスト済み**（`web-push.test.ts`）。
- **端末登録**: 通知は端末ごとに許可が要る。設定画面の「この端末で通知を受け取る」で購読。
  iPhone/iPad は**ホーム画面に追加した PWA からのみ**（Safari のタブでは Push 不可）。
- **Service Worker**: `push` / `notificationclick` を追加。**`fetch` は依然として横取りしない**
  ので、ナビゲーションへの影響は無い（下記の重要な教訓を参照）。

### 🔔 初回ログイン通知（Web Push・2026-08-08追加）
新しい従業員が**初回パスワード設定を完了した瞬間**、管理者の端末へPush通知を送る
（「○○さんが初回パスワード設定を完了し、利用を開始しました」）。未打刻通知と同じ設計方針を踏襲。

- **経路**: `/set-password`（`setup=1`クエリの時のみ＝初回登録フロー）で `updateUser`成功後、
  クライアントから `notify_first_login()`（SECURITY DEFINER RPC）を呼ぶ → RPC内で
  管理者の`push_subscriptions`を集め`pg_net`で`POST /api/notify/first-login` → Web Push送信。
  未打刻通知が`pg_cron`起点なのに対し、こちらは**本人操作起点**（ユーザーのブラウザ→RPC）の点が異なる。
- **`setup=1`で初回登録とパスワード再設定を区別**: `/auth/confirm`が`/set-password`へ遷移する際、
  初回登録(`setup=1`)は`?setup=1`を残したまま渡し、再設定(`type=recovery`)は付けない。
  `set-password/page.tsx`はこのクエリで分岐し、操作ログのaction文字列も
  「初回ログイン」（初回）と「パスワード設定」（再設定・従来どおり）で分ける。
  **通知は初回のみ送る**（再設定のたびに管理者へ通知が飛ぶのを避けるため）。
- **RPCが直接送信APIをpg_netで叩く**（サーバーアクション経由にしていない）理由は未打刻通知と同じ:
  このアプリは`service_role`キーを持たないため、通常のクライアント/サーバーからはRLSを越えて
  他人（管理者）の`push_subscriptions`を読めない。SECURITY DEFINER関数の中でだけ横断的に読む。
- **Vault**: シークレット`notify_secret`は未打刻通知と共用（新規登録不要）。送信先URLのみ新規に
  `notify_first_login_url`として登録（`supabase/migrations/20260808010000_first_login_notify.sql`
  末尾に復元手順あり。DR復旧時はVaultへの再登録が必要）。
- 送信APIは`src/app/api/notify/first-login/route.ts`（`src/app/api/notify/punch`と同一パターン）。
- **オン/オフスイッチ（2026-08-08追加）**: `app_settings`の`notify_first_login`キー（既定`true`）。
  `notify_first_login()`はRPC冒頭でこのフラグを確認し、`false`なら何もせず正常終了する
  （未打刻通知の`notify_missing_punch_in/_out`と同じ`coalesce(value <> 'false', true)`パターン）。
  管理者アカウント設定画面「通知対象（管理者向け）」の3つ目のチェックボックスから変更する。
- **UI配置（2026-08-08）**: 「通知対象（管理者向け）」（旧称: 未打刻通知（管理者向け）。
  出勤/退勤/初回ログインの3スイッチに増えたため名称変更）は、独立したセクションではなく
  **「通知」枠（端末の通知許可セクション）の内側にネスト**して表示する
  （`DeviceNotificationSection`が`notifyTypeSection` propとして`NotifyTypeForm`を受け取り、
  自身の`<section>`内の末尾で描画する）。端末側の通知許可が親、通知対象の選別が子という
  親子関係を画面構造にも反映させる意図（オーナー指定）。

### PWA / 自動更新（Service Worker）
ホーム画面追加した PWA で、エンドユーザーが**ロゴ1タップで最新化**でき、新版デプロイ時に
**「新しいバージョンがあります」バナー**で更新を促す仕組み。

- **最小 Service Worker**: `scripts/generate-sw.mjs` がビルド時に `public/sw.js` を生成し、
  `SW_VERSION`（git 短縮SHA）を刻印する。この SW は **`fetch` ハンドラを持たない**（＝リクエストを
  一切横取りしない）ため、App Router のナビゲーション/RSC を壊さない。役割は「更新検知」と
  `SKIP_WAITING` による有効化のみ。`activate` で旧キャッシュを掃除し `clients.claim()`。
- **更新バナー**: `src/app/pwa/ReloadPrompt.tsx`（素の `navigator.serviceWorker`）。ルート
  `layout.tsx` に常設。登録後は約1分間隔で `registration.update()` をポーリングし、`SW_VERSION` が
  変わった新版を検知するとバナー表示 → タップで `SKIP_WAITING` → **新 SW が `activated` になるのを
  待って**リロード（＋2.5秒のフォールバックタイマー）。初回インストール時は誤リロードしないよう
  `controller` の有無でガード。
  - **バナーの重複表示防止（2段構え）**: 待機中の新 SW は1つでも、`reg.waiting`/`updatefound`/ポーリング/
    `visibilitychange` の複数経路が同じ SW に対して `showBanner` を呼ぶため、以前は1デプロイで2〜3回出た。
    1. **ページ内**: 通知済みの `ServiceWorker` インスタンスを ref に記録し同一版は1回だけ通知。
    2. **リロードを跨ぐ（2026-08-02追加）**: 新 SW に `GET_VERSION` を投げて `SW_VERSION` を取得し、
       `localStorage["sw-notified-version"]` に記録する。更新ボタンを押した時と✕で閉じた時に書き込む。
  - 🔴 **なぜ2が必要か（1だけでは足りなかった実バグ）**: 以前は更新ボタンで「0.8秒後に無条件リロード」
    していた。iOS standalone は新 SW の有効化が遅く0.8秒に間に合わないことがあり、**新版が waiting の
    まま残った状態でリロード**される。すると ref がリセットされる一方 `reg.waiting` は生きているので、
    **同じ1デプロイに対してバナーがもう一度出た**。✕で閉じた場合も、記録がページを離れると消えるため
    再表示されていた。→ ①有効化を待ってからリロード、②バージョンを端末に記録、の両方で解消。
  - **「通知済み」にしても未更新のままにはならない**。この SW は `fetch` を横取りしないので、
    **アプリの中身はリロードした時点で必ず最新**になる。SW の waiting 状態はアプリのバージョンとは
    無関係で、バナーは「新しいデプロイがあるので読み直してください」の通知にすぎない。
    この前提があるので「1デプロイにつき1回だけ通知」は安全。
  - **クリックフィードバック**: 更新ボタン押下で「更新中...」に切替＋ボタン無効化（✕も一時非表示）してから
    リロードする（同一タブのリロードは無反応に見え連打されやすいため）。
- **ロゴ1タップ更新**: `src/app/pwa/reloadApp.ts` を `admin/nav.tsx` の `LogoButton` に配線
  （管理・従業員ヘッダー）。待機/インストール中の新 SW を有効化して確実に最新化する。
- **マニフェスト**: `src/app/manifest.ts`（`/manifest.webmanifest`）。`viewport-fit=cover`。
- **ビルド**: `build` は `node scripts/generate-sw.mjs && next build`。**Turbopack のまま**（重要）。
- **middleware**: `/sw.js`・`/manifest.webmanifest` は matcher から除外（未ログイン時に /login へ
  リダイレクトされると SW 登録が壊れるため）。
- **バージョン表示（ビルド時刻）**: `next.config.ts` がビルド時に JST の `yyyy-mm-dd hh:MM` を
  `NEXT_PUBLIC_BUILD_TIME` として埋め込み、管理サイドバー最下部（PC/iPad）に `ver.…` を表示する。
  端末が最新版を取り込めたか一目で確認できる（更新デバッグの最重要シグナル）。表示用のこの値と、
  更新検知用の `SW_VERSION`（git SHA）は独立している。
- **PWA アイコン**: iOS/macOS Safari はホーム/Dock アイコンに SVG を使えないため、PNG を用意している。
  `public/icon-192.png` / `public/icon-512.png` / `src/app/apple-icon.png`（`scripts/generate-icons.mjs`
  が `public/logo.svg` から sharp で生成・白背景でflatten）。`manifest.ts` は PNG を参照。
- **更新バナーの iOS 対応**: `navigator.serviceWorker.controller` は iOS standalone で null になり得るため、
  `reg.waiting`/`reg.active` で検知し、`visibilitychange` でも更新チェックする。

> ⚠️ **Cloudflare Workers + opennext での重要な教訓**（過去に本番障害を起こした）
> - `@serwist/next` の `defaultCache` は**ページ遷移/RSC を横取り**し、この環境では全メニュー遷移が
>   「This page couldn't load」で失敗する（リロードでのみ復帰）。**使用禁止**。SW は fetch 非介入に保つ。
> - `@serwist/next` は webpack ビルドを要求し、Next16 既定の Turbopack から切り替わること自体もリスク。
>   本構成は Serwist を使わず Turbopack を維持している。
> - iOS standalone は SW 更新の反映が鈍い。壊れた SW を配ってしまった場合は、`/sw.js` を自己解除する
>   **キルスイッチ SW**（unregister＋全キャッシュ削除＋再読込）に差し替えて回収する。

---

## 6. 既知の制約・注意点
- メール送信はローカル不可（本番のみ）。動作確認は本番デプロイ後に行う。
- 新規宛先へのメールは受信側で迷惑メール判定されやすい（特にiCloud）。初回は迷惑メール確認を案内。
- 給与計算は「時給制アルバイト・源泉徴収のみ」を対象。社会保険・年末調整は対象外。
- 源泉徴収税額表は年度ごとに管理画面から取り込む必要あり（88,000円以上の該当者が出る場合）。
- Supabase無料プランでは「漏洩パスワード保護（Leaked Password Protection）」が使えない
  （Attack Protectionでオンにしても "available on Pro Plans and up" で保存失敗する）。
  代替として`/set-password`にアプリ側で英数字混在の必須化を実装済み（下記「6.1 セキュリティ」参照）。

### 6.1 セキュリティ（2026-07-18 レビュー・対応済み）
外部からのセキュリティレビューを実施し、致命的1件・危険4件・勧告5件を洗い出して全件対応した。
詳細な経緯・調査ログ・対応メモは `docs/security-review-2026-07-18.md` を参照（今後の追加レビュー
はこのファイルに追記していく運用）。設計に影響する主なポイントのみここに要約する。

- **認証リンクのHostヘッダー依存を廃止**（致命的）: 初回登録・パスワード再設定メールのリンク先を
  リクエストヘッダーではなく`NEXT_PUBLIC_SITE_URL`（固定値）から生成するよう変更
  （`src/lib/site-url.ts`）。Hostヘッダー詐称によるアカウント乗っ取りリスクを解消。
- **セキュリティヘッダーの追加**: `next.config.ts`に`X-Frame-Options`・`X-Content-Type-Options`・
  `Strict-Transport-Security`・`Referrer-Policy`・`Permissions-Policy`を設定。
- **DB権限の最小化**: `delete_employee`・`count_employee_work_entries`・`get_clock_settings`の
  anon実行権限を剥奪し`authenticated`のみに限定（いずれも常にログイン後にしか呼ばれないため機能影響なし）。
- **`log_activity`のフラッド対策**: 未ログイン由来の呼び出しが1分間に20件を超えると記録をスキップ
  （登録/パスワード再設定申請フローに必要なanon実行権限自体は維持）。
- **依存脆弱性の解消**: `package.json`に`"overrides": {"postcss": "^8.5.10"}`を追加し、Next内部に
  バンドルされた脆弱なpostcssを固定。`npm audit`は0件。
- **パスワードポリシー強化**: 8文字以上に加え英字・数字の両方を必須化（`set-password/page.tsx`）。
- **一般ユーザー向けエラーメッセージの汎用化**: 打刻（`clock/actions.ts`）で生のDBエラー文を画面表示
  せず、汎用メッセージ+`logActivity`でのサーバー側記録に変更。
- **アカウント列挙対策**: 初回登録申請（`sendRegisterLink`）も未登録メールで成功と同じ応答を返すよう
  統一（`requestPasswordReset`と同じ設計）。
- **認証リンクのプリフェッチ耐性**（レビュー後に別途発見・対応）: `/auth/callback`での即時トークン
  検証をやめ、`/auth/confirm`でのボタン押下後にのみ検証するよう変更。詳細は「4. 認証・ロール」参照。

### 6.2 操作ログのランク制（2026-07-19導入）

`/admin/logs` のバッジ配色は、カテゴリ(action文字列)ごとに個別の色を決め打ちするのではなく、
まず**4段階のランク**を割り当て、ランクに応じた色を適用する方式にしている
（`src/app/admin/logs/LogsView.tsx` の `RANK_BY_ACTION`／`RANK_CLASS`。2026-08-08に`page.tsx`から
分離。理由は下記「日単位トグル・カテゴリ絞り込み」参照）。新しいログカテゴリを追加する際は、
まずこの4ランクのどれに該当するかを判断してから `RANK_BY_ACTION` に追記すること（個別に色を決めない）。

| ランク | 色 | 意味 | 該当カテゴリ |
|--------|-----|------|-------------|
| 1. ルーチン | グレー（`bg-gray-100 text-gray-600`） | 必要に応じて参照する日常操作の情報 | ログイン、打刻、ログ削除（90日超過分の自動間引き） |
| 2. イベント | ブルー（`bg-blue-50 text-blue-700`） | 不定期に発生する重要な作業 | パスワード設定、**初回ログイン**（2026-08-08追加。初回パスワード設定完了）、メール送信、削除（従業員の完全削除） |
| 3. 警告 | オレンジ（`bg-amber-50 text-amber-700`。**従来「パスワード設定」に使っていた色をそのまま踏襲**） | 管理者として注視すべき状況 | 打刻拒否（圏外・reject方針）、圏外打刻（警告のみ方針で通した分） |
| 4. エラー | 赤（`bg-red-50 text-red-700`） | システム例外・処理失敗など管理者対応/復旧が必要な状況 | DB書き込み失敗（出勤/退勤打刻・従業員削除等）、締め処理失敗、税額表取込失敗、メール送信失敗（サービスから返されたエラー） |

**日単位トグル開閉・カテゴリ絞り込み（2026-08-08追加）**: `/admin/logs`はサーバーコンポーネント
（`page.tsx`、`requireAdmin()`＋データ取得のみ）から表示用クライアントコンポーネント
`LogsView.tsx`を分離し、UI操作用の状態（開閉中の日・選択中カテゴリ）はクライアント側に持たせている。
- **日単位グループ化**: JST日付でグループ化し、日付ヘッダー（▼アイコン・件数バッジ、背景
  `bg-gray-200`/hover`bg-gray-300`でコントラストを強めている・2026-08-08）をクリックで開閉。
  **既定で「8日以前」（今日を含め9日目以降）の日は閉じた状態にする**（2026-08-09追加。
  `jstDaysAgo()`でJST暦日ベースの日数差を計算し、`collapsedDays`の初期値を`useState`の
  遅延初期化関数で構築する。手動でトグルした日はその操作が優先される＝自然に上書きされる）。
- **カテゴリ絞り込み**: 取得済みログから実際に存在するaction文字列を集めてプルダウンの選択肢にする
  （固定リストではない）。「すべて」既定。絞り込みはグループ化の**前**に適用するため、
  カテゴリを絞ると該当しない日はそもそも表示されない。
- **詳細列は折り返さない（2026-08-09追加）**: iPhoneで詳細欄の文字列が縦に折り返され読みにくい
  という指摘に対応。テーブルの`w-full`を外し、詳細`<td>`にも`whitespace-nowrap`を付けて、
  はみ出す場合は`overflow-x-auto`の横スクロールに任せる形にした（折り返しよりスクロールを優先）。

- 未知のカテゴリ（`RANK_BY_ACTION` に無い action 文字列）は既定でルーチン扱い（グレー）にする。
- 「削除」（従業員の完全削除）は本来アプリの意図した操作だが不定期かつ重要なため**イベント**に分類し、
  「打刻拒否」「圏外打刻」のような**異常系（管理者が注視すべき状況）とは区別**している
  （システムの正常動作としての削除 vs. 想定外の状況を示す警告、という違い）。
- 「エラー」ランクは**真のシステム例外専用**とする方針（2026-07-19に明確化）。当初は「打刻拒否(圏外)」も
  「エラー」で記録していたが、これは運用上想定内の状況であり管理者の復旧対応を要しないため「警告」ランクの
  専用カテゴリに切り出した（詳細はハンドオーバー参照）。

---

### 6.3 ログイン時の端末情報記録（2026-07-27追加）

操作ログの「ログイン」に、**起動方法 / デバイス / OS / ブラウザ**を併記する
（例: `staff@example.com / PWA / iPhone / iOS 18.5 / Safari 18`）。
問い合わせ（「アプリが更新されない」「打刻できない」等）のときに利用環境を追えるようにするため。

- **PWA（ホーム画面アプリ）かブラウザかは User-Agent では判別できない。**
  display-mode は表示中のウィンドウの状態でリクエストヘッダーには乗らず、`Sec-CH-UA-*` にも
  標準ヘッダーが無い。したがって**サーバー側では判定不可**で、ログイン画面のクライアント側で
  `navigator.standalone`（iOS Safari）と `(display-mode: standalone|minimal-ui|fullscreen)` を見て判定する。
- デバイス・OS・ブラウザは `navigator.userAgent` から推定（`lib/client-info.ts` の `parseUserAgent()`。純粋関数）。
  **判定順が重要**: Edge は UA に "Chrome" を、Chrome は "Safari" を含むため **Edge → Chrome → Safari** の順に見る。
  iOS 上の Chrome/Firefox/Edge は CriOS/FxiOS/EdgiOS を名乗る（中身は WebKit）。
- **iPadOS 13以降は既定で `Macintosh` を名乗る**ため UA だけでは Mac と区別できない。
  `navigator.maxTouchPoints > 1` の Mac を iPad とみなす（`clock/ui.tsx` の PWA 判定と同じ手法）。
- ログイン処理はクライアントから `log_activity` RPC を直接呼ぶ作りのため、記録は
  `login/page.tsx` の `handleSubmit` 内で組み立てる。**記録の失敗はログインを妨げない**（try/catch で無視）。
- 実装: `lib/client-info.ts`（`parseUserAgent`/`describeClient`/`formatClientInfo`）、`login/page.tsx`。
  テストは `lib/client-info.test.ts`（主要UAの判定・9件）。


## 7. QR打刻（実装済み・運用テスト中）

> ステータス: **実装済み**（本番反映・運用テスト中）。目的は「従業員の入力の手間・誤入力の低減」。
> 偽装対策は厳密に求めず、「見られている」という抑止感を与えられれば十分。運用前のため
> **環境トラブルに融通が効く（打刻に失敗しても後から手修正できる）ゆるめの設計**を優先している。
> 主な実装ファイル: `src/app/clock/{page,ui,actions}.ts(x)`（打刻）、`src/app/admin/settings/clock.tsx`
> （地図ピン留め・半径・圏外時の扱い・丸め・QR生成/印刷）、`src/app/admin/settings/actions.ts`
> の `updateClockSettings`、DB: `clock_events` / 関数 `get_clock_settings()` / `app_settings` の clock_* キー。

### 7.1 概要・フロー
- 職場に **出勤用QR** と **退勤用QR** を掲示（印刷）。各QRは固定URLを埋め込む。
  - 出勤: `https://<host>/clock?type=in`
  - 退勤: `https://<host>/clock?type=out`
- 従業員はスマホ標準カメラでQRを読む → URLがPWA/ブラウザで開く（未ログインならログイン後に戻す）。
- `/clock` は確認画面（氏名・出勤/退勤・**サーバー時刻**・位置取得の可否）を表示し、**OKで確定**。
- 確定時、**サーバー側の現在時刻（JST）**で `work_entries` に打刻する（クライアント時刻は信頼しない）。
- QR画像は設定画面で生成・印刷できるようにする（アプリ内でQR生成、外部サービス不要）。

### 7.2 打刻ルール（出勤/退勤・日付境界・休憩）
- **時刻はその時点をそのまま打刻**する（丸めなし。丸めが必要なら後日ポリシー追加）。
- **出勤QR（type=in）**: 当日の勤務レコードを作成し `start_time` をセット。
  **同日に既に出勤済み（start あり）の場合、2回目以降はエラー**（誤操作防止。修正は勤務表から）。
- **退勤QR（type=out）**: **直近の「未退勤」レコード**（start あり・end なし。目安として直近18時間以内）に
  `end_time` をセットする。これにより **20:00〜翌5:00 のような日跨ぎ**でも出勤側レコード（前日日付）に
  正しく紐づく。未退勤レコードが無い場合はエラー表示（手入力を案内）。
  - **退勤QRは繰り返し可**：既に退勤済みでも押した時刻で `end_time` を上書きし、勤務時間・休憩を**再計算**する
    （早/遅退勤の訂正に対応）。
  - 勤務時間の計算は既存の `workMinutes`（end≤start は翌日として+24h）をそのまま利用。
- **休憩の自動入力**: 退勤時、`end_time - start_time`（日跨ぎ補正込み）の**総時間が6時間以上なら
  `break_minutes = 60`**、未満なら 0 を自動セット（退勤のたび再計算）。**あとから勤務表で修正可能**。
- **時刻の丸め**: 設定 `clock_round_min`（分）で丸める。**出勤=切り上げ / 退勤=切り捨て**
  （例: 30分なら 8:45→9:00、18:50→18:30）。0または1で丸めなし。打刻確認画面に「HH:MM 出勤/退勤 とみなします。」
  として丸め後のみなし時刻を表示する。
  - 🔴 **出勤の切り上げは24:00をまたぐことがある**（例: 23:50・丸め30分 → 24:00 = 翌日0:00）。
    `roundTime()`（`clock/actions.ts`）はこの場合 `dayOffset=1` を返し、**実日付**を1日進める
    （2026-08-01に発見・修正。以前は当日23:59にクランプしており誤りだった。
    **2026-08-02に本番実データで動作確認済み**: 23:53:24の出勤打刻が翌日0:00として記録された）。
    そのうえで `businessDateOf()` で業務日付に変換して保存するため、**23:50打刻→丸めて翌0:00→
    業務日付は打刻当日に戻る**（0:00は5時より前のため）。§「業務日付」参照。
    **同じロジックが確認画面用に `clock/ui.tsx` にも重複しており、直すときは両方直すこと**
    （`"use server"`ファイルは非asyncをexportできないため共有関数化していない）。
- **退勤の紐付け対象**: ①当日以前で未退勤(end なし)の直近レコード → ②無ければ当日のレコードに上書き。
  **未来日の別レコードには書かない**（当初 max(work_date) を拾って別日を上書きする不具合があり修正済み）。

### 7.2.1 退勤時刻ブランクの許容（重要な仕様変更）
- 出勤だけして**退勤QRを押し忘れる**ケースを許容する。**`work_entries.end_time` を NULL 許容に変更**が必要
  （現状は NOT NULL のため、この変更なしでは出勤のみの打刻を保存できない）。
- 退勤ブランクのレコードは:
  - **入力画面（勤務表の入力欄）・カレンダー・勤務一覧の退勤フィールドを黄色などで警告表示**（未退勤を可視化）。
  - 勤務時間・給与は退勤が無いと計算できないため、**締め処理では「計算できない従業員」として扱う**。
- 既存の勤務時間集計（`workMinutes`／`payroll`／ダッシュボード等）は **end_time が NULL の行を除外/未計算**として
  扱うよう改修が必要（NULLで落ちないようにする）。

### 7.2.2 締め時の未入力チェック
- 締め処理は既に「計算できない従業員がいると締められない」動作（`closePeriod` がエラー列挙）を持つ。
- 退勤ブランクのレコードがある従業員を**未入力として列挙し、エラーメッセージで表示**する
  （例:「退勤未入力の従業員がいます: 山田(7/3, 7/10) …。勤務表で退勤を入力してください」）。
  → 締めを止めることで未入力の取りこぼしを防ぐ。

### 7.3 位置情報（記録＋任意チェック）
- OK時にブラウザ **Geolocation API**（HTTPS必須＝充足）で緯度経度・精度を取得して記録する。
  許可されない場合は座標なしで打刻（＝**未許可でも打刻はできる**。記録は「位置なし」）。
- 設定画面（管理者）で以下を指定:
  - **基準位置**：**地図から座標をピン留め**して保存する（外部ジオコーディングAPIには依存しない）。
    - 地図は**完全無料・オープンな構成**：地図ライブラリ **Leaflet**（OSS）＋ **OpenStreetMap のタイル**（無料）。
      有料APIキー不要。実行環境（Cloudflare）側の外部通信も不要（タイルは利用者ブラウザが直接取得）。
    - 補助として「**現在地を取得してピンを置く**」ボタン（Geolocation）も用意。表示用に住所ラベルは不要（座標のみ保存）。
    - 保存時に **緯度経度を `app_settings` に確定**（住所→座標の変換は行わない）。
  - **許容半径（m）**
  - **圏外時の扱い**: `打刻拒否` / `警告のみ`（＝打刻は通すが要確認フラグを付ける）の二択
- 判定は基準座標からの距離が許容半径超なら「圏外」。`警告のみ`なら記録して管理者ログ/一覧で確認、
  `打刻拒否`なら確定させない（従業員には手入力を案内）。位置未許可は「圏外」とは別扱い（記録のみ）。
  - 圏外メッセージ/ログの**距離表示は 1000m 超で km 換算**（小数第1位、`約 #0.0 km`。1000m以下は `約123m`）。
    `src/app/clock/actions.ts` の `formatDistance()`。
  - **圏外で打刻拒否になった場合、確認画面のOKボタンをグレーアウトして再押下できなくする**（2026-07-19追加）。
    同じ場所からの再試行では結果が変わらないため。`ClockResult.blocked`（`true`のとき再試行不可）を
    `punchClock()` が返し、`ClockConfirm`（`src/app/clock/ui.tsx`）がボタンを`disabled`＋灰色表示にする。
  - **操作ログの分類**（2026-07-19追加・その後ランク制に整理): 「警告のみ」ポリシーで圏外のまま打刻が通った
    場合は「打刻」（ランク=ルーチン）ではなく**「圏外打刻」**、`打刻拒否`ポリシーで打刻を拒否した場合は
    **「打刻拒否」**で記録する。どちらもログのランク制（「6.2 操作ログのランク制」参照）で**ランク3=警告
    （オレンジ）**に分類される。当初は打刻拒否を「エラー」（ランク4）で記録していたが、運用上想定内の状況
    （管理者の復旧対応を要しない）であるため警告ランクに訂正した。
- 割り切り: 屋内GPS誤差・位置偽装は防ぎきれない。**サーバー時刻で時刻改ざんは防止**でき、位置は主に抑止目的。

### 7.4 想定するDB追加（実装時）
- `clock_events`（打刻の監査ログ・追記専用）: `employee_id`, `type`(in/out), `event_at`(timestamptz),
  `work_entry_id`(紐付け先), `latitude`, `longitude`, `accuracy`, `distance_m`, `out_of_range`(bool),
  `location_denied`(bool), `user_agent`。→ ここから `work_entries` に反映。
- `work_entries` の **`end_time` を NULL 許容に変更**（退勤ブランクの許容。7.2.1）。打刻由来の補助列（任意）:
  `clock_in_at` / `clock_out_at`（打刻時刻の原本保持）等。
- `app_settings` に位置ポリシー: `clock_base_lat` / `clock_base_lng`（地図ピン留めで確定）/
  `clock_radius_m` / `clock_out_of_range`(reject|warn) / `clock_round_min`(丸め分) を追加。住所文字列は保持しない（座標のみ）。
- **⚠️ `app_settings` は管理者のみ SELECT 可**のRLS。打刻は従業員セッションで実行され直接読めないため、
  **`get_clock_settings()`（SECURITY DEFINER・clock_* のみ返す・authenticated に実行付与）**経由で取得する。
  `/clock` の位置有無判定・丸め・位置判定はすべてこの関数の値を使う（直接 `app_settings` を読むと空になる）。

### 7.5 画面・その他
- `/clock`（確認・OK。type と位置取得を扱うクライアント＋確定はサーバーアクション）。
- 設定画面: QR生成・印刷、基準住所/半径/圏外時の扱い。
- （任意）管理者向けに「圏外・位置未許可の打刻」一覧、または操作ログ（`activity_logs`）へ打刻・圏外を記録。
- 融通のための原則: **打刻はあくまで補助入力**で、勤務表からの手修正を常に許す（打刻失敗＝勤怠不能にしない）。
- **圏外打刻エラー時の管理者連絡（2026-07-22）**: 圏外等で打刻不可(`result.blocked`)の確認画面に
  「✉️ 管理者にメール」ボタンを表示。従業員メニューの「管理者へ✉️」と同一の`mailto:`（宛先=`gmail_user`、
  件名「給与管理システムより」、本文=会社名 管理者様/氏名）。`clock/page.tsx`が`get_contact_settings`で
  会社名・送信元メールを取得し`ClockConfirm`へ渡す。
- **印刷/PDFポスターの表記（2026-07-21）**: QRコード下の説明文は「①出勤/退勤時にそれぞれのQRを読み取る
  ②位置情報の確認が出たら必ず『許可』をタップ ③この職場以外からは記録できない」の3点。出勤/退勤QRは
  印刷・PDFとも**画像55mm・QR間の間隔28mm**（`clock.tsx`の`handlePrint`インラインCSSと`globals.css`の
  `.qr-print-code`系を同値で同期）。QRを小さく間隔を広くしたのは、カメラで**片方だけを読み取りやすくする**ため。
  ページ高さ制約（印刷`min-height:230mm`／PDF`height:297mm`。空白2ページ目対策は
  `.claude/skills/print-and-pdf-download/`参照）は縮小により余裕が増える方向のため影響なし。
- **打刻完了画面のPWA誘導（2026-07-21）**: iOSのSafariには「リンクタップやQR読み取りを自動でホーム画面PWAへ
  渡す仕組みが無い」ため、Safariで開いた打刻完了画面から`/timesheet`へ遷移してもSafariのまま（PWAで開けない）。
  そこで`navigator.standalone`/`matchMedia("(display-mode: standalone)")`でスタンドアロン判定し、
  **スタンドアロン時のみ「勤務表を開く」リンクを表示**、Safari等ではリンクの代わりに「アプリをホーム画面に
  登録している場合は、そこから勤務表やシフト表を見ることができます。」の案内文を表示する（`clock/ui.tsx`）。
  打刻自体はPWA未登録でも常に可能（この判定は表示の出し分けのみ）。

### 7.7 打刻時の交通費入力（2026-07-19追加）
- QRの出勤・退勤どちらの確認画面でも交通費（手段・区間From/To・往復/片道・金額）を入力できる（開閉式）。
- **最も最近の交通費入力（`work_entries` で `transport_cost>0` かつ区間ありの直近1件）をデフォルト表示**する
  （`clock/page.tsx` が取得し `ClockConfirm` に `transportDefault` で渡す）。
- 保存条件: 手段・区間From・区間To・金額(>0) が**すべて揃った時のみ** `work_entries` に反映
  （`clock/actions.ts` の `transportFields()`）。揃っていなければ交通費は書き込まない（退勤時は既存を消さない）。

### 7.6 決定事項・未決事項
- **決定**: 基準位置は**地図ピン留めで座標保存**（外部ジオコーディングAPI不使用）。地図は
  **Leaflet＋OpenStreetMapタイル（完全無料・キー不要）**。
- **未決**: 未退勤のまま日付が変わった場合の扱い（自動締め切りの要否／退勤ブランクのまま許容で十分か）。
- **要確認（実装時）**: OSMタイルはブラウザが直接取得するため、アプリの CSP／PWA(サービスワーカー)設定で
  `tile.openstreetmap.org` への接続・画像読み込みを許可する必要がある（Leaflet はバンドルして自ホストから配信）。
- QRの固定URLゆえ「その場にいなくても開ける」点は許容（位置チェックで抑止）。

---

## 8. 勤務予定・シフト管理（2026-07-19追加）

従業員の勤務予定を登録してシフト調整を明示化し、締め時の予実（予定と実績）の食い違いチェックを容易にする機能。

### 8.1 シフト枠（内部キー A/B/C、既定表示名は早番/遅番/深夜）
- 1日3枠の交代制。DB上の枠キーは固定で `A`/`B`/`C`、既定の表示名・時刻は **早番 8:00-17:00 / 遅番 15:00-0:00 / 深夜 0:00-9:00**。
- 枠のラベル・時刻は `app_settings`（`shift_slot_{a,b,c}_{label,start,end}`）に保存し、
  **管理画面「設定」→「シフト枠」から編集可能**（`updateShiftSlots`）。
- **夜中0時は「0時」に統一**（"24:00"表記は廃止）。`normalizeSlotTime()`（`src/lib/shifts.ts`）が
  "24:00"→"0:00" に変換し、表示（`parseSlots`/`buildShiftMap`/`slotHourRangeLabel`/`customTimeParen`）も
  保存（`updateShiftSlots`/`assignShift`）も0時基準に統一。既存DB値・既定シード値も 0:00 に更新済み
  （マイグレーション `20260724_normalize_midnight_zero.sql`）。`<input type=time>` や比較用には
  `toInputTime()`/`norm_hhmm()` で "00:00" 等に正規化する。※これらは元々 `% 24` で 24:00 と 0:00 を
  同一視するため、0時統一は表示のみで予実突き合わせ・給与計算の結果を変えない。

### 8.2 シフト予定表（ホーム画面）
- 管理者ホーム(`/admin`)を**シフト表に置換**。従業員も `(employee)/shifts`(`/shifts`・下部ナビに「シフト」タブ追加)で閲覧可能。
  ※2026-07-27に「確定/調整中」モードを追加し、**調整中の月は従業員も自分の希望を入力できる**ようになった(§13)。
- **月の区切りを「1日始まり(暦月)」か「26日始まり(給与期間)」で切替可能**（設定画面「シフト枠」の
  チェックボックス`shift_month_start`。既定=オフ=26日始まり）。**勤務表(給与計算)は常に26日始まりのまま**で、
  この設定はシフト予定表のカレンダー範囲にのみ影響する。期間は `lib/period.ts` の `shiftPeriodFor(p, monthStart)`
  が `monthPeriodOf`（暦月）か `periodOf`（給与期間）を選ぶ。期間キーはどちらも "YYYY-MM" なので
  前後移動(`adjacentPeriodKey`)は共通。フラグは `loadShiftData` が `get_shift_settings`（従業員も読める
  SECURITY DEFINER・`shift_month_start` を返却対象に追加）から読み、期間を決めてから割当を取得する。
- 給与期間カレンダーの各日に、枠（早番/遅番/深夜）ごとの担当者を**ニックネーム**の色付きチップで表示
  （全員が全員のシフトを閲覧可。**調整中の月も表示は全員分**＝§13）。
- カレンダーのセルは**縦位置で枠を表現**（上段=早番/中段=遅番/下段=深夜）し、
  各人を**横幅いっぱいの色帯＋ニックネーム**で表示（実運用の紙カレンダーに合わせたレイアウト）。
- 予定入力は**管理者のみ**（日をタップ→従業員ごとに枠を選択/解除）。今後の運用で入力者を変える可能性あり。
- カレンダー上部は、編集可能な画面(管理者)のみ「日をタップしてシフトを指定してください」を表示。
  **カレンダーの直下**に、枠の時刻一覧（早番 8〜17時、遅番 15〜0時、深夜 0〜9時。**時(HH)のみの短縮表記**=
  `slotHourRangeLabel()`）と、続けて「太字＝実績入力済み。赤太字＝予定と実績が相違」を表示（枠なしテキスト。
  従業員・管理者どちらの画面にも共通表示）。以前はシフト編集パネル内にのみ表示していたが、従業員も枠時刻を
  確認できるようカレンダー直下（両画面共通）に移した。ホーム画面上部の期間ステータスバッジ（受付中/締め済み等）は
  2026-07-19にシフト予定表へ置換した際に廃止済み。
- **本日のセル強調（2026-08-09、勤務表カレンダーの書式に統一）**: 選択されていない本日のセルは
  `bg-gray-200`＋`ring-2 ring-gray-400`（従来は`bg-gray-100`のみで枠が無く目立たなかった）。
  選択時は従来どおり`ring-2 ring-blue-500`が優先される。`(employee)/timesheet/ui.tsx`の
  `TimesheetCalendar`と同じ配色パターン。
- カレンダーのセルは日付を**中央寄せ・大きめのフォント**で表示し、曜日見出しも大きめのフォントにしている
  （旧: ダッシュボードのカレンダーは日付右寄せ・小さいフォントだったが、勤務表カレンダーのスタイルに合わせた）。
  **セルの余白は最小限**（margin無し・padding無し、区切りは細い border のみ）にして、ニックネーム＋変則時刻
  短縮表記（例「けーやん20〜」）が5文字程度まで収まるようにしている。隣接セルとほぼ接するレイアウトを許容。
- **ニックネームのフォント表示区分**（`nicknameStyle()`）: 実績未入力(missing)は通常フォント、
  実績が予定と合致(match)は**黒字の太字**、実績と不一致(timediff/unplanned)は**赤字の太字**。
- **本日限定のフォント表示（`todayNicknameStyle()`・2026-08-09追加）**: 上記の`nicknameStyle()`は
  「実績が確定した後」の予実比較のため、出勤前・出勤中（退勤前）は常に"missing"＝通常フォントになり、
  遅刻や無断欠勤が視覚的に何も表現されない問題があった（オーナー指摘）。**本日の日付のみ**、
  以下のルールを`nicknameStyle()`より優先して適用する（出退勤とも打刻済みなら`nicknameStyle()`に
  フォールバック＝rule 4）:
  - 出勤予定時刻を過ぎても出勤が未打刻（かつ退勤予定時刻はまだ過ぎていない）→
    **赤字の太字**（`mismatch`と同じ見た目）
  - 出勤済み・退勤予定時刻+30分以内で退勤が未打刻 → **黒字の太字**（`match`と同じ見た目）
  - 退勤予定時刻を30分以上過ぎても退勤が未打刻 → **赤字の細字**（新設の`"overdue"`区分。
    太字にしないことで「相違が確定した赤太字」と区別する）
  - 出勤予定・退勤予定とも過ぎてなお出勤の打刻すら無い → **通常フォント**（既に終わった過去の
    欠勤として扱い、いつまでも赤字表示され続けないようにする。2026-08-09に境界条件を追加）
  - `get_shift_status()`のRPCを拡張し、予実カテゴリ(status)に加えて予定/実績の生時刻
    （`planned_start`/`planned_end`/`actual_start`/`actual_end`）も返すようにした
    （`supabase/migrations/20260809000000_shift_status_raw_times.sql`）。
  - 予定時刻→実時刻の変換は未打刻通知`collect_punch_alerts()`と同じ「開始が0〜5時台なら翌日扱い」
    ルールを`scheduleWindow()`（`src/lib/shifts.ts`）としてTS側に複製した（深夜番の日またぎに対応）。
  - 「現在時刻」はクライアント側（`ShiftSchedule.tsx`）で1分ごとに更新する`state`として持つ。
    初回描画時はSSRとの`hydration`不一致を避けるため`null`とし、本日も通常ルールにフォールバックする
    （マウント後に確定して切り替わる）。
  - 🔴 **「本日」の対象日は当日だけでなく前日の業務日付も含める（2026-08-15にオーナー報告で発覚・
    修正）**: `work_entries`は打刻時に`businessDateOf()`で「業務日付」を決めており、
    0〜5時台に始まる深夜番の勤務は**打刻した日ではなく前日の日付**で記録される（打刻ロジックと
    同じ規則。`src/app/clock/actions.ts`参照）。`shift_assignments`側もこの規則で作成されるため、
    たとえば深夜番(0:00〜9:00)で「8/14」に割り当てられた勤務は、実際の壁時計では8/15の0:00に
    開始する。従来は`date === today`のみを対象にしていたため、日をまたいで進行中の深夜勤務が
    （本日＝8/15のセルではなく前日＝8/14のセルに載っているため）対象外になり、通常の
    `nicknameStyle(status)`（実績未完了＝`timediff`→赤太字）にフォールバックしてしまっていた
    （＝進行中で黒太字になるべきなのに赤太字になるバグ）。`styleFor()`で対象日を
    `today`と`previousDate(today)`の2日に広げて解決。あわせて`todayNicknameStyle()`の
    「出勤予定超過・未打刻→mismatch」判定に**退勤予定時刻を過ぎたら打ち切る上限**を追加し、
    前日側まで対象を広げたことで遠い過去の欠勤まで赤字表示され続けないようにした。
- 各割当に**変則勤務時間**（`shift_assignments.custom_start`/`custom_end`。例「20:00」）を任意で設定でき、
  入力時は枠の既定時刻を上書きして予実判定（`get_shift_status`）に使う。カレンダーのチップには
  変則時刻の**時(HH)のみ**を短縮表示（`shiftNoteLabel()`。例「20〜」「〜7」「20〜7」）。
  編集パネルの変則勤務時間（見出しは「変則勤務」）は**ネイティブのダイアル選択(`<input type="time">`)**で入力する
  （`toInputTime()`で"HH:MM"に正規化して表示、空=枠既定を使う。iOS対策で固定幅`w-24`+`shrink-0`・行は折返し）。
  **入力欄は常に空から始める**（2026-08-01変更）。行は
  「変則勤務 [出勤] 〜 [退勤] [✕]」で**iPhoneで1行に収める**。
  - 🔴 **枠の既定時刻を `value` に入れてはいけない。** 入力欄が常に値を持つことになり、
    **クリアしても既定時刻が即座に再表示されて空に戻せなくなる**
    （iOSの時刻ピッカーの「リセット」が効かない、という形で表面化。2026-08-01修正）。
  - かといって既定時刻を**入力欄の外に出すと横幅を食って行が折り返し、見た目が崩れる**
    （一度そう実装して差し戻した）。そこで `TimeWithDefault` コンポーネントで、
    **`value` は空のまま・既定時刻は `pointer-events-none` のオーバーレイで上に重ねる**。
    タップは下の `input` に素通りするのでダイアルは従来どおり開き、値が入れば消える。
    ※ `<input type="time">` に `placeholder` は効かないため、この方式にしている。
  - **クリアは ✕ ボタン（必ず設置）。** iOSのピッカーの「リセット」は端末により効かないため、
    ネイティブの機能に頼らない。未入力時もレイアウトが動かないよう領域は確保して
    `disabled` で薄く出す。`onMouseDown` の既定動作を止めているのは、クリックで入力欄が blur して
    `onBlur` の保存が先に走り**二重保存**になるのを防ぐため。
  - **変則が入っている欄はグレー地＋白文字**（`bg-gray-500` + `text-white`）にして、
    既定のままの欄（白地＋グレー文字）と一目で区別できるようにする。
    入力に気付かず変則のまま放置する事故を防ぐため（2026-08-01追加）。
  - **`step={1800}`（30分刻み）**を指定している。
    🔴 **ただし iOS Safari は `<input type="time">` の `step` を無視する**（2026-08-01に実機で確認。
    ダイアルの「分」は1分刻みのまま）。PC/Androidでは効くので指定自体は残しているが、
    **「iOSでも刻みを制限できる」と考えないこと。** 勤務表の実績入力の `step={900}` も同様に
    iOSでは効いていない。分を確実に制限したいなら「時」「分」を別々の `<select>` にする必要がある
    （休憩時間の入力で採用している方式。ただしネイティブの時刻ダイアルの使いやすさは失われる）。
  - **未入力の欄を開いたときは `onFocus` で `00:00` を入れる**。指定しないとブラウザが
    **現在時刻**を初期表示するため、「開いただけで中途半端な時刻が入る」事故が起きていた
    （実際に `23:06` という誤データが1件発生。2026-08-01修正）。深夜勤務の `0:00` は
    そのまま確定でき、誤って開いた場合は隣の ✕ で消せる（✕は blur を止めるので保存されない）。
  - 🔴 **`EditRow` の `key` には日付を含めること**（`` `${m.id}|${date}` ``）。`m.id` だけだと
    日付を切り替えても React が同じインスタンスを再利用し `useState` の初期値が再評価されないため、
    **前の日に入力した変則時間が次の日に引き継がれてしまう**（2026-08-01修正）。
  途中交代（分割シフト）は同じ枠に2人割り当て、各自の変則時刻で表現する（例「〜11」「11〜」）。
- **日別パネル（カレンダー下・選択日の詳細）の表示**: 編集不可（閲覧のみ）の場合、枠ラベル・ニックネーム・
  変則勤務時間を3列（`grid-cols-[3.5rem_auto_1fr]`）でタブ状に揃えて1人1行で表示する
  （例「早番　ナオキ　（〜11:00）」「遅番　ゴマ　（11:00〜）」）。フォントサイズはカレンダーの日付と同じ
  サイズ（`text-base sm:text-lg`）。変則勤務時間はここでは**分まで含めた表記**をそのまま括弧書きし
  （`customTimeParen()`。カレンダーチップの時のみ短縮表記=`shiftNoteLabel()`とは別関数）、未設定なら括弧ごと非表示。

### 8.3 従業員の識別色
- 従業員マスタの編集パネルで、`employees.color` に**明度が高く彩度の低いパレット10色**（`SHIFT_COLORS`）から色を割当（重複可・任意）。
- シフト表でニックネーム背景色に適用。一覧では氏名の左に色ドットを表示。

### 8.4 勤務表の予実表示・入力デフォルト
- 勤務表(`TimesheetCalendar`)の下部一覧を**予実一覧**に変更。1日ごとに**上段=シフト予定(青)・下段=勤務実績(緑)**を
  色分け＋日ごとの横線で表示。予定と実績で時刻が相違する箇所は実績側を赤太字にする。**予定が無いのに実績がある
  (予定外勤務)日も、出勤・退勤とも赤太字**にする（`unplanned`判定）。**予定と実績が合致する時刻は黒太字**
  （`startMatch`/`endMatch`）。**カレンダー本体のセルに表示する実績時刻も同じ判定（相違=赤太字／合致=黒太字）**に
  し、一覧と色を一致させる（2026-07-22。選択中セル＝青背景は合致でも黒太字にせず可読性優先）。
- **予定行・実績行とも時刻は `HH:MM`（2桁）表記に統一**。予定行は `shift.startInput`/`endInput`
  （`toInputTime()`で正規化した "08:00"/"00:00" 形式）を表示し、下段の実績（`start_time`/`end_time`）と
  桁を揃える（2026-07-24。以前は予定行のみ生の `shift.start`（"8:00"/"0:00"）を表示していた）。
- 予実一覧のヘッダーは「予実一覧」の見出し行と、その下の2行の凡例に分離（幅の狭いスマホでも折り返さないよう
  見出しは単独の行にする。2026-07-23改訂）。凡例1行目「上段:予定、下段:実績、予実不一致は**赤字**」
  （"赤字"のみ赤太字＝色見本兼用）、2行目「（）内は深夜、&lt;&gt;内は残業、¥〜は交通費」（残業表記は2026-07-24追加）。
- 各行から「予定」「実績」の見出しラベルと、予定行の枠バッジ（早番/遅番/深夜）表示を廃止した
  （背景色=青/緑と、凡例の「上段/下段」表記だけで区別する。2026-07-23。バッジを取り除いたことで
  予定・実績どちらの行も先頭から直接時刻が始まるため、タブ位置は自然に揃う＝以前のグリッド列合わせは不要になった）。
- 実績行の勤務時間表示は**丸括弧を外し**、その右にさらに丸括弧書きで**深夜勤務時間**、続けて山括弧書きで
  **残業時間**を追記する（例「09:00〜19:00　9:00（0:00）&lt;1:00&gt;」。"深夜"/"残業"の文字は上記凡例で
  説明済みのため行内では省略する。深夜0分/残業0分の日はそれぞれの括弧部分を表示しない。2026-07-23に深夜、
  2026-07-24に残業を追加。`lib/period.ts`の`nightMinutes()`/`overtimeMinutes()`を`WorkList`でも呼ぶ）。
  実績行全体（時刻・勤務時間・交通費）は`flex-nowrap`にして横並びを1行に保ち、収まりきらない場合のみ
  `overflow-x-auto`で横スクロールする。
- 勤務表で**実績を新規入力するとき、その日のシフト予定の時刻を出勤・退勤の初期値に表示**する（既存レコードがあればそれを優先）。
- シフト予定は `shift_assignments` から表示中従業員ぶんを取得し `buildShiftMap()` で `work_date -> ShiftInfo` に変換して渡す。

### 8.5 カレンダーの左右スワイプ月移動（2026-07-21追加）
- シフト表(`ShiftSchedule`)・勤務表(`TimesheetCalendar`)のカレンダーを**左右スワイプで前後の月に移動**できる
  （左=翌月／右=前月。既存の`periodHref`＝`?p=`クエリ遷移を再利用）。＜＞ボタンも従来通り併存
  （PC・アクセシビリティ用の代替経路）。共通フック`src/lib/useSwipeNav.ts`に集約。
- **追従スライドアニメーション**: ドラッグ中はカレンダーが指に1:1で追従（`transition:none`）、離した時に
  閾値（50px、かつ横移動>縦移動）を超えていればそのまま画面外へスライドアウト→遷移後に反対側から
  スライドインさせる。閾値未満・縦移動優勢（＝スクロール）なら元位置へスナップバック。ボタン押下時の
  「無反応→急に切替」という空振り感を、動きで待ち時間を埋めることで解消するのが狙い。
- **スライドアウトのクリップ**: 全幅translateで横スクロールバーが出ないよう、各カレンダーを`overflow-hidden`の
  外枠で包む。**スライドインの発火**は`router.push`後に`requestAnimationFrame`を2段重ねてから`translateX(0)`へ
  戻す（1段だと描画前にtransitionが走りポップすることがあるため）。
- **遷移中の白紙化**: `router.push`直後はまだ前月データがReactツリーに残っているため、フックは`blank`フラグを返す。
  ドラッグ開始で`blank=true`、第3引数`resetKey`(=`period.key`)が変化した＝新しい月のデータが到着した時点で
  `false`へ戻す。呼び出し側は`blank`中セルの中身（予実/シフト）を`undefined`扱いにして非表示にし、日付と枠だけを
  スライドさせる（前月の残像を防ぐ）。設計意図の詳細はスキル`.claude/skills/mobile-calendar-ui/`に集約。
- **横スワイプの引っかかり対策**: スワイプ要素に`touch-action: pan-y`（縦のみブラウザ・横は自前）を指定し、
  スクロール引き取り時に飛ぶ`touchcancel`でも元位置へ戻すハンドラを持たせる（ブラウザのネイティブ横スクロールと
  競合して途中で止まる事象への対処）。

### 8.6 実装ファイル
- DB: `supabase/migrations/20260719_add_shift_scheduling.sql`（適用済みスキーマの記録。シフト関連一式）。
  時給0円許容の制約変更は別ファイル `supabase/migrations/20260719_allow_zero_wage.sql`（シフト機能とは無関係の派生対応）。
- 共通: `src/lib/shifts.ts`（枠定義・色・正規化・予実状態型）、`src/lib/shift-data.ts`（`loadShiftData`）、
  `src/lib/useSwipeNav.ts`（カレンダーの左右スワイプ＋スライドアニメーション＋遷移中の白紙化。§8.5）。
- 画面: `src/app/admin/shifts/{ShiftSchedule.tsx,actions.ts}`、`src/app/admin/page.tsx`、`src/app/(employee)/shifts/page.tsx`。
- 勤務表: `src/app/(employee)/timesheet/{ui,page}.tsx`、`src/app/admin/timesheet/page.tsx`。
- 従業員色: `src/app/admin/employees/{ui,actions,page}.tsx`。設定: `src/app/admin/settings/{ui,actions,page}.tsx`。
- 打刻交通費: `src/app/clock/{page,ui,actions}.ts(x)`。
- **UI/UXスキル**: `.claude/skills/mobile-calendar-ui/`（祝日赤文字・日単位表示・フォントバランス・枠/余白・
  スワイプ月移動・タップ→詳細のmaster-detailを、シフト表/勤務表を題材に体系化。`useSwipeNav`同梱）。

---

## 9. 勤務表の時刻編集ロック（2026-07-20追加）

従業員が勤務表画面から出勤/退勤時刻・休憩時間を自由に書き換えられる状態を、管理者の判断で
制限できるようにする機能。QR打刻の記録を従業員自身が改変できてしまう懸念に対応する。

### 9.1 概要
- 管理画面「設定」→「勤務表ロック」で **ON/OFF を切替**（`app_settings` の `lock_employee_time_edit`。
  既定値は `false`＝ロックなし、従来動作のまま）。
- **ON の場合**: 従業員は勤務表（`/timesheet`）で出勤・退勤時刻・休憩時間を編集できない。
  **交通費・メモは引き続き編集可能**。**QR打刻（出勤/退勤）自体はロックの影響を受けず、従来通り利用できる**
  （QR打刻は`punchClock`経由でこのロックのチェック対象外）。
- 既存レコードが無い日（QR打刻も手入力もまだ無い日）は、ロック中は時刻を確定する手段が無いため
  **従業員による新規作成そのものを拒否**する（フォームを出さず「QR打刻をご利用いただくか、管理者に
  ご連絡ください」と案内）。既存レコードがある日は、交通費・メモだけを更新できる（時刻欄は無効化表示）。
- ロック中は従業員による**削除も拒否**する（削除→再作成で新規扱いになりロックを回避されるのを防ぐため）。
- **管理者は`/admin/timesheet`から常に全項目を編集可能**（このロックの影響を受けない。締め済み期間でも
  編集できる既存仕様と同様、管理者は別経路）。

### 9.2 実装（多層防御）
- クライアント側: 出勤/退勤の`<input type=time>`・休憩の`<select>`を`disabled`にし、視覚的にも操作不可にする。
  `disabled`な入力欄は`FormData`に含まれないため、実際の値を`hidden`入力で別途補って送信する
  （`src/app/(employee)/timesheet/ui.tsx`の`EntryForm`）。
- **サーバー側で最終的に強制**（クライアント側の`disabled`はUXのためだけで、認可の根拠にはしない）:
  `upsertWorkEntry`（`src/app/(employee)/timesheet/actions.ts`）はロック中、クライアントが送ってきた
  出勤/退勤時刻・休憩時間を信用せず、DBの既存値で上書きしてから保存する（交通費・メモのみ送信値を反映）。
  既存レコードが無ければ保存自体を拒否する。`deleteWorkEntry`もロック中は拒否する。
- ロック状態は`app_settings`のキーだが、`app_settings`は管理者のみSELECT可のRLSのため、従業員セッションから
  読むための SECURITY DEFINER 関数 `get_timesheet_lock()`（`clock_*`/`shift_*`設定の`get_clock_settings()`/
  `get_shift_settings()`と同じパターン。anon revoke・authenticated のみ実行可）を新設した。

---

## 10. 標準休憩時間帯の設定化・勤務ルール文書（2026-07-23追加）

### 10.1 標準休憩時間帯を設定画面から編集可能に
- §9.1で導入した標準休憩ルール（休憩は12:00-13:00/19:00-20:00/4:00-5:00に取る前提で勤務時間・深夜割増を
  計算する。理由は§7.2参照）を、**設定画面「シフト枠」の下「休憩時間」セクションから3枠とも編集可能**にした。
- `src/lib/breaks.ts`（新設）: `BreakWindow`型（[開始,終了]を分で表す）、`DEFAULT_BREAK_WINDOWS`（既定値）、
  `BREAK_SETTING_KEYS`（`app_settings`のキー一覧）、`parseBreakWindows()`（key/value配列から3枠を組み立て、
  未設定/不正値は既定値にフォールバック）、`minutesToHHMM()`（フォーム表示用）を提供する共通モジュール。
- `lib/period.ts`の`standardBreakMinutes()`/`nightMinutes()`は第3引数`windows`（省略時は既定値）を取るように変更
  （既存の呼び出し・テストへの後方互換を維持）。`lib/payroll.ts`の`computePayslip()`も`breakWindows`を受け取り
  内部で使用する。
- **設定の読み出し経路**: 管理者セッションのコード（`lib/payroll-data.ts`の`calculatePeriodPayroll()`、
  `admin/close/actions.ts`の`emailPayslips`、`admin/timesheet/actions.ts`、`admin/timesheet/page.tsx`）は
  `app_settings`を直接SELECT。従業員セッションのコード（`(employee)/timesheet/{actions,page}.tsx`、
  `clock/actions.ts`）は`app_settings`が管理者のみSELECT可のため、SECURITY DEFINER関数
  **`get_break_settings()`**（`break_window_*`キーのみ返す。anon revoke・authenticated実行可）経由で読む。
- `(employee)/timesheet/ui.tsx`の`TimesheetCalendar`/`WorkList`は`breakWindows`propを受け取り、勤務時間の
  表示計算に使う（実際に保存される休憩時間は各サーバーアクション側で確定計算するため、クライアント側の
  表示はあくまでプレビュー）。`schema.ts`の実働チェックとモジュール関数`entryFromFormData()`は
  設定にアクセスできないため既定値で概算判定する（保存値そのものではなく安全チェック・プレビュー用途のみ）。
- 設定画面: `admin/settings/{actions,ui,page}.tsx`の`updateBreakWindows`/`BreakWindowsForm`
  （開始<終了のバリデーションつき）。

### 10.2 勤務ルール文書のアップロード・閲覧
- 管理者が勤務ルールを記載した文書（jpg/png/pdf、20MBまで）をアップロードでき、従業員・管理者とも
  ハンバーガーメニュー「勤務ルール」からいつでも閲覧できる機能。
- **保存先**: Supabase Storageの非公開バケット `work-rules`。固定パス `document` に常に上書き保存する
  （履歴は持たない・最新のみ）。バケットのRLS: SELECTはログイン済み(authenticated)なら誰でも、
  INSERT/UPDATE/DELETEは管理者のみ(`is_admin()`)。
- **メタ情報**: `app_settings`に`work_rules_path`(=`document`固定)・`work_rules_filename`(元のファイル名)・
  `work_rules_mime`・`work_rules_uploaded_at`を保存。従業員セッションから読むための SECURITY DEFINER 関数
  **`get_work_rules_meta()`**（`work_rules_*`キーのみ返す。anon revoke・authenticated実行可）を新設。
- **アップロード**: 設定画面「QR打刻の位置設定」（出退勤QRコードを含む）の直後に「勤務ルール」セクションを配置。
  `admin/settings/actions.ts`の`uploadWorkRules()`がMIME種別(jpg/png/pdfのみ)・サイズを検証し、
  Storageへ`upsert:true`でアップロード後、上記メタ情報を`app_settings`に保存する。管理画面には現在の登録
  ファイル名とプレビュー用の署名付きURL（`createSignedUrl`、5分間有効）を表示する。
- **閲覧**: 共有ページ `src/app/work-rules/page.tsx`（従業員・管理者どちらの画面にも属さない独立ルート。
  `requireEmployee()`でログインのみ確認しどちらの役割でも可）。`get_work_rules_meta()`でメタを取得し、
  ストレージから署名付きURL（60秒有効）を発行して`redirect()`する。画像/PDFともブラウザが直接レンダリング
  するため専用ビューアは実装していない。未アップロード時は案内メッセージを表示する。
- **メニュー**: 従業員(`(employee)/nav.tsx`)・管理者(`admin/nav.tsx`)双方のハンバーガーメニューに
  「勤務ルール」を追加（`target="_blank"`で新しいタブに開き、元のアプリの状態を保持する）。位置はどちらも
  ログアウトの区切り線の**上**（従業員はスマホのポップアップ内・PC/iPadの横並び双方、管理者はモバイルの
  ハンバーガーシートとPCサイドバー双方に配置）。

### 10.3 営業カレンダー(外部サービス・参照のみ)への導線（2026-07-24追加）
- 別セッションで構築・本番稼働中の「オオミナミ営業カレンダー」(Cloudflare Workers、
  `https://oominami-calendar.shinsekai.workers.dev`)への**参照リンクのみ**を追加。**方式A(参照)**:
  給与システム側にカレンダー描画コード・Google APIキーは一切持たせない。データはカレンダー側が
  Googleカレンダー(`oominami2026@gmail.com`)からブラウザ直結取得(給与システムのバックエンドは不関与)。
- ハンバーガーメニューの「勤務ルール」の直下に**「営業カレンダー」**を追加（従業員
  `(employee)/nav.tsx`・管理者`admin/nav.tsx`双方、モバイルのハンバーガーシート/ポップアップと
  PC/iPadの横並び双方）。リンク先はポスター表示URL
  `https://oominami-calendar.shinsekai.workers.dev/?poster`（`target="_blank"`で別タブに開く。
  `ym=YYYY-MM`パラメータで対象月を指定できるが、メニューからは省略=当月表示で開く）。
  ポスター側にPDF/画像の印刷・共有ボタンが用意されており、給与システム側での実装は不要。
  従業員ナビの下部タブ（PC/iPad表示、lg:flex）が1項目増えたため、グリッドを
  `lg:grid-cols-6`→`lg:grid-cols-8`（3主要項目+お知らせ+管理者へ✉️+勤務ルール+営業カレンダー+
  ログアウト=8列）に変更。
- 画面内 iframe 埋め込みは不採用（別タブ導線のみ）。将来「給与UI側で月選択・印刷ボタンを持ちたい」等の
  要望が出た場合は、カレンダー側にツールバー非表示パラメータ＋`postMessage`連携の追加改修を
  カレンダー側セッションへ依頼する（このリポジトリでは対応しない）。

### 9.3 実装ファイル
- DB: `supabase/migrations/20260720_add_timesheet_lock.sql`（`app_settings`の既定値・`get_timesheet_lock()`）。
- 設定画面: `src/app/admin/settings/{actions,ui,page}.tsx`（`updateTimesheetLock`/`TimesheetLockForm`）。
- 従業員側: `src/app/(employee)/timesheet/{actions,page,ui}.tsx`（`upsertWorkEntry`/`deleteWorkEntry`の
  ロックチェック、`EntryForm`の`timeLocked`prop）。
- 管理者側（`admin/timesheet`）・QR打刻（`clock/actions.ts`）はこの機能による変更なし（従来通り）。

---

## 11. 日当レポート・前払金（2026-07-26追加）

### 11.1 背景と方式

給与期間は「前月26日〜当月25日」のため、開店直後など**期間の途中から日当を現金で手渡す**運用をすると、
同じ勤務が月末の給与にも含まれて**二重払い**になる。

実際の検討では、給与計算の「運用開始日」を設けて期間の開始日を繰り下げる案（A案）を一度実装したが、
**源泉徴収を月額表による月単位の計算のまま維持したい**というオーナー判断により撤回し、
**前払金方式（B案）**を採用した（A案のコード・設定は削除済み。`payroll_start_date` は存在しない）。

前払金方式の計算：

```
差引支給額 = 総支給額 − 源泉所得税 − 前払金控除
```

- **総支給額・課税対象額・源泉所得税は期間全体（前月26日〜当月25日）で計算し、前払金の影響を受けない。**
  前払金は所得の控除ではなく「既に支払った分の精算」であるため、源泉徴収は従来どおり月額表で月単位に計算する。
- 日当として渡した分は `advance_payments` に記録し、差引支給額からのみ差し引く。

### 11.2 前払金の記録単位（重要）

`advance_payments` は **(employee_id, work_date) で一意**。`work_date` は「対象の勤務日」であり、
支払日ではない。これにより**前払いした勤務と控除が必ず同じ給与期間から差し引かれる**ことが保証される
（支払日で紐づけると、月をまたいだときに控除が別期間にずれて二重払いが再発しうる）。この不変条件は
仕様変更時に壊さないこと。

- 締め済み・支払済みの期間に属する日は前払金を変更できない（`setAdvancePayment` が `pay_periods` を
  引いて拒否。確定済み明細と画面の金額がずれるのを防ぐ）。変更するには先に締め解除する。
- 金額が確定できない日（退勤未入力・時給未設定）は記録できない（ボタンを無効化）。

### 11.3 日別実績（`/admin/daily`、従業員向けは `/daily`。旧称「日当設定」。2026-07-29に画面名・メニュー名を変更）

- メニュー表記は管理者・従業員とも「**日別**」（旧「日当」）、画面タイトルは「**日別実績**」（旧「日当設定」）。
  管理画面ではメニュー順を給与明細の**前**（左）に変更（`admin/nav.tsx` の `primaryLinks`）。
- 画面本体は `admin/daily/report-view.tsx` の `DailyReportView` に共通化し、管理者用
  （`admin/daily/page.tsx`）と従業員用（`(employee)/daily/page.tsx`）の両方から呼び出す。
  `lib/daily-report.ts` の `loadDailyReport(from, to, employeeId?)` に第3引数を追加し、
  従業員セッションでは自分の `employee.id` を渡して**自分の実績のみ**に絞り込む（従業員一覧・勤務実績・
  前払金のクエリすべてに適用）。
  - `editable` propで前払金欄の見た目を切替: 管理者側=`AdvanceToggle`（記録/取消ボタン）、
    従業員側=`AdvanceAmount`（記録済み金額の表示のみ・記録操作不可）。
  - 従業員側の説明文2行目は「日当の前払いが行われた場合もここで確認できます。」（管理者側は前払済ボタンの案内のまま）。
- 従業員ナビ（`(employee)/nav.tsx`）の `mainItems` に「日別」を勤務表と給与明細の間に追加
  （下部タブは4主要項目＋ハンバーガーで`grid-cols-5`、PC/iPadの横並びは項目が1つ増えたため
  `lg:grid-cols-9`→`lg:grid-cols-10`に変更）。

### 11.3.1 日当設定（旧タイトル。以下は元の仕様メモ）

給与期間（前月26日〜当月25日）ごとに、従業員ごとの日別の勤務時間・支給額を一覧表示する恒久機能。
**期間指定は給与明細画面（`/admin/close`）と同じ月度単位**（＜ 2026年8月度 ＞ で前月/翌月移動・`?p=YYYY-MM`）。
前払金の記録単位が「勤務日」で給与期間から控除される以上、確認単位も給与期間に揃えるのが自然なため
（当初は任意の日付範囲だったが2026-07-27に変更）。
**金額の計算方法（標準休憩の導出・深夜25%増・8時間超の残業25%増・昼食補助・日単位の切り捨て）は
月次の給与計算と完全に同一**（`lib/daily-report.ts`。時給・昼食補助はその勤務日時点で有効な設定を使う）。

- 源泉所得税は月単位の計算のためこの画面には含めない（画面上部の説明文で案内）。
- 画面上部は 月度セレクタ＋「日別実績」見出し、その下に説明文2行（日別支給額の確認／前払済ボタンの案内。従業員側は2行目のみ異なる。§11.3）。
- 全体合計（対象期間・のべ勤務日数・合計勤務時間・支給額合計・前払金記録済み）は**開閉式の枠**にまとめ、
  **既定は閉じる**（日ごとの明細をすぐ見たいことが多いため）。**CSVダウンロード・印刷ボタンはこの枠の中**に置く。
- 従業員ごとの小計を各表の末尾に表示。小計行の背景は`bg-gray-200`（2026-07-29に`bg-gray-50`から変更。
  明細行との区別を付けやすくするため）。
- **従業員別タイトル行は日数のみ表示**（{日数}日。2026-07-29に勤務時間・支給額・前払金の表示を廃止。
  同じ情報が明細の小計行に既にあるため）。
- **従業員の見出しはニックネーム優先（未設定なら氏名）**。画面はニックネーム、CSVは帳票のため氏名、という
  本システムの表示方針（§「従業員表示を原則ニックネームに統一」）に合わせている（2026-07-27修正）。
- CSV出力（BOM付き）・印刷/PDF。**CSVの列順は勤務内容順のまま**（画面＝支払確認用、CSV＝記録用として
  意図的に分けている。2026-07-26にオーナー了承済み）。
- 勤務のなかった従業員は表示しない。
- **表の列順は 日付/支給額/前払金/メモ/出勤/退勤/休憩/実働/深夜/残業/時給/基本給/深夜手当/残業手当/
  昼食補助/交通費**（メモは2026-07-29に追加。当初は最右列だったが同日中に前払金の右へ移動）。
  「メモ」は勤務表の入力欄のメモをそのまま表示。`lib/daily-report.ts`の`DailyRow.note`
  （`work_entries.note`）が元データ。テキストは赤字、他の列と異なり`whitespace-nowrap`を
  付けず`whitespace-normal break-words`で内容に応じて列幅・折り返しが自然に決まるようにしている。
- **残業時間・残業手当は0でなければ青字太字**（2026-07-29追加。明細行・小計行の両方に適用）。
- **時間数・金額が 0 のセルは空白にする**（2026-07-31追加。`hhmm()`/`yen()` が 0 のとき空文字を返す）。
  値のある行だけが目に入るようにするため。
  ⚠️ **出勤・退勤の「時刻」はこの対象外**（深夜0時ちょうどの `0:00` が消えてしまうため、
  DBの値をそのまま出す。`hhmm()` は「時間数」専用で、時刻には使わないこと）。

### 11.3.2 前払金は「実際に渡した額」（支給額と一致しなくてよい。2026-08-01確立）

**`advance_payments.amount` はその日の支給額のコピーではなく、実際に現金で渡した額**である。
両者は一致しないことがあり、それは異常ではない。

- 打刻を後から修正すると**支給額だけが変わる**（渡した現金は戻らない）。実際に
  2026-08-01、打刻の丸め不具合の修正で支給額が 13,390円 → 13,360円 に変わり、
  既に 13,390円 を手渡し済みという状態が発生した。
- **正は「渡した額」。** 渡した額をそのまま控除する。差額はその月の他の勤務日の支給額で
  自動的に精算される（上の例なら 30円 多く控除され、月末の手取りが 30円 少なくなる）。
  総支給額・課税対象額・源泉所得税は前払金の影響を受けないため、税額計算は正しいまま。
- UI（`AdvanceToggle`）: 「前払済」ボタンは**支給額をワンタップで記録する近道**にすぎない。
  金額をタップすると実際に渡した額に修正でき、未記録の日は「金額指定」から任意の額を入れられる。
  **支給額と異なる額が記録されている行は差額を赤字で併記**して、誤記録に気付けるようにしている。
- 桁の打ち間違い（0を1つ多く打つ等）対策として、サーバー側で 100万円超を弾く。

### 11.3.3 前払金と勤務実績の紐付け（複合外部キー。2026-08-01に制約を追加）

前払金は `(employee_id, work_date)` で勤務実績と結びつく。**2026-08-01 に複合外部キーを張り、
DBレベルで紐付きが保証されるようにした**
（`supabase/migrations/20260801044710_advance_payments_work_entry_fk.sql`）。

```sql
foreign key (employee_id, work_date)
  references work_entries (employee_id, work_date)
  on update cascade
  on delete no action
```

- **`ON UPDATE CASCADE`**: 勤務実績の `work_date` を直すと**前払金の日付も自動で追従**する。
  打刻の誤りを後から修正しても紐付きが外れない。
- **`ON DELETE NO ACTION`**: **前払金がある日の勤務実績は削除できない**。現金を渡した記録だけが
  残って控除され続ける事故を防ぐ。アプリは `23503` を捕まえて「先に前払金を取り消してください」と
  案内する（`(employee)/timesheet/schema.ts` の `deleteEntryErrorMessage`）。
- 🔴 **`RESTRICT` ではなく `NO ACTION` にすること。** 従業員を削除すると `employees` からの
  `ON DELETE CASCADE` で `work_entries` と `advance_payments` が**同じ1文の中で**消える。
  `RESTRICT` は即時チェックのため、カスケードの順序次第で従業員削除が失敗しうる。
  `NO ACTION` は文末チェックなので、両方消え終わった時点で参照は無く正常に通る
  （本番で仮データを使い ROLLBACK 付きで実証済み）。

**なぜ制約前に事故が起きたか（背景）**: それまで外部キーが無く、日付が一致するかどうかだけで
紐付いていたため、勤務日をずらすと前払金だけが取り残された。孤立レコードは**日別実績の表に
現れない**（表は勤務実績の行を並べたもの）のに、**給与計算では差引支給額から控除され続ける**
（`payroll-data.ts` は期間内の `advance_payments` を日付範囲で合算するだけで勤務実績の有無を見ない）
ため、「理由の分からない控除」になっていた。

- **孤立検知は制約追加後も残してある**（多層防御）。`loadDailyReport` が検出して
  `DailyReport.orphanAdvances` で返し、日別実績の上部に**赤い警告**を出す（管理者のみ。
  従業員は対処できないため非表示）。制約により新規発生はしないはずだが、
  手作業のSQL等で万一生じたときの検知網として機能する。

### 11.4 前払金の表示箇所

前払金が 0 円のときは行を出さない（通常月の見え方は従来どおり）。

| 画面・帳票 | 表示 |
|---|---|
| 日当レポート | 「前払金」列＋「前払済/取消」ボタン、小計・合計 |
| 管理者の給与明細一覧（`admin/close/page.tsx`） | 「前払金」列、サマリの前払金控除合計 |
| 給与明細メール（`lib/email.ts`） | `前払金(日当としてお支払い済み): -◯◯円` ＋ 説明の注記 |
| 従業員の明細画面（`(employee)/payslips/page.tsx`） | 控除行として表示 |
| 税理士向けCSV（`admin/report/actions.ts`） | 「前払金控除」列 |

### 11.4.1 帳票のPDFダウンロード（`DownloadPdfButton`。2026-07-31導入）

**スマホ（特に iOS のPWA=ホーム画面追加・standalone表示）では `window.print()` が動作しない**
（WebKitの制限。QRコードのPDFで先に判明していたのと同じ事情）。このため給与明細一覧の
「印刷」ボタンを廃止し、**PDFダウンロード**に置き換えた（`admin/report/ui.tsx` の
`DownloadPdfButton`。QRコードのPDFと同じ html2canvas + jsPDF 方式）。

- 対象要素は **id で指定**する（`close/page.tsx` の `id="payslip-report"` ⇔ `close/ui.tsx` の
  `targetId`）。ボタンと帳票が別コンポーネントのため ref を渡せない。**片方だけ変更しないこと。**
- 画面では表を `overflow-x: auto` の枠に収めているため、**そのまま撮ると見えている範囲しか写らない。**
  キャプチャ中だけ `body.pdf-capture-mode` + 対象に `.pdf-capture-target` を付与し、
  画面外（`left: -10000px`）で全幅（1400px）描画してから撮る（`globals.css`）。
  固定列（氏名）の `sticky`/影もこのとき解除する（PDFでは不要かつズレの原因になるため）。
- **A4横向き**に貼り付ける（列数が多いため縦向きだと潰れる）。縦に長い場合は
  canvas を切り出して**複数ページに分割**する。
  🔴 **`sectionSelector` prop（2026-08-05追加）**: 未指定なら固定ピクセル高さで機械的に
  切るが、指定すると**行の途中で改ページしない**（区切りの良い位置まで切断位置を引き戻す）。
  日別実績（`admin/daily/report-view.tsx`）は各従業員の `<section>` に `pdf-section`
  クラスを付け `sectionSelector=".pdf-section"` を渡している。未指定の給与明細画面は
  従来どおり（後方互換）。1セクションが1ページより長い場合は機械的に切るフォールバックが
  残るので無限ループにはならない。
- 日本語はブラウザ側で描画された画像なので、**PDFにフォントを埋め込む必要がない**。
- 例外時も必ず `finally` でキャプチャ用クラスを外すこと（外し忘れると画面から帳票が消える）。
- 🔴 **キャプチャ用ライブラリは用途ごとに使い分けている（統一しないこと）。**

  | 用途 | 使うライブラリ | 理由 |
  |---|---|---|
  | 給与明細一覧（`admin/report/ui.tsx`） | **`html2canvas-pro`** | Tailwind のクラスを使うため `oklch()` 対応が必須 |
  | 日別実績（`admin/daily/report-view.tsx`。2026-08-05追加。`DownloadPdfButton`を再利用） | **`html2canvas-pro`** | 同上 |
  | 出退勤QRシート（`admin/settings/clock.tsx`） | **`html2canvas`（本家）** | pro に変えるとレイアウトが崩れる |

  - 本プロジェクトは **Tailwind CSS v4** で、標準カラー（`gray-*`/`red-*` など）が **`oklch()`** で
    出力される。本家 html2canvas(1.4.1) は `oklch()` を解釈できず
    `Attempting to parse an unsupported color function` で必ず失敗する
    （2026-07-31に給与明細のPDFで発生）。`html2canvas-pro` は API 互換のフォークで oklch に対応する。
  - 一方、**QRシートを `html2canvas-pro` にすると表示が崩れる**（`.qr-print-codes` の flex や
    `img { width: 55mm }` が効かず、QRが縦積みで巨大化。2026-07-31に実機で確認）。
    QRシートは `globals.css` に16進数で書いた独自クラスだけで作っており oklch を含まないため、
    本家のままで問題ない。
  - **どちらか一方に寄せようとしないこと。** 両方とも動的 import（コード分割）なので、
    それぞれの画面を開いたときにしか読み込まれない。
- **`DownloadPdfButton`（`admin/report/ui.tsx`）は `targetId`/`filename` だけの汎用コンポーネント**
  なので、他画面でもそのまま import して使い回せる（新規実装不要）。日別実績画面
  （`admin/daily/report-view.tsx`）はこれをそのまま再利用し、`id="daily-report"` を
  キャプチャ対象にしている。**CSVも同じ発想**で、日別専用の
  `DownloadDailyCsvButton`（`admin/daily/ui.tsx`）を文字ボタン化して見出し横に配置した
  （旧実装は「対象期間」の折りたたみ枠に隠れたアイコンボタンで、印刷は `window.print()`
  のままだった＝iOSのPWAで動作しない状態のまま気付かれず残っていた。オーナー依頼で
  給与明細画面と同じ方式に統一）。
  🔴 **`DailyReportView` は管理者・従業員で共用**（`editable` prop で出し分け）。
  PDF/CSVボタンは `editable` のときだけ出す（従業員の閲覧専用画面には出さない）。

### 11.5 実装で踏んだ落とし穴（再発注意）

- **`useTransition` の pending が解除されない**: 前払金ボタンの保存中フラグを `useTransition` で持つと、
  pending はサーバーアクションの完了ではなく **`revalidatePath` による再レンダーの適用まで解除されない**。
  複数行を続けてタップすると後の行の遷移が先の行の再レンダーに巻き取られ、「記録中...」のまま固まった
  （**保存自体は成功していた**）。自前の `useState` ＋ `finally` で必ず解除し、押下直後にローカル状態で
  表示を切り替える方式に変更（`admin/daily/ui.tsx` の `AdvanceToggle`）。**行単位で並行実行しうるボタンでは
  `useTransition` を使わないこと。**
- **固定列がヘッダーを乗り越える**: モバイルヘッダー（`admin/layout.tsx` / `(employee)/layout.tsx`）と
  表の固定列（`sticky left-0 z-10`）が**どちらも `z-10`** で、DOM順で後ろの表セルがヘッダーの上に描画されていた。
  ヘッダーを **`z-30`** に変更して解消（下部タブ `z-40` とハンバーガーのシート `z-30` より下、固定列 `z-10` より上）。
  日当・勤務表・給与明細の各表に共通する問題だったため、ヘッダー側の1箇所で直している。

### 11.6 実装ファイル

- DB: `supabase/migrations/20260726_advance_payments.sql`（`advance_payments` 新設＋`payslips.advance_deduction` 追加）。
- 計算: `lib/payroll.ts`（`computePayslip` の `advanceTotal` / `advance_deduction`）、
  `lib/payroll-data.ts`（当期の前払金を従業員ごとに集計して渡す）、`lib/daily-report.ts`（日当レポートの集計）。
- 画面: `admin/daily/{page,ui,actions,report-view}.tsx`（一覧・`AdvanceToggle`・`setAdvancePayment`・
  `buildDailyReportCsv`・共通ビュー`DailyReportView`）、`(employee)/daily/page.tsx`（従業員自身の閲覧、§11.3）。
- 反映先: `admin/close/{page,actions}.ts(x)`、`admin/report/actions.ts`、`lib/email.ts`、`(employee)/payslips/page.tsx`。
- テスト: `lib/payroll.test.ts` に2件追加（前払金が総支給額・課税対象額・源泉所得税を変えず差引支給額のみ減らすこと）。

---

## 12. アプリからの打刻導線（2026-07-27追加）

QRコードを読まなくてもアプリ内から打刻できる導線。従業員ナビ（`(employee)/nav.tsx`）の
**ハンバーガーの一番上**に「出退勤の記録」を置き（PC/iPadの横並び行にも「出退勤」として追加。
項目が増えたため `lg:grid-cols-8`→`lg:grid-cols-9`）、タップすると画面下部に
**出勤 / 退勤 / キャンセル**の確認シートを出す。

- 出勤 → `/clock?type=in&from=<現在のパス>`、退勤 → `/clock?type=out&from=...` へ遷移。
- 確認シートは**画面下部**に出す（中央に置くとヘッダー `z-30` に重なるため。ナビ自身が `z-10` で
  スタッキングコンテキストを作っており、その内側の要素は `z-50` にしてもヘッダーより前に出せない。
  ハンバーガーのシートと同じ `fixed inset-0 z-30` + 下部配置で揃えている）。
- **戻り先（`from`）**: 打刻画面は `from` を受け取り、**打刻前（キャンセル相当）と打刻成功後の両方に
  「戻る」**を出す。QRから開いた場合は `from` が無いため「戻る」は出ない（従来どおりの見た目）。
- **オープンリダイレクト対策**: `from` は `clock/page.tsx` で `/^\/[A-Za-z0-9\-_/]*$/` に一致し、かつ
  `//` 始まりでないものだけを採用する（`//example.com` のような protocol-relative URL を弾く）。
  **`from` をそのまま `href` に渡さないこと。**
- 実装: `(employee)/nav.tsx`（`clockOpen` 状態・`clockHref()`・確認シート・`ClockIcon`）、
  `clock/page.tsx`（`from` の検証と `backHref` の受け渡し）、`clock/ui.tsx`（`backHref` prop と「戻る」）。

---

## 13. シフトの「確定 / 調整中」モード（2026-07-27追加）

### 13.1 目的とモード

シフト調整を「まず各従業員が自分の希望を入力 → ぶつかった所・足りない所だけを調整 → 管理者が確定」
という流れで回せるようにする。モードは**月ごと**に `shift_modes` で保持する。

| モード | 従業員 | 管理者 |
|---|---|---|
| **確定**(`confirmed`) | 閲覧のみ | 全員分を編集できる |
| **調整中**(`draft`) | **自分の希望だけ**を入力・変更できる | 全員分を編集できる |

**表示はどちらのモードでも常に全員分**（2026-07-27の方針変更）。調整中に他の人の希望が
見えることは意図的で、希望がぶつかっていることが分かれば当人同士で調整できるため。
**モードで変わるのは編集できる範囲だけ。**

- **希望と確定は同じ `shift_assignments` に持つ**（希望をそのまま調整して確定させる運用）。
  モードを切り替えてもデータの移し替えは起きず、**RLS の判定だけが変わる**。
  そのため確定後に「もともとの希望は何だったか」は辿れない（2026-07-27にオーナー了承済み）。
- 1従業員1日1枠の制約は調整中も維持する（「早番でも遅番でも可」のような複数希望は持てない）。
- モードを切り替えられるのは管理者のみ。**画面のモードバッジ自体がボタン**で、タップすると
  確認ダイアログ（「確定しますか？」/「調整中に戻しますか？」＋はい・キャンセル）を経て切り替わる。
  誤タップで従業員の編集可否が変わるのを防ぐため確認を必須にしている。

### 13.2 既定モード（レコードが無い月）

**翌月度以降 = 調整中 / 今月度以前 = 確定**。これから調整する未来の月は、管理者が何もしなくても
従業員が希望を入れられる状態にするため。

- **同じ規則が2箇所にある**: DBの `is_shift_draft()` と TSの `defaultShiftMode()`（`lib/shifts.ts`）。
  **片方だけ変えないこと**（TS側は画面表示、DB側は権限判定に使うため、ずれると「画面では編集できるのに
  保存が弾かれる」状態になる）。
- 期間キーは `shift_period_key(date)`（SQL）が算出する。設定「シフト表を1日始まり」に応じて
  暦月 / 給与期間（26日始まり）を切り替えるため、**シフト表の期間の決め方と必ず一致させる**。

### 13.3 編集範囲の制御

- **参照**: `shift_assignments` の SELECT ポリシーは `using (true)`（全ログインユーザーが全員分）。
  調整中でも変えない。
- **書き込み**: `shift_assignments_self_draft_{insert,update,delete}` ポリシー（**本人 かつ 調整中の月**）。
  管理者は既存の `shift_assignments_admin`（ALL/`is_admin()`）で常に操作できる。
- サーバーアクションの `canEditShift()` は**画面に分かりやすい理由を返すためのもの**で、
  最終的な担保は RLS。
- 画面側は `editableEmployeeId` prop で制御する。調整中の従業員画面では自分以外の行を
  読み取り専用（枠ボタンを淡色・操作不可）にして表示する。**行自体は隠さない**
  （誰がどの枠を希望しているかが見えることが調整の助けになるため）。

> ※初版（2026-07-27）では調整中に他人の希望を隠す実装にしていたが、同日中に
> 「ぶつかりが見えたほうが当人同士で調整できる」との判断で**表示は全員分**に変更した。
> このとき `get_shift_status()` に入れていた絞り込みも外している。

### 13.3.1 🔒 従業員によるロック（変更不可。2026-08-02追加）

**従業員本人が自分の予定に「変更不可」のロックをかけられる。ロックされた日は
管理者であってもシフトを追加・変更・削除できない**（本人が外すまで。**確定モードになった後も有効**）。

- **2つの意味を1つの仕組みで表す**（どちらもロックの有無だけで表現できる）:
  - ロックのみ（枠なし）＝「**この日は勤務不可**」→ 管理者がシフトを入れられない
  - ロック＋枠あり＝「**このシフト希望は変更不可**」→ 管理者が枠を動かせない
- **専用テーブル `shift_locks(employee_id, work_date)`**。`shift_assignments` に
  フラグを持たせなかったのは、`slot` が NOT NULL のため**「勤務不可（シフトなし）」を
  表現できない**から。別テーブルなら枠の有無に関わらずロックを保持できる。
- **解除できるのは本人だけ。管理者は解除できない**（2026-08-02にオーナー判断）。
  管理者が外せると「独断で変更させない」という趣旨が成立しないため。
  RLS の `shift_locks_self_insert` / `_self_delete`（`employee_id = current_employee_id()`）で担保。
- **強制は RLS で行う**。`shift_assignments_admin` を
  `is_admin() and not is_shift_locked(employee_id, work_date)` に変更した。
  - 🔴 **USING と WITH CHECK の両方に条件を入れること。** USING だけだと「ロック日への新規追加」を、
    WITH CHECK だけだと「ロック日の既存行の削除」を防げない。
  - `is_shift_locked(uuid, date)` は SECURITY DEFINER（他人のロック行の可読性に依存させないため）。
- **確定モードでも本人はロックを付け外しできる**（`(employee)/shifts/page.tsx` は
  `editable` を常に true・`setLock` を常に渡す）。管理者が外せない以上、本人がいつでも
  外せないと**解除手段が無くなる**ため。枠ボタン側は `canAssign`（＝`assign`/`clear` の有無）で
  別途制御し、確定モードでは押せないままにしている。
- 表示: 鍵アイコンは**単色フラットのSVG**（`LockIcon`。絵文字は使わない）で、
  **ニックネームラベルの右端に固定**する（名前の直後に置くと名前の長さで位置がばらつくため。
  ラベルを `flex` にし、名前側を `flex-1 truncate`、鍵を `shrink-0` にして右端へ寄せる）。
  - **本人の行**: 常に出る押せるトグル。**オフ＝かなり薄いグレー（`text-gray-300`。
    ひと目で「効いていない」と分かるように）/ オン＝オレンジ（`text-orange-500`）**。
    サイズは `h-5 w-5`（`h-4` だと小さくて状態が読み取りにくかった）。
  - **他の人の行（管理者を含む）**: ロック中のときだけ**黒（`text-gray-900`）**で表示
    （状態表示。押せない）。未ロック時に出すと押せるボタンに見えて紛らわしいため出さない。
  - 🔴 **オレンジ＝「自分のロック」、黒＝「他人のロック」** と色で意味を分けている。
    管理者も1人の従業員として自分の行を持つため、「自分がどこをロックしたか」を
    一覧の中から即座に見分けられるようにするのが狙い。判定は `editableEmployeeId`
    ではなく **`meId`** で行う（編集可否とロックの所有者は別概念。管理者画面では
    `editableEmployeeId` が未指定でも自分の行はオレンジにしたい）。
  - 閲覧専用パネルでは、枠が無くロックだけある人を「**勤務不可**」の行として別途表示する
    （枠一覧には現れないため気付けない）。
- **カレンダーの日付セル**: 自分がロックした日は「日」の数字の右にオレンジの鍵
  （`h-3.5 w-3.5`）を出し、月内のどこをロックしているかをひと目で確認できるようにする。
  `myLockedDates`（`locks` を `meId` で絞ったSet）で判定。スワイプ中の空白セル
  （`swipeBlank`）では出さない（日付が消えているのに鍵だけ残ると誤読を招くため）。

### 13.3.2 ✕ 希望の時間帯の衝突表示（2026-08-04追加、2026-08-05判定方法を修正）

**調整中（draft）に、同じ日・同じ枠に異なる従業員の希望が複数入っている日**は、カレンダーの
日付セル左上に**赤い「✕」**を出す。当人同士が気付いて自分で調整できるようにするのが目的。

- 判定は `collisionDates`（`ShiftSchedule.tsx`）。**「同じ日・同じ枠（A/B/C）に異なる
  employee_id が2人以上入っている」ことだけ**を見る（`work_date|slot` をキーに従業員IDの
  Set を作り、サイズが2以上なら衝突）。
- 🔴 **最初の実装（枠の時刻同士を数値比較して重なりを見る方式）は誤りだった。**
  3交代制では引き継ぎのため枠の時刻自体が意図的に重なる（例: 早番 8:00〜17:00 /
  遅番 15:00〜24:00 → 15:00〜17:00が必ず重複）。そのため「早番・遅番・深夜が1人ずつに
  バラけている日」まで衝突と誤判定していた（オーナー実機テストで発覚）。
  **枠の時刻を比較する方式には戻さないこと。** あくまで「同じ枠を取り合っているか」だけを見る。
- 変則時刻（`custom_start`/`custom_end`）は判定に使わない。同じ枠に複数人いれば、
  時刻をずらしていても「枠の取り合い」自体は起きているとみなす（シンプルさ優先）。
- 表示は `mode === "draft"` のときだけ。確定後は管理者が調整済みの前提なので出さない。
  スワイプ中（`swipeBlank`）も出さない（ロック印と同じ理由）。

### 13.4 実装ファイル

- DB: `supabase/migrations/20260727_shift_modes.sql`（`shift_modes`・`shift_period_key()`・
  `is_shift_draft()`・`shift_assignments` の書き込みポリシー）、
  `20260727_shift_draft_show_all.sql`（表示を全員分に戻す）、
  `20260802051500_shift_locks.sql`（`shift_locks`・`is_shift_locked()`・
  `shift_assignments_admin` にロック条件を追加。§13.3.1）。
- 共通: `lib/shifts.ts`（`ShiftMode`/`defaultShiftMode()`/`shiftModeLabel()`）、
  `lib/shift-data.ts`（`loadShiftData` が `mode` を返す）。
- 画面: `admin/shifts/ShiftSchedule.tsx`（見出し「シフト」＋モードバッジ〈確定=ブルー/調整中=イエロー〉。
  管理者はバッジをタップ→確認ダイアログで切替。`mode`/`canSwitchMode`/`setMode`/`editableEmployeeId` prop）。
  **枠ボタンは楽観的更新**（押した瞬間にローカル状態を書き換えてカレンダーへ反映し、保存は裏で行う。
  `useTransition` だとサーバーの再レンダー完了まで反映されず約1秒待たされるため）。
  保存中はサーバー props からの同期を見送り、未反映の操作が消えてちらつくのを防ぐ、
  `admin/page.tsx`（管理者）、`(employee)/shifts/page.tsx`（従業員）。
- アクション: `admin/shifts/actions.ts`（`canEditShift()`/`setShiftMode()`。`assignShift`/`clearShift` は
  管理者専用から「管理者 or 調整中の本人」に緩和）。
- テスト: `lib/shifts.test.ts`（既定モードの判定）。
