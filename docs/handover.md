# 引き継ぎ書（次セッション向け）

最終更新: 2026-07-12

このドキュメントは、別セッション（別の開発者・AIエージェント）が本プロジェクトを
継続開発するための引き継ぎ資料です。あわせて `docs/design.md`（設計書）と
`docs/development-plan.md`（当初計画）を参照してください。

---

## 1. これは何か

大波（oominami）向けの、アルバイト「従業員」の勤怠申告 → 給与計算 → 明細配信 →
税理士資料作成までを行う給与管理システム。**すでに本番稼働しており、実データでの
テスト評価フェーズ**に入っている。

- 本番URL: https://oominami-payroll.shinsekai.workers.dev
- リポジトリ: `richardx007/oominami-payroll`
- オーナー: richard.nishikawa@gmail.com（最初の管理者アカウント）

---

## 2. 現在の状態（2026-07-11 時点）

### 実装済み・本番稼働中
- ✅ 認証（初回登録=メールのみ→マジックリンク→パスワード設定、ログイン、ロール別リダイレクト）
- ✅ 従業員管理（登録・氏名/メール編集・時給変更・税区分変更・退職・招待メール・**完全削除（2段階警告）**、区分別No自動採番）
- ✅ 勤務表入力（スマホ向けカレンダーUI。当日背景/祝日赤字/交通費内訳/PC・iPad 2カラム）
- ✅ 入力状況ダッシュボード（管理者。年月大表示・状態バッジ）
- ✅ 給与計算エンジン + Vitest テスト18件
- ✅ 締め処理（プレビュー・締め・締め解除・支払済み。状態表示はダッシュボードと統一）
- ✅ 給与明細閲覧（従業員）・メール配信
- ✅ 連絡・催促・一斉報知（全員/個別、メール併送）
- ✅ 税理士向け支給一覧（画面印刷/PDF・CSVダウンロード・**CSV添付の自動メール送信**＋申し送り追記）
- ✅ 管理画面レイアウト（md以上=左サイドバー/スマホ=上部ナビ、ネイビー、ロゴ表示、ver.表示）
- ✅ ダッシュボードの勤務カレンダー（日別勤務者数ドット→日クリックで勤務者一覧）
- ✅ 勤務時間画面（従業員別の月次勤務明細・交通手段/区間表示）
- ✅ 従業員のパスワード再設定（管理者発行・token_hash方式）
- ✅ お知らせ未読の赤ドット（従業員ナビ）
- ✅ 源泉徴収税額表のCSV取込
- ✅ メール設定の画面管理化（会社名・送信元・税理士氏名・税理士アドレス）
- ✅ Supabase 認証メールのカスタムSMTP化（自社Gmail送信、無料でテンプレ編集可）
- ✅ Cloudflare 自動デプロイ（main push）

### 動作確認済み（実機）
初回登録 → ログイン → 従業員登録 → 招待メール送信 → 従業員の初回登録 →
勤務表画面表示、まで確認済み。認証メールの日本語送信元も確認済み。

### 未確認・これからテストする領域
- 勤務表の複数日入力 → ダッシュボード反映
- 締め処理 → 明細生成 → 従業員の明細閲覧 → メール配信
- 税理士資料のPDF出力・CSVダウンロード・mailtoメール作成（実機でmailto起動を確認）
- 88,000円以上の従業員での源泉税額表を使った計算
- 新・初回登録フロー（メールのみ→マジックリンク→パスワード設定）の実機通し

### 最近の主な変更（やや過去のセッション）
- UI用語を「雇用者/バイト」→「従業員」に統一（DBカラム名は `employee_*` のまま）
- 配色メリハリ・フォント拡大（globals.css の html font-size:17px）
- 初回登録をマジックリンク方式に変更（/register はメールのみ、/set-password 追加）
- 交通費に 手段/駅1/駅2/往復 を追加（work_entries にカラム追加、駅名はdatalist履歴）
- カレンダー: 当日背景・祝日赤字・デフォルト10:00-18:00・金額10円刻み・2カラム
- 下部ナビを単色フラットSVGアイコンに

### 直近セッションで実施した変更
- **従業員管理**: 氏名・メール編集を追加（メール変更で `auth_user_id` を null 化＝「未登録」に戻し再招待が必要）。
  区分（管理者M/従業員E）を選んで**従業員No自動採番**（`nextEmployeeNo`）。管理者は時給等の入力不要。
  編集UIを吹き出しパネル化し、更新成功で自動的に閉じる。
- **状態表示の統一**: `src/lib/period-status.ts` を新設し、ダッシュボード（`admin/page.tsx`）と
  締め処理（`admin/close/ui.tsx`）で同一表示（緑=受付中 / オレンジ=締め済み / グレー=支払済み）。
- **管理レイアウト**: md以上=左サイドバー、スマホ=上部ヘッダー（`admin/nav.tsx` + `admin/layout.tsx`）。
  メニュー文字拡大。ロゴ（`public/logo.svg`）表示、メニューバーをネイビー `#152449` に統一。
- **遷移体感の改善**: `admin/loading.tsx`・`(employee)/loading.tsx`（スピナー）追加、
  リンクに `touch-manipulation`＋押下フィードバック（iPadの連打対策）。
- **連絡バグ修正**: 全員宛て＋種別「連絡」でも送信できるようバリデーション修正。併送失敗理由を画面表示。
- **メール堅牢化**: `sendMail` を最大2回リトライ、`smtp.ts` の応答読み取りに15秒タイムアウト。
- **登録エラー日本語化**: `register/page.tsx` の `friendlyOtpError()` で英語エラーを日本語に。
- **税理士資料**: SMTP直接送信→**mailto方式**（`buildTaxReportMail`）＋**CSVダウンロード**（`buildTaxReportCsv`）。
  mailtoは添付不可のためCSVは手動添付。`tax_reports` テーブルへの書き込みは廃止（将来用に残置）。
- **スキル**: `.claude/skills/pwa-auto-update/` を追加。当初 Vite 前提だったものを **Next.js(App Router)版に組み替え**。

### 本セッションで実施した変更（PWA自動更新）
- **PWA自動更新を実装**（要件: ロゴ1タップ更新 / 更新バナー）。当初 `@serwist/next` で導入したが、
  **Cloudflare Workers + opennext で全メニュー遷移が「This page couldn't load」になる本番障害**が発生。
  原因は2つ: ①`@serwist/next` の `defaultCache` がページ遷移/RSC を横取り、②SW 生成のため
  `next build --webpack` に切り替えたこと。**両要因を排除した最小構成で再導入**した。
  - `scripts/generate-sw.mjs` がビルド時に `public/sw.js` を生成（`SW_VERSION`=git SHA を刻印）。
    この SW は **`fetch` を持たない**＝リクエスト非介入で遷移を壊さない。
  - `src/app/pwa/ReloadPrompt.tsx`（素の `navigator.serviceWorker`・約1分ポーリング）で更新バナー。
  - `src/app/pwa/reloadApp.ts` + `admin/nav.tsx` の `LogoButton` でロゴ1タップ更新。
  - `src/app/manifest.ts` 復活・`viewport-fit=cover`。middleware で `/sw.js`・`/manifest.webmanifest` を除外。
  - ビルドは **`next build`（Turbopack）を維持**（webpack 切替は廃止）。Serwist 依存は削除。
  - 実ブラウザ(Chromium)で登録・遷移・更新検知バナー・更新適用を検証（エラー0）。詳細は設計書
    「5. デプロイ / 運用 > PWA / 自動更新」の教訓ボックス参照。
  - 障害収束時に一時的に配った**キルスイッチ SW**（自己 unregister＋全キャッシュ削除）は、現在は
    生成される最小 SW に置き換わっている（最小 SW も activate で旧キャッシュを掃除する）。

### 本セッションで実施した変更（2026-07-11・UI刷新／税理士自動送信／パスワード再設定）
- **ダッシュボード刷新**: `admin/DashboardCalendar.tsx` を新設。給与期間カレンダーで日ごとに勤務者数の
  ドット、日クリックでその日の勤務者一覧（氏名/開始〜終了/勤務時間/交通費）を右に表示。従来の人別一覧は下に残置。
- **勤務時間画面を新設**: `admin/hours/{page,ui}.tsx`。年月＜＞ナビ、左=当月勤務した従業員、選択で右に
  月次明細（曜日・開始〜終了・交通手段/区間1/往復⇔片道→/区間2・交通費）。合計は太字。
  `lib/period.ts` に `WEEKDAYS`/`weekdayOf()`/`formatRoute()` を追加。
- **メニュー順変更**: 締め処理と従業員を入れ替え、勤務時間を追加。
- **税理士資料を自動送信に戻した**: mailto → **CSV添付の自動SMTP送信**。送信時ダイアログで補足/申し送りを
  入力し本文末尾へ追記。本文から勤務データ表を削除。宛名を「税理士氏名+様」に。設定に `tax_accountant_name`
  を追加。ボタン名「税理士へメール送信」。CSVダウンロードは維持。（`admin/report/{actions,ui}.tsx`）
- **連絡のCC**: 個別連絡は管理者にCC、一斉報知は管理者にも配信。`smtp.ts`/`email.ts` に `cc` を追加、
  `getAdminEmails()`/`getTaxName()` を追加。
- **お知らせ未読バッジ**: `(employee)/layout.tsx` が最新お知らせ時刻を渡し、`nav.tsx` が localStorage
  `notices_seen_at` と比較して赤ドット表示。開くと既読化。React19 の set-state-in-effect 規約回避のため
  `useSyncExternalStore` を使用。
- **設定2カラム化**: 会社名+送信元、税理士氏名+税理士アドレスをそれぞれ1行に（`admin/settings`）。
- **PWAアイコン修正**: iOS/macOS はホーム/Dockに SVG 不可 → PNG を用意（`scripts/generate-icons.mjs`、
  `icon-192/512.png`・`apple-icon.png`、`manifest.ts` を PNG 参照に）。更新バナー未表示（iOS standalone で
  `controller` が null）を `reg.waiting/active` + `visibilitychange` で修正。
- **iPad レイアウト修正**: サイドバー `h-screen`→`h-dvh` + overflow + safe-area でログアウトのはみ出し解消。
- **従業員入力UI改善**: ＜＞大型化、入力欄白背景、交通費クリア×を右上に拡大、フォント拡大（高齢者配慮）、
  合計行に「合計」表示、iOS の time 入力の重なりを**縦積み**で解消。ロゴSVG/PNG差し替え。
- **交通費の全入力/全空欄バリデーション**: 手段/区間1/区間2/往復・片道/金額をセット必須（サーバ側 refine、
  金額0は空扱い）。
- **締め明細メール**: 送信元アドレス（0円明細）を宛先から除外（`admin/close/actions.ts`）。
- **パスワード再設定機能を追加 → token_hash 方式に修正**: 管理者が「登録済み・在籍中」の従業員に再設定
  メールを送る（`resetEmployeePassword`）。当初 PKCE（`?code=`）で実装したが、**管理者サーバー発行では
  `code_verifier` が従業員側に無く必ず失敗**（ログイン画面に戻る不具合）。`/auth/callback` を
  **`token_hash`+`verifyOtp`** 対応に変更し解決。**Supabase の「Reset password」テンプレートを
  `{{ .TokenHash }}` を使うリンクに変更する運用対応が必須**（実施済み）。
- **バージョン表示**: `next.config.ts` がビルド時刻（JST `yyyy-mm-dd hh:MM`）を `NEXT_PUBLIC_BUILD_TIME`
  として埋め込み、管理サイドバー最下部に `ver.…` を表示。
- **スキル追加/更新**: `.claude/skills/supabase-invite-auth/`（招待登録＋パスワード再設定の認証パターンを
  文書化・実コード同梱）を新設。`.claude/skills/pwa-auto-update/` に「Visible version stamp」を追記
  （`next.config` スニペット同梱）。両スキルは zip でも配布可能。

### 本セッションで実施した変更（2026-07-12・認証堅牢化／各種UI／従業員削除）
- **ログイン画面に「パスワードを忘れたら」を追加**: 本人が再設定メールを申請（`login/actions.ts`
  `requestPasswordReset`）。空欄時は送信せず入力を促し、実際の送信失敗（レート超過等）は画面表示。
  説明文を廃してバージョン表示（`ver.…`）に変更。
- **🔑 PKCE 問題を implicit フローで根本解決（最重要）**: パスワード再設定・**初回登録の両方**で、
  メールを別端末で開くと `token=pkce_...` の verifier が無く `/login` に戻る不具合が発生していた。
  対策として **メール発行のサーバー処理を `flowType:'implicit'` のクライアントで実行**するよう変更
  （`src/lib/supabase/server.ts` に `createClient({ flowType })` を追加）。対象:
  `requestPasswordReset`（ログイン自己申請）/ `resetEmployeePassword`（管理者発行）/
  **`sendRegisterLink`（新設。`/register` をクライアント signInWithOtp → サーバーアクションへ移行）**。
  implicit だと `pkce_` の付かない端末非依存の `token_hash` が発行され `verifyOtp` が単独で通る。
  - **⚠️ Supabase ダッシュボードのテンプレ変更が2つ必須**（コードだけでは直らない）:
    「**Magic Link**」→ `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=magiclink&setup=1`、
    「**Reset password**」→ 同 `type=recovery`。既定の `{{ .ConfirmationURL }}` に戻すと再発。
  - メール未着の切り分け: まず認証メールの**送信レート制限**（テスト連投で数十分届かない）を疑う。
    `auth.users.recovery_sent_at` 等や Supabase auth ログで送信有無を確認できる。
- **従業員の完全削除機能を追加**: 従業員編集パネルにゴミ箱アイコンの「削除」。**2段階警告**
  （1回目「元に戻せません」→ 押下で勤務実績件数を確認 → あれば2回目「勤務実績も全て削除されます（N件）」
  →「全て削除」）。DB は SECURITY DEFINER 関数 `delete_employee(uuid)`（notifications を先に削除 →
  employees 削除で work_entries/payslips/wage_rates/tax_settings は CASCADE）と
  `count_employee_work_entries(uuid)` を新設。件数は RLS 下の head/count が 0 を返す事象があったため
  RPC 化した。認証アカウントは残る（サービスロール鍵不要方針）。
- **各種 UI 調整**:
  - 従業員ナビ刷新: メニュータイトル「勤務管理」、給与明細アイコンを￥、お知らせ→「管理」＋人型アイコン。
    「管理」画面の左上に `ver.`、ヘッダのログアウトを「管理」画面内へ移動。
  - 管理メニュー: 税理士資料を締め処理の直後へ。「勤務時間」→「**勤務実績**」に改称。
  - 「前月／次月」ボタンを濃色（`bg-gray-100`＋太字）に。締め処理の操作ボタンをプレビュー見出し行へ統合し
    「状態:」枠を廃止。税理士資料は前月/翌月をタイトル右、操作3ボタンを右寄せ・色統一、注釈を濃く。
  - 従業員「+従業員を追加」を一覧見出し行の右端へ統合（「新規登録」枠を廃止）。
  - **勤務表の時刻入力を再び1行3カラムに**（以前は iOS 対策で縦積みにしていた）。iOS の time が広がって
    重なる問題は `grid grid-cols-3 gap-3` + セル `min-w-0` + 専用クラス（`text-sm`・`px-1.5`・中央寄せ・
    `box-border`）で解消（`timesheet/ui.tsx` の `timeInputClass`）。
  - 勤務実績の左従業員一覧: 「日数」表示を削除し幅を縮小（`minmax(5.5rem,9rem)`）、右表を拡大。
- **招待日の記録**: `employees.invited_at`（timestamptz）を追加。`inviteEmployee` が送信成功時に更新。
  一覧で未登録者に「招待日 M/D」を表示、ボタンは初回「招待」/2回目以降「再招待」（`employees/ui.tsx`）。
- **源泉徴収税額表を国税庁公開様式に拡張**: `withholding_tax_table` に `tax_kou_4..7` を追加し甲欄0〜7人を保持。
  設定画面の貼付形式を「以上,未満,甲0〜甲7,乙」に変更（乙欄のみ3列も可）。取り込み済みデータを年選択つき
  の表で表示（`settings/{page,ui,actions}.tsx`）。給与計算は甲欄を `Math.min(dependents,7)` で参照
  （`payroll.ts`/`payroll-data.ts`）。**国税庁からの自動取得は非対応**（PDF/Excelのみ公開で機械可読源が無く、
  当環境から nta.go.jp はネットワーク遮断）。年1回の貼付運用。
- **税理士資料に状態バッジ**: 「給与支給一覧表 yyyy年mm月分」の右隣に期間ステータスバッジ
  （`period-status.ts` 共用。締め済み/支払済み等）を挿入（`admin/report/page.tsx`）。
- **税額表に国税庁リンク＋コピペ手順**: 設定画面の税額表セクションに、国税庁「源泉徴収税額表」
  ダウンロードページ（タックスアンサー No.2502）への外部リンクと、DL→Excelで開く→対象列をコピー→
  貼付、の番号付き手順・注意書きを追加（`settings/ui.tsx`）。
- **パスワード再設定で同一パスワードを許容**: 過去パスワードとの一致チェックは不要方針。
  `/set-password` で Supabase(GoTrue) の `same_password` エラー（英語メッセージ含む）を成功扱いにして
  そのまま `/` へ遷移（`set-password/page.tsx`）。8文字以上・確認一致の検証は維持。
- **スキル更新**: `.claude/skills/supabase-invite-auth/` を「PKCE `pkce_` トークンは送信端末でしか
  検証できない → メール送信は implicit クライアントで」の知見で更新。

### iPhone 対応のレスポンシブ刷新（ブランチ `claude/responsive-mobile-layout`・未マージ）
管理者もスマホ利用するため、UIを大幅刷新。**main には未反映（ブランチのみ push）** なので、
レビュー後に PR/マージ→自動デプロイの判断が必要。主な変更:
- **ナビ（`admin/nav.tsx`・`admin/layout.tsx`）**: スマホは従業員と同じ**下部タブナビ**化。アイコン+短い
  キャプションに変更（ホーム=家 / 勤務表=カレンダー / 給与明細=¥ / 従業員=人が重なる / 設定=歯車）。
  「連絡」はメニュー非表示（画面は `/admin/notices` で存置）、「税理士資料」はメニュー・画面とも廃止。
- **ホーム（旧ダッシュボード `admin/page.tsx`）**: タイトル・期間表示を廃止、前後月は ＜ 年月 ＞ に。
  下部の人別一覧表を廃止（締めと重複）。カレンダー右の一覧は iPhone ではカレンダー下に表示。
- **勤務表（新設 `admin/timesheet/{page,actions}.ts`）**: 旧「勤務実績(`admin/hours`)」を廃止し、従業員用
  `TimesheetCalendar` を**共用**。右上の従業員セレクトで対象切替（`?e=`）、管理者は任意従業員の勤務記録を
  CRUD（RLS `work_entries_admin`(ALL/is_admin) で締め済みでも編集可・`closed=false`固定）。
  共用のため入力スキーマを `(employee)/timesheet/schema.ts` に分離（"use server" は関数しか export 不可）。
  ヘッダは ＜ 年月 ＞ + 従業員フィールドを1行に。登録/更新ボタンは日付見出しの右上に短縮配置。
- **締め処理に税理士資料を統合（`admin/close/{page,ui}.tsx`）**: 操作ボタンをヘッダへ移動。締め済み以降は
  税理士へメール送信(アイコン+「税理士へ」)/印刷PDF(プリンタ)/CSV(下矢印) を表示（`admin/report/ui.tsx`を
  流用・アイコン化）。`admin/report/page.tsx` は削除（actions/ui は close から利用するため残置）。
  表は No 省略・氏名1行・日数/時間は単位なし数字(時間は H:MM)で改行させない。
- **従業員一覧（`admin/employees/ui.tsx`）**: iPhone考慮で「氏名/招待状態/状態」の3列に集約。行タップで
  吹き出し詳細(レスポンシブ)を開き、詳細トップに パスワード再設定 / 招待・再招待。招待状態=未招待→招待済→登録済。
- **年月スタイル統一**: ホーム/給与明細の年月を勤務表に合わせ `text-xl` extrabold・青、＜＞は `text-2xl` グレー。
- **深夜勤務(翌日跨ぎ)対応**: 退勤が出勤以前(例 18:00→2:00)なら翌日とみなす。`lib/period.ts` の `workMinutes`
  が end≤start のとき24時間加算、`(employee)/timesheet/schema.ts` の検証も翌日跨ぎを許容(実働>0を確認)。
  勤務表入力欄に注記追加・テスト追加。**DB は `work_entries` の `end_time > start_time` CHECK制約
  (`work_entries_check`)を撤去**(これが無いと「保存に失敗しました」になる)。
- **勤務表の従業員フィールド**: ヘッダ右の従業員セレクト/氏名を `flex-1` で残り幅いっぱいに(PC で名前が切れる問題を解消)。

> ⚠️ 過去セッションは開発ブランチ `claude/payroll-system-plan-8wvobq` に直接 push して main へマージ運用してきた。
> 本レスポンシブ刷新は別ブランチ `claude/responsive-mobile-layout` に切って作業中で **main 未反映**。
> push 前は必ず `git fetch origin main` で差分確認のこと。

---

## 3. 開発ワークフロー（重要）

### ブランチ運用
- **main が本番**（Cloudflare が main を自動デプロイ）。
- 作業は開発ブランチ `claude/payroll-system-plan-8wvobq` で行い、
  ビルド確認後に main へマージ→push、という運用をしてきた。
- **注意**: オーナーが GitHub 上で直接 `wrangler.jsonc` を編集することがある。
  push 前に必ず `git fetch origin main` して差分を取り込むこと。

### ローカル作業の基本
```bash
npm install
npm run build      # Next.js ビルド（型チェック含む）
npm test           # Vitest（給与計算ロジック）
```
- **メール送信はローカルでは動かない**（cloudflare:sockets は本番Workersのみ）。
  メール周りの検証は本番デプロイ後に実機で行う。
- Workers 用ビルドの確認は `npx opennextjs-cloudflare build`。

### DBマイグレーション
- Supabase MCP の `apply_migration` で適用してきた（project_id: `zvrwkmriosaldjqpxdwi`）。
- スキーマ変更後は `get_advisors`（security）で RLS 警告を確認する。
- SECURITY DEFINER 関数は匿名実行を revoke する運用（`email_registered` のみ anon 許可）。

---

## 4. 環境・シークレットの在り処（超重要）

| 設定 | 場所 | 変更方法 |
|------|------|---------|
| 送信元Gmail / 税理士アドレス / 会社名 | DB `app_settings` | **管理画面「設定」→ メール設定** |
| GMAIL_APP_PASSWORD | Cloudflare **Secret** | ダッシュボードで Secret 登録（Plaintextにしない） |
| SUPABASE 公開URL/キー | `wrangler.jsonc` vars + `.env` | コード |

### 過去にハマった点（再発注意）
1. **Plaintext 変数はビルドで消える**: Cloudflare ダッシュボードで Plaintext として
   追加した変数は `wrangler deploy` のたびに消える。秘密情報は必ず **Secret**、
   非秘密の設定は **DB(app_settings)** か **wrangler.jsonc** に置く。
2. **NEXT_PUBLIC_* はビルド時埋め込み**: `.env`（コミット済み、公開値のみ）に
   ないとクライアントから Supabase に接続できず、登録画面が「送信中」で止まる。
3. **メール未着**: 送信成功でも iCloud 等で迷惑メール判定される。`Message-ID`
   ヘッダーは実装済み。運用では「初回は迷惑メール確認」を案内する。
4. **Cloudflare の「Retry build」を過去バージョンで実行しない**: Plaintext 変数が
   消える。設定変更後の反映は最新 main の再デプロイで行う。
5. **git proxy が一時的に 403 を返すことがある**: このセッション中に何度か発生。
   数十秒〜で自然回復する。回復しない場合は GitHub MCP の `create_or_update_file` で
   個別ファイルを push する回避策あり（ただしこれも同時に 403 になることがある）。
6. **一括 sed 置換の二重変換に注意**: 「雇用者」「バイト」→「従業員」を sed で置換した際、
   「バイトの雇用者」→「従業員の従業員」、「アルバイト」→「アル従業員」の崩れが発生した。
   置換後は `grep -rn '従業員の従業員\|アル従業員'` 等で確認すること。
7. **オーナーが GitHub 上で wrangler.jsonc / コードを直接編集する**ことがある。
   作業前に必ず `git fetch origin main` で最新を取り込む。

---

## 5. コード上の要点（変更時に見るべき場所）

- 給与計算を変えるとき: `src/lib/payroll.ts`（純粋関数）+ `payroll.test.ts` を必ず更新。
  DB集計は `src/lib/payroll-data.ts`。
- 給与期間（26日〜25日）の定義: `src/lib/period.ts`。締め日・支払日ルール・`todayJST()` はここ。
- メール本文・送信: `src/lib/email.ts`（設定取得・本文生成・添付・リトライ）、`src/lib/smtp.ts`（SMTP・multipart・タイムアウト）。
- 交通費の内訳・カレンダー表示: `src/app/(employee)/timesheet/ui.tsx`。祝日は `src/lib/holidays.ts`。
- 初回登録フロー: `/register`（メールのみ・OTP送信・`friendlyOtpError`）→ `/auth/callback`（setup=1判定）→ `/set-password`。
  `/set-password`（`src/app/set-password/page.tsx`）は `updateUser` で設定。**過去パスワードとの一致チェックは不要**方針のため、
  GoTrue の `same_password` エラーは成功扱いにして `/` へ進める（同一パスワードで再設定可）。
- 税額表の取込・国税庁リンク: `src/app/admin/settings/{page,ui,actions.ts}`（`importTaxTable`）。甲欄0〜7人＋乙欄を保持。
  取込済みデータは年選択の表で表示。国税庁DLページ（No.2502）への外部リンク＋コピペ手順を UI に併記。
- **パスワード再設定（管理者発行）**: `src/app/admin/employees/actions.ts` の `resetEmployeePassword`、
  検証は `src/app/auth/callback/route.ts`（`token_hash`+`verifyOtp`）。**Supabase「Reset password」テンプレート依存**。
  認証パターンの解説はスキル `.claude/skills/supabase-invite-auth/`。
- RLS/権限: DBの関数 `is_admin()` 等（Supabase側）。画面ガードは `src/lib/auth.ts`。
- 従業員の登録/編集・No自動採番: `src/app/admin/employees/{actions,ui}.tsx`（`addEmployee`/`nextEmployeeNo`/`updateEmployeeProfile`/`resetEmployeePassword`）。
- ダッシュボードのカレンダー: `src/app/admin/DashboardCalendar.tsx`。集計は `admin/page.tsx`。
- 勤務表(管理者): `src/app/admin/timesheet/{page,actions}.ts`。UIは従業員用 `src/app/(employee)/timesheet/ui.tsx`
  の `TimesheetCalendar` を共用（`save`/`del`/`basePath`/`employees` などを props で受ける）。入力スキーマは
  `(employee)/timesheet/schema.ts`。※旧「勤務実績 `admin/hours`」は廃止済み。
- 期間ステータス表示: `src/lib/period-status.ts`（ホーム・締め処理・税理士資料で共用。配色を変えるならここ1か所）。
- 管理ナビ/ロゴ/配色/バージョン表示: `src/app/admin/nav.tsx`（`AdminSidebarNav`/`AdminBottomNav`・アイコン）・
  `src/app/admin/layout.tsx`。`ver.` は `NEXT_PUBLIC_BUILD_TIME`（`next.config.ts` で生成）。ロゴ実体は `public/logo.svg`。
- 税理士資料の自動送信/CSV: `src/app/admin/report/{actions,ui}.tsx`（`sendTaxReport`/`buildTaxReportCsv`。
  page は廃止し、締め処理画面 `admin/close` から ui のアイコンボタンを利用）。
- 連絡のCC・管理者宛先: `src/app/admin/notices/actions.ts`・`src/lib/email.ts`（`getAdminEmails`）。
- お知らせ未読バッジ: `src/app/(employee)/{layout,nav}.tsx`（localStorage `notices_seen_at` + `useSyncExternalStore`）。
- PWAアイコン生成: `scripts/generate-icons.mjs`（手動実行。sharp で PNG 生成。ビルドには含めない）。
- **認証メールの発行（超重要）**: 初回登録は `src/app/register/actions.ts` の `sendRegisterLink`、
  再設定は `admin/employees/actions.ts` の `resetEmployeePassword`・`login/actions.ts` の
  `requestPasswordReset`。**いずれも `createClient({ flowType: 'implicit' })` で送る**こと
  （PKCE だと別端末で開いたリンクが失敗する）。Supabase の Magic Link / Reset password テンプレートは
  `{{ .TokenHash }}` リンク必須。認証パターンはスキル `.claude/skills/supabase-invite-auth/`。
- 従業員の完全削除: `admin/employees/actions.ts`（`deleteEmployee`/`countEmployeeWorkEntries`）＋
  DB 関数 `delete_employee`/`count_employee_work_entries`。UIの2段階警告は `admin/employees/ui.tsx`。
- 勤務表の時刻入力（1行3カラム・iOS重なり対策）: `(employee)/timesheet/ui.tsx` の `timeInputClass`。
- 用語: UIは「従業員」で統一。**DBのカラム名は `employee_*` のまま**（変更していない）。

---

## 6. 未実装・改善候補（バックログ）

優先度は状況により再判断すること。

- [ ] **Supabase 休止対策**: 無料プロジェクトは長期未アクセスで一時停止。
      Cloudflare Cron Trigger で定期 ping する仕組みが未実装（当初計画にはあった）。
- [ ] **E2Eテスト**: 締め〜配信の一連フローの自動テストは未整備。
- [x] **税理士へメール自動送信**: 実装済み（CSV自動添付・申し送り追記・宛名「氏名+様」）。
      なお添付は **CSV**。PDF での自動添付が必要なら別途サーバー側PDF生成（@react-pdf等）が要る（下記参照）。
- [x] **PWA自動更新**: 実装済み（fetch非介入の最小SW + 更新バナー + ロゴ1タップ更新 + ver.表示）。
      ⚠️ Cloudflareでは `@serwist/next` の `defaultCache`／webpackビルド切替は使わないこと（本番障害の原因）。
      iOS用 PNG アイコン（192/512・apple-touch-icon）整備済み。
      残・任意課題: オフラインキャッシュが必要になった場合の設計（現状は更新通知のみでキャッシュしない）。
- [ ] **Supabase メールテンプレ依存の注意**: パスワード再設定は「Reset password」テンプレートが
      `{{ .TokenHash }}` リンクであることに依存。テンプレを初期化/変更すると再設定が壊れる（design.md 参照）。
- [ ] 給与明細のPDF体裁（現状はブラウザ印刷。専用レイアウトが必要なら @react-pdf 等）。
- [ ] 会社名・住所などを給与明細/税理士資料の帳票ヘッダーに反映（company_name は
      メール差出人名のみ利用中）。締め処理/税理士画面には交通費内訳（手段/区間）は未表示。
- [ ] Supabase 認証メール本文の日本語化（カスタムSMTP設定済みでテンプレ編集可能。
      件名/本文の日本語化は運用側の手作業。テンプレ推敲を手伝える）。
- [ ] 88,000円以上の源泉税額表データの投入（該当者が出たら管理画面から取り込む）。

---

## 7. すぐ使えるコマンド集

```bash
# 依存インストール & ビルド & テスト
npm install && npm run build && npm test

# 開発ブランチで作業 → main へ反映
git fetch origin main
git checkout claude/payroll-system-plan-8wvobq
# （編集）
npm run build && npm test
git add -A && git commit -m "..."
git push
git checkout main && git merge claude/payroll-system-plan-8wvobq && git push origin main
git checkout claude/payroll-system-plan-8wvobq
```

- Supabase 操作は MCP ツール（project_id: `zvrwkmriosaldjqpxdwi`）。
- GitHub 操作は GitHub MCP ツール（`richardx007/oominami-payroll`）。
- この環境からは Cloudflare API へ直接接続不可（デプロイは main push による自動ビルド）。
