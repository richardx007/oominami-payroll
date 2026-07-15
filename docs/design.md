# 給与管理システム 設計書

最終更新: 2026-07-11
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
| `employees` | 従業員（管理者含む） | id, employee_no, name, email, auth_user_id, is_admin, status(active/retired) |
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

### 主な設計ポイント
- **従業員No の自動採番**: 新規登録時に区分（管理者/従業員）を選ぶと、管理者は `M001〜`、
  従業員は `E001〜` を既存の最大値から自動採番（手入力なし）。管理者は時給・税区分・扶養親族数の入力不要。
- **氏名・メール編集**: 管理画面の従業員編集（吹き出しパネル）から変更可。**メール変更時は `auth_user_id`
  を null に戻して「未登録」化**し、再招待→新メールでの初回登録（email一致で再連携）を促す。
- **招待日**: `employees.invited_at` に最後に招待メールを送った日時を記録（再招待で更新）。未登録の従業員は
  一覧に「招待日 M/D」を表示し、招待ボタンは初回=「招待」/2回目以降=「再招待」になる。
- **時給の値上げ対応**: `wage_rates` に適用開始日つき履歴。勤務日ごとに有効な時給を適用（`effectiveAt()`）。
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
                         給与明細(¥) / 従業員(人が重なる) / 設定(歯車) / ログ(書類)。
                         下部タブナビはヘッダと同じネイビー背景＋白アイコン/文字（従業員ナビも同配色）。
                         スマホ下部タブは主要4項目＋「メニュー」(ハンバーガー)で、設定・ログは右下の
                         最小幅カード(右寄せ)に収める。
                         ※「連絡」は画面は残すがメニュー非表示、「税理士資料」はメニュー・画面とも廃止
    logs/                操作ログ閲覧(管理者)。表形式=時刻｜種別バッジ｜操作者｜詳細、1行1ログ・列揃え、
                         日替わりで太い区切り線。新しい順・最新300件
    loading.tsx          画面遷移中のスピナー（連打防止・iPad体感改善）
    page.tsx             ホーム(旧ダッシュボード)。＜ 年月 ＞ + 状態バッジのみ(タイトル/期間表示は廃止)。
                         下部の人別一覧表は廃止(締め処理と重複のため)
    DashboardCalendar.tsx  給与期間カレンダー(濃いアウトライン border-2＋曜日行に塗り)。日ごとに勤務者数の
                         ドット、日クリックでその日の勤務者一覧を表示。一覧は 氏名｜出勤〜退勤(h:mm)・交通費 を
                         1行・列位置をそろえて出勤時刻順に表示。iPhone(既定1カラム)はカレンダー下、lg以上は右
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
    notices/             連絡・催促・一斉報知の送信（メニュー非表示だが /admin/notices で到達可）。
                         個別=管理者にCC / 一斉=管理者にも配信
    report/              税理士資料の部品のみ残置（page は廃止）。actions.ts(sendTaxReport/buildTaxReportCsv)と
                         ui.tsx(税理士メール送信/印刷PDF/CSV のアイコンボタン)を close から利用
    settings/            メール設定（会社名/送信元/税理士 氏名・アドレスを2カラム）・昼食補助・源泉徴収税額表。
                         右上に ver.表示。税額表は「源泉徴収税額表(月額表)」Web検索リンク＋手順、Excelからの
                         タブ区切り貼付に対応（桁区切りカンマ除去→タブをカンマ化、空行スキップ、数字のみ正規化）。
                         年度ごとに取り込み日時を表示。取り込みは例外安全化し body上限を5mbに拡張（next.config）
  login/                 ログイン
  register/              初回登録（メールのみ入力→マジックリンク送信）
  set-password/          マジックリンク/再設定リンク後のパスワード設定
  auth/callback/         Supabase 認証コールバック。token_hash+verifyOtp で初回登録(magiclink)・
                         再設定(recovery)を検証。setup=1/recovery で /set-password へ
  manifest.ts            PWA マニフェスト（/manifest.webmanifest）
  pwa/
    ReloadPrompt.tsx     更新バナー（新版検知→ワンタップ更新）
    reloadApp.ts         ロゴ1タップ最新化（LogoButtonから使用）
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
  管理者発行の再設定=recovery / ログイン画面「パスワードを忘れたら」=recovery）。いずれも
  `/auth/callback` が `verifyOtp({ token_hash, type })` で検証し、`setup=1` または `type=recovery` で
  `/set-password` へ。**`code` + `exchangeCodeForSession` 経路は使わない**（PKCE のため後述の弱点がある）。
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
    `emailRedirectTo=/auth/callback?setup=1`）。
  - 管理者発行の再設定: `resetEmployeePassword`（`employees/actions.ts`）が implicit クライアントで
    `resetPasswordForEmail`。
  - ログイン画面の自己申請: `requestPasswordReset`（`login/actions.ts`）が同様に implicit で送信。
    実際の送信失敗（レート超過など）は画面に表示する（空欄時のみ送信せず入力を促す）。
  - ログイン用の通常ブラウザ/サーバークライアント（セッション管理）は **PKCE のまま**（影響を分離）。
- **これは Supabase 側の設定変更が2つ必須**（コードだけでは直らない）: Authentication → Emails の
  - **「Magic Link」**テンプレート →
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1`
  - **「Reset password」**テンプレート →
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1`
  - 既定の `{{ .ConfirmationURL }}` のままだと PKCE リンク（`/auth/v1/verify?token=pkce_...`）になり壊れる。
    テンプレの「Reset template（初期化）」を実行すると既定に戻り再発する。
  - この認証パターンはスキル `.claude/skills/supabase-invite-auth/` に文書化済み。
- `/set-password` でパスワードを設定（`updateUser`）→ 完了。サービスロールキーは不要
  （anon/公開キー + ユーザーセッションのみ）。**過去パスワードとの一致チェックは不要方針**のため、
  Supabase(GoTrue)が返す `same_password` エラー（「以前と同じパスワード」）は成功扱いにして
  そのまま進める（同じパスワードでも再設定可）。8文字以上・確認一致の検証は維持。
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
| GMAIL_APP_PASSWORD | **Cloudflare Secret** | Gmailアプリパスワード（2段階認証必須） |
| gmail_user / tax_accountant_email / company_name | **DB: app_settings** | 管理画面の「設定」から変更 |

### Supabase Auth 設定（本番URL）
- Authentication → URL Configuration:
  - Site URL: `https://oominami-payroll.shinsekai.workers.dev`
  - Redirect URLs: `https://oominami-payroll.shinsekai.workers.dev/auth/callback`
    （`?setup=1` 付きも同じパスなので許可される）
- Authentication → SMTP Settings: カスタムSMTP（自社Gmail）設定済み。
  これにより無料枠のままメールテンプレートを編集可能（件名/本文の日本語化は運用対応）。
- **メールテンプレートは2つとも token_hash リンクに変更必須**（既定の `{{ .ConfirmationURL }}` = PKCE の
  ままだと初回登録・再設定が「別端末で開くと /login に戻る」形で壊れる。詳細は「4. 認証・ロール」）:
  - **「Magic Link」**（初回登録で使用）:
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1`
  - **「Reset password」**（パスワード再設定で使用）:
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&setup=1`
  - どちらのテンプレも「Reset template（初期化）」を実行すると既定に戻り再発するので注意。
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
  変わった新版を検知するとバナー表示 → タップで `SKIP_WAITING` → `controllerchange` でリロード。
  初回インストール時は誤リロードしないよう `controller` の有無でガード。
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

---

## 7. QR打刻（ドラフト・未実装）

> ステータス: **検討段階のドラフト**。実装前の設計メモ。目的は「従業員の入力の手間・誤入力の低減」。
> 偽装対策は現時点では厳密に求めず、「見られている」という抑止感を与えられれば十分。運用前のため
> **環境トラブルに融通が効く（打刻に失敗しても後から手修正できる）ゆるめの設計**を優先する。

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
- 割り切り: 屋内GPS誤差・位置偽装は防ぎきれない。**サーバー時刻で時刻改ざんは防止**でき、位置は主に抑止目的。

### 7.4 想定するDB追加（実装時）
- `clock_events`（打刻の監査ログ・追記専用）: `employee_id`, `type`(in/out), `event_at`(timestamptz),
  `work_entry_id`(紐付け先), `latitude`, `longitude`, `accuracy`, `distance_m`, `out_of_range`(bool),
  `location_denied`(bool), `user_agent`。→ ここから `work_entries` に反映。
- `work_entries` の **`end_time` を NULL 許容に変更**（退勤ブランクの許容。7.2.1）。打刻由来の補助列（任意）:
  `clock_in_at` / `clock_out_at`（打刻時刻の原本保持）等。
- `app_settings` に位置ポリシー: `clock_base_lat` / `clock_base_lng`（地図ピン留めで確定）/
  `clock_radius_m` / `clock_out_of_range`(reject|warn) を追加。住所文字列は保持しない（座標のみ）。

### 7.5 画面・その他
- `/clock`（確認・OK。type と位置取得を扱うクライアント＋確定はサーバーアクション）。
- 設定画面: QR生成・印刷、基準住所/半径/圏外時の扱い。
- （任意）管理者向けに「圏外・位置未許可の打刻」一覧、または操作ログ（`activity_logs`）へ打刻・圏外を記録。
- 融通のための原則: **打刻はあくまで補助入力**で、勤務表からの手修正を常に許す（打刻失敗＝勤怠不能にしない）。

### 7.6 決定事項・未決事項
- **決定**: 基準位置は**地図ピン留めで座標保存**（外部ジオコーディングAPI不使用）。地図は
  **Leaflet＋OpenStreetMapタイル（完全無料・キー不要）**。
- **未決**: 未退勤のまま日付が変わった場合の扱い（自動締め切りの要否／退勤ブランクのまま許容で十分か）。
- **要確認（実装時）**: OSMタイルはブラウザが直接取得するため、アプリの CSP／PWA(サービスワーカー)設定で
  `tile.openstreetmap.org` への接続・画像読み込みを許可する必要がある（Leaflet はバンドルして自ホストから配信）。
- QRの固定URLゆえ「その場にいなくても開ける」点は許容（位置チェックで抑止）。
