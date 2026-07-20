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
- 給与 = 時給 × 勤務時間 + 交通費実費 + 昼食補助（勤務日数 × 定額）− 源泉所得税

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

## 3. データベース設計

Supabase（PostgreSQL）。全テーブルで RLS（行レベルセキュリティ）有効。

### テーブル一覧

| テーブル | 用途 | 主なカラム |
|---------|------|-----------|
| `employees` | 従業員（管理者含む） | id, employee_no, name, furigana(ふりがな・任意), nickname(ニックネーム・任意), color(シフト表の識別色・任意), email, auth_user_id, is_admin, status(active/retired) |
| `shift_assignments` | 勤務予定（1日3枠A/B/Cの交代制・1従業員1日1枠） | employee_id, work_date, slot(A/B/C), unique(employee_id,work_date)。RLS=閲覧は全ログインユーザー・追加/変更/削除は管理者のみ |
| `wage_rates` | 時給履歴（値上げ対応） | employee_id, hourly_wage, effective_from |
| `tax_settings` | 税区分履歴 | employee_id, tax_category(kou/otsu), dependents, effective_from |
| `allowance_settings` | 昼食補助設定 | lunch_allowance_per_day, effective_from |
| `pay_periods` | 給与計算期間 | period_label, start_date, end_date, payment_date, status(open/closed/paid) |
| `work_entries` | 勤務表 | employee_id, work_date, start_time, end_time, break_minutes, transport_cost, transport_mode(手段), station_from(駅1), station_to(駅2), round_trip(往復), note ／ ※深夜勤務(退勤翌日, 例18:00→2:00)を許容するため `end_time > start_time` のCHECK制約は撤去済み。end≤start は翌日とみなし `workMinutes` が24時間加算 |
| `payslips` | 給与明細（締め時に確定保存） | employee_id, pay_period_id, work_days, total_minutes, hourly_wage, base_pay, transport_total, lunch_total, gross_pay, income_tax, net_pay, tax_category, finalized_at, emailed_at |
| `notifications` | 連絡・催促・一斉報知 | sender_id, recipient_id(null=全員), type(individual/broadcast/reminder), subject, body, emailed, sent_at |
| `tax_reports` | 税理士送付記録（※現在は書き込みなし・将来用に残置） | pay_period_id, emailed_to, emailed_at |
| `withholding_tax_table` | 源泉徴収税額表（月額表。国税庁公開の甲欄0〜7人＋乙欄を保持） | year, min_amount, max_amount, tax_kou_0..7, tax_otsu, created_at(取り込み日時) |
| `app_settings` | アプリ設定（キー値） | key, value（gmail_user / tax_accountant_name / tax_accountant_email / company_name） |
| `activity_logs` | 操作ログ（閲覧は管理者のみ・挿入はSECURITY DEFINER関数経由） | created_at, actor_id, actor_name, action, detail ／ 保持90日（`log_activity` 内で超過分を削除・削除自体も記録） |
| `clock_events` | QR打刻の監査ログ（追記専用。管理者=全件、従業員=自分の挿入/参照） | employee_id, type(in/out), event_at, work_entry_id, latitude, longitude, accuracy, distance_m, out_of_range, location_denied, user_agent |

### 主な設計ポイント
- **従業員No の自動採番**: 新規登録時に区分（管理者/従業員）を選ぶと、管理者は `M001〜`、
  従業員は `E001〜` を既存の最大値から自動採番（手入力なし）。管理者は時給・税区分・扶養親族数の入力不要。
- **氏名・ふりがな・ニックネーム・メール編集**: 管理画面の従業員編集（吹き出しパネル）から変更可。
  ふりがな・ニックネームは任意項目（2026-07-19追加）。登録・編集フォームとも入力順は
  「氏名 → ふりがな/ニックネーム（同じ行に横並び）→ メールアドレス」。**メール変更時は `auth_user_id`
  を null に戻して「未登録」化**し、再招待→新メールでの初回登録（email一致で再連携）を促す。
- **招待日**: `employees.invited_at` に最後に招待メールを送った日時を記録（再招待で更新）。未登録の従業員は
  一覧に「招待日 M/D」を表示し、招待ボタンは初回=「招待」/2回目以降=「再招待」になる。
- **時給の値上げ対応**: `wage_rates` に適用開始日つき履歴。勤務日ごとに有効な時給を適用（`effectiveAt()`）。
  **0円を許容**（経営者が現場ヘルプで入る場合など無給勤務の記録用途。DBのCHECK制約・入力欄とも `>=0`）。
- **税区分**: 従業員ごとに甲欄/乙欄・扶養親族数を適用開始日つきで保持。管理画面から変更可。当面は全員乙欄デフォルト。
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
- いずれの SECURITY DEFINER 関数も anon から revoke 済み（`email_registered`・`log_activity` のみ anon 実行可）。
- 従業員は自分のレコードのみ read/write、管理者は全件。`activity_logs` は管理者のみ select。

---

## 4. アプリケーション構成

### ディレクトリ（`src/`）
```
app/
  (employee)/            従業員向け（スマホ基本+PC/iPadは2カラム、下部タブナビ）
    layout.tsx           スマホ:max-w-lg / lg以上:max-w-5xl（ヘッダーはネイビー+ロゴ）
                         最新お知らせの sent_at を取得し EmployeeNav に渡す（未読バッジ用）
    loading.tsx          画面遷移中のスピナー
    nav.tsx              下部ナビ(単色フラットSVGアイコン)。お知らせに未読赤ドット
                         （localStorage `notices_seen_at` と最新お知らせ時刻を useSyncExternalStore で比較）
    timesheet/           勤務表カレンダー入力（page/ui/actions/schema）。ui.tsx の TimesheetCalendar は
                         管理者の /admin/timesheet と共用（save/del アクションと基準パスを props で受ける）。
                         入力スキーマ entrySchema は schema.ts に分離（"use server" は関数しか export 不可のため）。
                         ヘッダは ＜ 年月(text-xl) ＞ + 従業員フィールド(従業員=氏名固定/管理者=セレクト)を1行に。
                         カレンダーは濃いアウトライン(border-2)＋曜日行に塗り。当日背景・祝日赤字・PC/iPad 2カラム。
                         合計は枠(カード)内に「計/日数/時間(h:mm)/交通費」を1行表示、タップで下部を勤務一覧に切替
                         (iPhoneでは「勤務一覧を表示」キャプション省略)。未選択時はカレンダー下(スマホ)/右(PC)に
                         勤務一覧表(日・曜・出勤・退勤・勤務(h:mm右寄せ)・交通費／日と曜は祝日/日=赤・土=青)を表示、
                         日タップで入力枠。新規(未入力)日は最後に表示/入力した内容を既定値に流用(WorkListの行や
                         既存日を開くと既定値更新、保存時も保持)。入力欄の 登録/更新 ボタンは日付見出しの右上。
                         交通費は 手段/区間1/区間2/往復・片道/金額 を全入力 or 全空欄（サーバ側 refine）。
                         深夜勤務(退勤翌日, 例18:00→2:00)対応=workMinutesが end≤start に24時間加算
    payslips/            給与明細閲覧（内側 max-w-lg で狭幅維持）
    notices/             お知らせ閲覧（内側 max-w-lg）。開くと既読化（赤ドット消去）
  admin/                 管理者向け（レスポンシブ。md以上は左サイドバー/スマホは下部タブナビ、ネイビー）
    layout.tsx           認証ガード + ナビ（md以上=左縦サイドバー、スマホ=上部スリムヘッダー+下部タブナビ）
                         サイドバー最下部に ver.（ビルド時刻 NEXT_PUBLIC_BUILD_TIME）を表示
                         スマホは main に pb-24 を付け下部ナビと重ならないようにする
    nav.tsx              Logo / AdminSidebarNav / AdminBottomNav（現在ページをハイライト）
                         メニュー(アイコン+キャプション): ホーム(家) / 勤務表(カレンダー) /
                         給与明細(¥) / 従業員(人が重なる) / 配信(紙飛行機) / 設定(歯車) / ログ(書類)。
                         下部タブナビはヘッダと同じネイビー背景＋白アイコン/文字（従業員ナビも同配色）。
                         スマホ下部タブは主要4項目＋「その他」(ハンバーガー)で、配信・設定・ログは右下の
                         最小幅カード(右寄せ)に収める。「配信」は PC サイドバーでは従業員の直後に並ぶ。
                         ※「税理士資料」はメニュー・画面とも廃止（部品は close から利用）
    logs/                操作ログ閲覧(管理者)。表形式=時刻｜種別バッジ｜操作者｜詳細、1行1ログ・列揃え、
                         日替わりで太い区切り線。新しい順・最新300件。
                         種別バッジの配色は**4段階のランク制**（2026-07-19導入）。カテゴリ(action文字列)ごとに
                         色を決め打ちせず、まずランクを割り当ててからランクの色を適用する（`src/app/admin/logs/page.tsx`
                         の`RANK_BY_ACTION`/`RANK_CLASS`）。詳細は「6.2 操作ログのランク制」参照。
    loading.tsx          画面遷移中のスピナー（連打防止・iPad体感改善）
    page.tsx             ホーム=シフト予定表(2026-07-19に旧ダッシュボードから置換)。ShiftSchedule を editable で表示。
                         右上に状態バッジ。旧 DashboardCalendar(勤務者数カレンダー)は廃止。
    shifts/              シフト予定表の共有部品(ShiftSchedule.tsx=管理者は編集可/従業員は閲覧のみ)と
                         サーバーアクション(assignShift/clearShift)。カレンダーの各日にニックネームを色付きチップで表示、
                         予実相違(get_shift_status が match 以外)の従業員名を太字の赤字にする。従業員側は
                         (employee)/shifts/page.tsx が同じ ShiftSchedule を読み取り専用で使う。詳しくは「8. 勤務予定・シフト管理」
    timesheet/           管理者用の勤務表（page/actions）。従業員用 TimesheetCalendar を共用し、
                         右上の従業員セレクトで対象を切替(?e=)、管理者は任意従業員の勤務記録を CRUD。
                         RLS の work_entries_admin(ALL/is_admin) により締め済みでも編集可(closed=false固定)
    employees/           従業員管理（登録・氏名/メール編集・時給・税区分・退職・招待・パスワード再設定・完全削除）
                         区分(管理者M/従業員E)を選んで自動採番。一覧は iPhone 考慮で「氏名/招待状態/状態」
                         の3列に集約し、行タップで吹き出し詳細(レスポンシブ)を開く。詳細トップに
                         パスワード再設定 / 招待・再招待ボタン。招待状態=未招待→招待済→登録済
    close/               締め処理 + 税理士資料を統合（プレビュー・締め・支払済み・明細メール配信）。
                         タイトルは省略、期間は「締め日：{終了日}、支払日 {支払日}」の1行。操作ボタンはヘッダ部に配置。
                         締め済みは 1行目=締め解除/支払済みにする、2行目=明細をメール配信(アイコン+「従業員へ」)/
                         税理士へ(アイコン+「税理士へ」)/印刷PDF(プリンタ)/CSV(下矢印)。明細配信は0円明細を宛先除外。
                         見出し下に 総支給/源泉所得税/差引支給 を1項目1行・濃い黒字・金額右寄せで表示。
                         表は No 省略・氏名1行・日数/時間は単位なし数字(時間は H:MM)・所得税も改行させない
    notices/             連絡・催促・一斉報知の送信（メニュー名「配信」・画面タイトルも「配信」）。
                         個別=管理者にCC / 一斉=管理者にも配信。フォームは sm:2カラム、送信履歴は折返し対応
    report/              税理士資料の部品のみ残置（page は廃止）。actions.ts(sendTaxReport/buildTaxReportCsv)と
                         ui.tsx(税理士メール送信/印刷PDF/CSV のアイコンボタン)を close から利用
    settings/            メール設定（会社名/送信元/税理士 氏名・アドレスを2カラム）・昼食補助・源泉徴収税額表。
                         右上に ver.表示。税額表は「源泉徴収税額表(月額表)」Web検索リンク＋手順、Excelからの
                         タブ区切り貼付に対応（桁区切りカンマ除去→タブをカンマ化、空行スキップ、数字のみ正規化）。
                         年度ごとに取り込み日時を表示。取り込みは例外安全化し body上限を5mbに拡張（next.config）
    settings/clock.tsx   QR打刻の位置設定＋出退勤QRの生成/印刷/PDFダウンロード。PC(lg以上)は地図を左2/3(縦長 lg:h-96)、
                         許容半径/圏外の扱い/丸め/保存ボタンを右1/3に配置（スクロール時の地図ズーム誤操作を軽減）。
                         印刷内容: 「{会社名}　出退勤登録用QRコード」＋大QR2つ＋説明3項目（丸め単位を反映）。
                         QR画像の縦横比は `aspect-ratio`+`object-fit:contain` で固定（2026-07-19、伸びて表示される
                         不具合を修正）。
                         **「印刷」は独立した別ウィンドウ方式**（2026-07-19に変更・重要）: 従来は現在のページの
                         `document.body` にクラスを付けて他要素を `display:none` にする方式だったが、環境により
                         空白の2ページ目が生成される不具合が再発した（`min-height`→`height+overflow:hidden`や
                         改ページ抑止のCSSでも解消できなかった）。原因を切り分けられなかったため、**印刷内容専用の
                         完全に独立したHTMLを `window.open("", "_blank")` で新しいウィンドウに書き出し、そこで
                         `print()` する方式**に変更（`handlePrint()`）。同じページの他の要素が一切混ざらないため、
                         空白ページの原因を構造的に排除できる。ポップアップブロック時は alert で案内。
                         **⚠️ それでも空白2ページ目が解消しなかったため追加対応**（2026-07-19・重要）:
                         印刷シートの高さを `297mm`(用紙1枚分)に固定して `@page{margin:0}` を指定していたが、
                         これは「OS/ブラウザが独自に確保する印刷余白」と競合し、指定した`297mm`がその分
                         用紙からはみ出して2ページ目に流れ込む可能性がある。対策として、**シートの高さ固定
                         (`min-height`/`height`)と`@page`の`margin:0`指定の両方を撤廃**し、内容(タイトル+QR2つ+
                         注意書き)の実寸なりの高さ(1ページに十分収まる分量)で描画し、余白はOS/ブラウザの既定に
                         委ねる方式にした。「用紙1枚分ぴったりに強制する」のではなく「明らかに1ページに収まる
                         分量にして、はみ出す余地自体を無くす」という考え方に転換している。
                         「PDFダウンロード」ボタンも用意（2026-07-19）: iPhone/iPad を**ホーム画面に追加した状態
                         (PWA standalone)では `window.print()`（別ウィンドウ経由でも）が動作しない可能性がある**
                         WebKit側の制限があるため、印刷に頼らない代替手段として実装。仕組みは `html2canvas` で
                         非表示の印刷用シート(`.qr-print-sheet`。PDF生成専用。印刷とは別実装)を画像化し、
                         `jsPDF` でA4 1枚のPDFに貼り付けて保存する（日本語テキストはブラウザ側のcanvas描画に
                         任せるため、jsPDF側に日本語フォントを埋め込む必要がない）。依存追加:
                         `html2canvas`/`jspdf`（動的import・クライアント側のみ・ボタン押下時にのみ読み込む）。
                         **「印刷」ボタンの表示制御**: iPhone/iPad を**ホーム画面に追加した状態(PWA standalone表示)
                         では `window.print()` が動作しない**ため、その環境を検出して「印刷」ボタン自体を非表示に
                         する（PDFダウンロードのみ案内）。検出は `navigator.userAgent` の iPad/iPhone/iPod 判定 +
                         iPadOS が macOS を名乗る問題への対応（`navigator.platform==="MacIntel"&&maxTouchPoints>1`）
                         ＋ `navigator.standalone`（iOS固有）または `matchMedia("(display-mode: standalone)")` で判定。
  login/                 ログイン
  register/              初回登録（メールのみ入力→マジックリンク送信）
  set-password/          マジックリンク/再設定リンク後のパスワード設定
  auth/callback/         Supabase 認証コールバック。token_hash+verifyOtp で初回登録(magiclink)・
                         再設定(recovery)を検証。setup=1/recovery で /set-password へ
  install/               スマホのホーム画面に追加してもらうための案内ページ（2026-07-19追加）。
                         未ログインでもQRから直接開けるよう公開（middlewareの publicPaths に追加）。
                         `AddToHomeScreenBanner`（下記）を表示するだけの薄いラッパー。設定画面
                         「出勤・退勤QRコード」の下部に、このページへのQR（出退勤QRより小さめ）を表示する
                         （`admin/settings/clock.tsx`。出退勤QRとは別に生成、印刷/PDF出力には含まない・
                         画面表示のみ）。
  manifest.ts            PWA マニフェスト（/manifest.webmanifest）
  pwa/
    ReloadPrompt.tsx     更新バナー（新版検知→ワンタップ更新）
    reloadApp.ts         ロゴ1タップ最新化（LogoButtonから使用）
    AddToHomeScreenBanner.tsx  ホーム画面追加の手順を端末判定して案内するバナー（2026-07-19追加）。
                         iOS/Android/LINE内蔵ブラウザを判定し、Android+通常ブラウザは`beforeinstallprompt`を
                         使ったワンタップ追加、iOSは共有ボタンからの手順テキスト、LINE内蔵ブラウザは
                         外部ブラウザ(Chrome/Safari)で開き直す案内を出し分ける。既にスタンドアロン起動中や
                         PC等の対象外環境では何も表示しない。**`/install`ページ専用**（アプリ全体には常設しない。
                         下部固定表示のため通常利用中は下部タブナビと重なってしまうため）。
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
- `requireAdmin()` で管理画面を保護。ログイン後、管理者は `/admin`、従業員は `/timesheet` へ。
- 最初の管理者: employee_no `0001`（seed 投入済み）。
- **Supabase 認証メール**: カスタムSMTP（自社Gmail）を設定済み。無料枠のままテンプレート編集が可能な状態
  （Authentication → Emails）。件名/本文は運用側で日本語化する。送信はレート制限があり、テスト連投で
  一時的に届かなくなることがある（数十分で回復）。

### 給与計算エンジン（`lib/payroll.ts`）
- `computePayslip()`: 勤務日ごとに時給を適用して基本給を日割り（分単位、日ごとに切り捨て）、昼食補助 = 勤務日数 × 定額、交通費 = 実費合計。
- `computeIncomeTax()`: 源泉所得税。
  - 課税対象額（基本給+昼食補助）が **月88,000円未満** → 乙欄は 3.063% 切り捨て、甲欄は 0円
  - **88,000円以上** → `withholding_tax_table`（設定画面から貼付取込。形式は国税庁公開様式に準拠: 以上,未満,甲0〜甲7,乙。乙欄のみ3列も可）を参照。取り込み済みデータは設定画面に表形式で表示。甲欄は扶養0〜7人まで参照（`Math.min(dependents,7)`）。データが無ければエラーで締めを止める（誤計算防止）。
    - 取込時、国税庁月額表の先頭にある「(最小額)円未満→0」の変則行（未満欄が空で「以上」に最小額が入る行）は**取り込み対象外**（上限なしの正当な行は最終行=最大の「以上」のみ）。その帯（=**表の最小「以上」金額未満**）は `computeIncomeTax` が**非課税(0円)**と判定する。
  - 国税庁からの自動取得は非対応（NTAは月額表をPDF/Excelでのみ公開しており安定した機械可読源が無く、当環境からnta.go.jpはネットワーク遮断のため）。年に1度、国税庁の月額表を貼り付けて取り込む運用。
- テストは `npm test`（Vitest 18件）。

### メール送信（`lib/smtp.ts` / `lib/email.ts`）
- 外部ライブラリなし。`cloudflare:sockets` で smtp.gmail.com:465 に TLS 接続し AUTH PLAIN。
- 送信元・会社名（差出人名）・税理士アドレスは DB（app_settings）から取得。パスワードは env（Secret）。
- **ローカル開発では送信不可**（cloudflare:sockets は本番Workersのみ）。未設定・失敗時はエラーメッセージを返し、アプリ内通知は動作。
- 用途: ①招待メール ②パスワード再設定メール（Supabase Auth 経由）③給与明細配信
  ④連絡・催促 ⑤税理士向け資料（CSV添付）。
  - 連絡は宛先が空＝全員（一斉報知）、宛先を選べば個別。両方とも有効（種別は連絡/催促）。
    **個別連絡は管理者に CC、一斉報知は管理者にも配信**（`getAdminEmails()` を利用）。
  - 併送失敗時は失敗理由（例: アプリパスワード未設定）を画面に表示。
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

### PWA / 自動更新（Service Worker）
ホーム画面追加した PWA で、エンドユーザーが**ロゴ1タップで最新化**でき、新版デプロイ時に
**「新しいバージョンがあります」バナー**で更新を促す仕組み。

- **最小 Service Worker**: `scripts/generate-sw.mjs` がビルド時に `public/sw.js` を生成し、
  `SW_VERSION`（git 短縮SHA）を刻印する。この SW は **`fetch` ハンドラを持たない**（＝リクエストを
  一切横取りしない）ため、App Router のナビゲーション/RSC を壊さない。役割は「更新検知」と
  `SKIP_WAITING` による有効化のみ。`activate` で旧キャッシュを掃除し `clients.claim()`。
- **更新バナー**: `src/app/pwa/ReloadPrompt.tsx`（素の `navigator.serviceWorker`）。ルート
  `layout.tsx` に常設。登録後は約1分間隔で `registration.update()` をポーリングし、`SW_VERSION` が
  変わった新版を検知するとバナー表示 → タップで `SKIP_WAITING` → `controllerchange`（＋約0.8秒の
  フォールバックタイマー）でリロード。初回インストール時は誤リロードしないよう `controller` の有無でガード。
  - **バナーの重複表示防止**: 待機中の新 SW は1つでも、`reg.waiting`/`updatefound`/ポーリング/
    `visibilitychange` の複数経路が同じ SW に対して `showBanner` を呼ぶため、以前は1デプロイで2〜3回出た。
    通知済みの `ServiceWorker` インスタンスを ref に記録し**同一版は1回だけ通知**（✕で閉じた版も再ポップせず、
    別インスタンス＝新デプロイのときだけ再表示）。
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
（`src/app/admin/logs/page.tsx` の `RANK_BY_ACTION`／`RANK_CLASS`）。新しいログカテゴリを追加する際は、
まずこの4ランクのどれに該当するかを判断してから `RANK_BY_ACTION` に追記すること（個別に色を決めない）。

| ランク | 色 | 意味 | 該当カテゴリ |
|--------|-----|------|-------------|
| 1. ルーチン | グレー（`bg-gray-100 text-gray-600`） | 必要に応じて参照する日常操作の情報 | ログイン、打刻、ログ削除（90日超過分の自動間引き） |
| 2. イベント | ブルー（`bg-blue-50 text-blue-700`） | 不定期に発生する重要な作業 | パスワード設定、メール送信、削除（従業員の完全削除） |
| 3. 警告 | オレンジ（`bg-amber-50 text-amber-700`。**従来「パスワード設定」に使っていた色をそのまま踏襲**） | 管理者として注視すべき状況 | 打刻拒否（圏外・reject方針）、圏外打刻（警告のみ方針で通した分） |
| 4. エラー | 赤（`bg-red-50 text-red-700`） | システム例外・処理失敗など管理者対応/復旧が必要な状況 | DB書き込み失敗（出勤/退勤打刻・従業員削除等）、締め処理失敗、税額表取込失敗、メール送信失敗（サービスから返されたエラー） |

- 未知のカテゴリ（`RANK_BY_ACTION` に無い action 文字列）は既定でルーチン扱い（グレー）にする。
- 「削除」（従業員の完全削除）は本来アプリの意図した操作だが不定期かつ重要なため**イベント**に分類し、
  「打刻拒否」「圏外打刻」のような**異常系（管理者が注視すべき状況）とは区別**している
  （システムの正常動作としての削除 vs. 想定外の状況を示す警告、という違い）。
- 「エラー」ランクは**真のシステム例外専用**とする方針（2026-07-19に明確化）。当初は「打刻拒否(圏外)」も
  「エラー」で記録していたが、これは運用上想定内の状況であり管理者の復旧対応を要しないため「警告」ランクの
  専用カテゴリに切り出した（詳細はハンドオーバー参照）。

---

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
- 1日3枠の交代制。DB上の枠キーは固定で `A`/`B`/`C`、既定の表示名・時刻は **早番 8:00-17:00 / 遅番 15:00-24:00 / 深夜 24:00-9:00**。
- 枠のラベル・時刻は `app_settings`（`shift_slot_{a,b,c}_{label,start,end}`）に保存し、
  **管理画面「設定」→「シフト枠」から編集可能**（`updateShiftSlots`）。深夜0時は「24:00」表記のまま保持し、
  `<input type=time>` や比較用には `toInputTime()`/`norm_hhmm()` で "00:00" 等に正規化する（`src/lib/shifts.ts`）。

### 8.2 シフト予定表（ホーム画面）
- 管理者ホーム(`/admin`)を**シフト予定表に置換**。従業員も `(employee)/shifts`(`/shifts`・下部ナビに「シフト」タブ追加)で閲覧可能。
- 給与期間カレンダーの各日に、枠（早番/遅番/深夜）ごとの担当者を**ニックネーム**の色付きチップで表示（全員が全員のシフトを閲覧可）。
- カレンダーのセルは**縦位置で枠を表現**（上段=早番/中段=遅番/下段=深夜）し、
  各人を**横幅いっぱいの色帯＋ニックネーム**で表示（実運用の紙カレンダーに合わせたレイアウト）。
- 予定入力は**管理者のみ**（日をタップ→従業員ごとに枠を選択/解除）。今後の運用で入力者を変える可能性あり。
- カレンダー上部は、編集可能な画面(管理者)のみ「日をタップしてシフトを指定してください」を表示。
  **カレンダーの直下**に、枠の時刻一覧（早番 8〜17時、遅番 15〜24時、深夜 24〜9時。**時(HH)のみの短縮表記**=
  `slotHourRangeLabel()`）と、続けて「太字＝実績入力済み。赤太字＝予定と実績が相違」を表示（枠なしテキスト。
  従業員・管理者どちらの画面にも共通表示）。以前はシフト編集パネル内にのみ表示していたが、従業員も枠時刻を
  確認できるようカレンダー直下（両画面共通）に移した。ホーム画面上部の期間ステータスバッジ（受付中/締め済み等）は
  2026-07-19にシフト予定表へ置換した際に廃止済み。
- カレンダーのセルは日付を**中央寄せ・大きめのフォント**で表示し、曜日見出しも大きめのフォントにしている
  （旧: ダッシュボードのカレンダーは日付右寄せ・小さいフォントだったが、勤務表カレンダーのスタイルに合わせた）。
  **セルの余白は最小限**（margin無し・padding無し、区切りは細い border のみ）にして、ニックネーム＋変則時刻
  短縮表記（例「けーやん20〜」）が5文字程度まで収まるようにしている。隣接セルとほぼ接するレイアウトを許容。
- **ニックネームのフォント表示区分**（`nicknameStyle()`）: 実績未入力(missing)は通常フォント、
  実績が予定と合致(match)は**黒字の太字**、実績と不一致(timediff/unplanned)は**赤字の太字**。
- 各割当に**変則勤務時間**（`shift_assignments.custom_start`/`custom_end`。例「20:00」）を任意で設定でき、
  入力時は枠の既定時刻を上書きして予実判定（`get_shift_status`）に使う。カレンダーのチップには
  変則時刻の**時(HH)のみ**を短縮表示（`shiftNoteLabel()`。例「20〜」「〜7」「20〜7」）。
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
  色分け＋日ごとの横線で表示。予定と実績で時刻が相違する箇所は実績側を赤太字にする。カレンダー本体は従来通り**実績のみ**表記。
- 勤務表で**実績を新規入力するとき、その日のシフト予定の時刻を出勤・退勤の初期値に表示**する（既存レコードがあればそれを優先）。
- シフト予定は `shift_assignments` から表示中従業員ぶんを取得し `buildShiftMap()` で `work_date -> ShiftInfo` に変換して渡す。

### 8.5 実装ファイル
- DB: `supabase/migrations/20260719_add_shift_scheduling.sql`（適用済みスキーマの記録。シフト関連一式）。
  時給0円許容の制約変更は別ファイル `supabase/migrations/20260719_allow_zero_wage.sql`（シフト機能とは無関係の派生対応）。
- 共通: `src/lib/shifts.ts`（枠定義・色・正規化・予実状態型）、`src/lib/shift-data.ts`（`loadShiftData`）。
- 画面: `src/app/admin/shifts/{ShiftSchedule.tsx,actions.ts}`、`src/app/admin/page.tsx`、`src/app/(employee)/shifts/page.tsx`。
- 勤務表: `src/app/(employee)/timesheet/{ui,page}.tsx`、`src/app/admin/timesheet/page.tsx`。
- 従業員色: `src/app/admin/employees/{ui,actions,page}.tsx`。設定: `src/app/admin/settings/{ui,actions,page}.tsx`。
- 打刻交通費: `src/app/clock/{page,ui,actions}.ts(x)`。
