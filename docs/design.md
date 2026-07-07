# 給与管理システム 設計書

最終更新: 2026-07-07
対象リポジトリ: `richardx007/oominami-payroll`
本番URL: https://oominami-payroll.shinsekai.workers.dev

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
| メール送信 | Gmail SMTP（自前の最小SMTPクライアント `src/lib/smtp.ts`） |
| バリデーション | Zod v4 |
| テスト | Vitest（給与計算ロジック） |
| PDF | ブラウザの「印刷 / PDF保存」機能を利用（専用ライブラリなし） |

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
| `work_entries` | 勤務表 | employee_id, work_date, start_time, end_time, break_minutes, transport_cost, note |
| `payslips` | 給与明細（締め時に確定保存） | employee_id, pay_period_id, work_days, total_minutes, hourly_wage, base_pay, transport_total, lunch_total, gross_pay, income_tax, net_pay, tax_category, finalized_at, emailed_at |
| `notifications` | 連絡・催促・一斉報知 | sender_id, recipient_id(null=全員), type(individual/broadcast/reminder), subject, body, emailed, sent_at |
| `tax_reports` | 税理士送付記録 | pay_period_id, emailed_to, emailed_at |
| `withholding_tax_table` | 源泉徴収税額表（月額表） | year, min_amount, max_amount, tax_kou_0..3, tax_otsu |
| `app_settings` | アプリ設定（キー値） | key, value（gmail_user / tax_accountant_email / company_name） |

### 主な設計ポイント
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
- 従業員は自分のレコードのみ read/write、管理者は全件。

---

## 4. アプリケーション構成

### ディレクトリ（`src/`）
```
app/
  (employee)/            従業員向け（スマホ基本、下部タブナビ）
    layout.tsx, nav.tsx
    timesheet/           勤務表カレンダー入力（page/ui/actions）
    payslips/            給与明細閲覧
    notices/             お知らせ閲覧
  admin/                 管理者向け（レスポンシブ、上部ナビ青ヘッダー）
    layout.tsx           認証ガード + ナビ
    page.tsx             入力状況ダッシュボード
    employees/           従業員管理（登録・時給・税区分・退職・招待メール）
    close/               締め処理（プレビュー・締め・支払済み・明細メール配信）
    notices/             連絡・催促・一斉報知の送信
    report/              税理士向け給与支給一覧（印刷/PDF・メール送信）
    settings/            メール設定・昼食補助・源泉徴収税額表
  login/                 ログイン
  register/              初回登録（メール確認フロー）
  auth/callback/         Supabase 認証コールバック
  layout.tsx, page.tsx, globals.css
lib/
  supabase/              client.ts / server.ts / middleware.ts
  auth.ts                requireEmployee() / requireAdmin()
  period.ts              給与期間（26日〜25日）計算・勤務分計算
  payroll.ts             給与計算エンジン（純粋関数）
  payroll.test.ts        Vitest テスト（18件）
  payroll-data.ts        DBから集計して計算（締め/プレビュー共通）
  email.ts               メール送信・設定取得（DB優先）
  smtp.ts                Gmail SMTP 最小実装（cloudflare:sockets）
middleware.ts            未認証は /login へ
```

### 認証・ロール
- Supabase Auth（メール+パスワード）。初回登録は「登録済みメールのみ受付 → サインアップ → 確認メール → employees 行に紐付け」。
- `requireAdmin()` で管理画面を保護。ログイン後、管理者は `/admin`、従業員は `/timesheet` へ。
- 最初の管理者: employee_no `0001`（seed 投入済み）。

### 給与計算エンジン（`lib/payroll.ts`）
- `computePayslip()`: 勤務日ごとに時給を適用して基本給を日割り（分単位、日ごとに切り捨て）、昼食補助 = 勤務日数 × 定額、交通費 = 実費合計。
- `computeIncomeTax()`: 源泉所得税。
  - 課税対象額（基本給+昼食補助）が **月88,000円未満** → 乙欄は 3.063% 切り捨て、甲欄は 0円
  - **88,000円以上** → `withholding_tax_table`（管理画面からCSV取込）を参照。データが無ければエラーで締めを止める（誤計算防止）。
- テストは `npm test`（Vitest 18件）。

### メール送信（`lib/smtp.ts` / `lib/email.ts`）
- 外部ライブラリなし。`cloudflare:sockets` で smtp.gmail.com:465 に TLS 接続し AUTH PLAIN。
- 送信元・会社名（差出人名）・税理士アドレスは DB（app_settings）から取得。パスワードは env（Secret）。
- **ローカル開発では送信不可**（cloudflare:sockets は本番Workersのみ）。未設定・失敗時はエラーメッセージを返し、アプリ内通知は動作。
- 用途: ①招待メール ②給与明細配信 ③連絡・催促（メール併送チェック）④税理士へ支給一覧。
- `Message-ID` ヘッダー付き（迷惑メール判定対策）。

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

### 無料枠での運用
- Supabase 無料 / Cloudflare Workers 無料 / Gmail SMTP（無料枠）で運用。
- Supabase 無料プロジェクトは長期未アクセスで一時停止する点に注意（現状 cron ping は未設定 → 未実装事項参照）。

---

## 6. 既知の制約・注意点
- メール送信はローカル不可（本番のみ）。動作確認は本番デプロイ後に行う。
- 新規宛先へのメールは受信側で迷惑メール判定されやすい（特にiCloud）。初回は迷惑メール確認を案内。
- 給与計算は「時給制アルバイト・源泉徴収のみ」を対象。社会保険・年末調整は対象外。
- 源泉徴収税額表は年度ごとに管理画面から取り込む必要あり（88,000円以上の該当者が出る場合）。
