# 引き継ぎ書（次セッション向け）

最終更新: 2026-07-19

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
- **勤務表の勤務一覧/合計/カレンダー**: 未選択時にカレンダー下(スマホ)/右(PC)へ勤務一覧表(日・曜・出勤・退勤・
  勤務(h:mm右寄せ)・交通費／日と曜は祝日/日=赤・土=青)を表示。日タップで入力枠、合計カードのタップで一覧へ切替。
  新規(未入力)日は最後に表示/入力した内容を既定値に流用(WorkList行や既存日を開くと更新、保存時も保持)。
  合計は枠内「計/日数/時間(h:mm)/交通費」を iPhone 1行表示(「勤務一覧を表示」は sm 以上のみ)。カレンダーは
  濃いアウトライン(border-2)＋曜日行に塗り。共有 UI は `(employee)/timesheet/ui.tsx`(WorkList/hhmm 追加)。
- **ホーム 勤務者一覧**: 日タップ時、氏名｜出勤〜退勤(h:mm)・交通費 を1行・列そろえ・出勤時刻順で表示
  (交通費見出しは廃止)。カレンダーも濃いアウトライン＋曜日行塗り(`admin/DashboardCalendar.tsx`)。
- **給与明細 合計表示**: 見出し下に 総支給/源泉所得税/差引支給 を1項目1行・濃い黒字・金額右寄せ(`admin/close/page.tsx`)。
- **税額表 先頭行除外＋非課税判定**: 取込時に「(最小額)円未満→0」の変則行(未満空で以上に最小額)を除外
  (`settings/actions.ts`)。表の最小「以上」未満は `computeIncomeTax` が非課税(0円)判定(`lib/payroll.ts`＋テスト)。
- **QR打刻(実装済み・運用テスト中)**: 職場に出勤/退勤QR(`/clock?type=in|out`)を掲示→カメラで読取→確認画面OKで
  サーバー時刻(JST)を `work_entries` に打刻。出勤=当日2回目以降エラー、退勤=直近の未退勤(当日以前)→無ければ当日
  レコードに上書き(**未来日の別レコードを拾わない**)。休憩は総6h以上で60分自動。時刻の丸め(`clock_round_min`)は
  出勤=切上/退勤=切捨、確認画面に「HH:MM 出勤/退勤 とみなします。」表示。退勤ブランク許容のため
  `work_entries.end_time` を NULL 化し、勤務表/カレンダー/一覧/ダッシュボードで退勤未入力を黄色警告、締めは
  `computePayslip` が「退勤未入力の日があります」で従業員を列挙して止める。位置は設定の基準座標(地図ピン留め・
  Leaflet+OSM)＋半径で判定、`clock_out_of_range`=warn/reject。`clock_events` に監査記録、操作ログに「打刻」。
  - ⚠️ **落とし穴**: `app_settings` は管理者のみ SELECT 可。打刻は従業員セッションなので直接読むと**空になり丸め・
    位置設定が無効化**する。必ず **`get_clock_settings()`(SECURITY DEFINER)** 経由で読むこと(`/clock` の
    page/actions とも修正済み)。
  - 実装: `src/app/clock/{page,ui,actions}.ts(x)`、`admin/settings/clock.tsx`(地図/半径/圏外/丸め/QR生成印刷)、
    `admin/settings/actions.ts` の `updateClockSettings`、DB: `clock_events`・関数 `get_clock_settings`・
    `app_settings` の clock_* キー。依存追加: `leaflet` / `qrcode`。
- **締め処理「処理中...」固着の解消**: `admin/close/ui.tsx` の `run()` を `useTransition` の pending から
  明示的な busy 状態に変更し `finally` で必ず解除(router.refresh を挟むと pending が戻らない事象への対処)。
  `closePeriod` も想定外例外を ActionResult 化。※固着時もサーバー側の締めは成功していることがある点に注意。
- **給与明細メールに日別明細**: `buildPayslipMailText` に `dailyRows` を追加し ＜日別明細＞(日付・出勤〜退勤・
  休憩・勤務・交通費・昼食補助) を本文末尾へ。日付=MM/DD、時刻/休憩/勤務=HH:MM(2桁ゼロ埋め)で桁揃え。
  行生成は `emailPayslips`(当期 work_entries＋昼食補助日額)。勤務表の合計行右端は「一覧」を常時表示。
- **給与明細の印刷/PDF**: 横に切れる問題を `globals.css` の `@media print`＋`.print-report` で解消
  (html 11px/表9px・A4縦余白10mm・overflow可視化・桁の多い金額は折返し)。表コンテナに `print-report` 付与。
- **操作ログ機能**: `activity_logs` テーブル＋`log_activity(action,detail)`(SECURITY DEFINER・90日で自動削除・
  削除自体も記録)。記録: ログイン(login/page)、パスワード設定(set-password)、メール送信(`sendMail` 全経路＋
  Supabase認証メール=初回登録/再設定申請/管理者発行)、エラー(締め・税額表取込・メール送信失敗など)、
  従業員削除(deleteEmployee)。登録/編集/退職は記録しない。閲覧は `/admin/logs`(管理者・表形式・1行1ログ・
  列揃え・日替わり区切り線・最新300件)。記録ヘルパーは `src/lib/log.ts`(best-effort)。メニューは PC サイドバー
  に「ログ」追加、スマホは下部タブに収まらないため **設定・ログをハンバーガー(右下・最小幅カード)** に集約。
  ⚠️ ログ記録用に `log_activity` は anon にも実行付与している(ログイン/初回登録前でも呼ぶため)。
- **給与明細(締め処理)ヘッダ微調整**: タイトル削除、期間を「締め日：{終了日}、支払日 {支払日}」の1行に、
  締め済みボタンを2行構成(1行目=締め解除/支払済み、2行目=従業員へ/税理士へ/印刷/CSV)、所得税セルを nowrap。
  前月翌月を ＜ 年月 ＞ 化しホーム/給与明細の年月配色を勤務表に統一。
- **下部タブナビの配色**: 管理者・従業員ともヘッダと同じネイビー背景＋白アイコン/文字に。
- **明細メール配信ボタン**: アイコン＋「従業員へ」表記に(税理士へ と同じ書式)。
- **管理者Noを M000 に**: 旧 `0001` を `employees` で `M000` へ更新(本番DML)。以降の管理者採番は M001〜。
- **設定: ver.表示 / 税額表運用改善**: 設定トップ右上にバージョン表示。税額表リンクを
  「源泉徴収税額表(月額表)」Web検索に変更。Excelからのタブ区切り貼付に対応(桁区切りカンマ除去→タブをカンマ化、
  空行/数字なし行スキップ、各セルを数字のみ正規化=「円」等除去、未満空欄は上限なし)。取り込み日時
  (`withholding_tax_table.created_at`)を年度ごとに表示。取り込みは client/server とも例外安全化し
  「取り込み中」ハングを解消、Server Action の body 上限を 5mb に拡張(`next.config.ts`)。

### 本セッションで実施した変更（2026-07-16・レスポンシブ確定マージ／打刻km表示／設定QR位置PCレイアウト）
- **iPhoneレスポンシブ刷新をmainへ確定**: ブランチ `claude/responsive-mobile-layout` は実機検証済みのため
  main にマージ済み（`origin/main` と同一コミット。以降は main が本番反映元）。
- **打刻メッセージの距離をkm換算**: `src/app/clock/actions.ts` に `formatDistance()` を追加。**1000mを超える場合は
  km 表示**（小数点第2位以下四捨五入＝小数第1位まで、`約 #0.0 km` 形式）。1000m以下は従来どおり `約123m`。
  適用箇所は圏外拒否メッセージ・圏外警告メッセージ・操作ログ（拒否/圏外打刻）の計4か所。
- **設定「QR打刻の位置設定」のPCレイアウト改善**（`src/app/admin/settings/clock.tsx`）: PC（lg以上）で
  3カラムグリッド化し、**左2/3に地図（高さ `h-64`→`lg:h-96` で縦約1.5倍）、右1/3に 許容半径／圏外の扱い／
  時刻の丸め／保存ボタン**を縦並び配置。理由はスクロール時にカーソルが地図に重なると地図ズームが誤作動して
  スクロールしづらいため、地図に重なる面積を縮小した。スマホ/タブレット（lg未満）は従来の縦積みを維持。

### 本セッションで実施した変更（2026-07-16 その2・PWA更新バナー改善）
- **更新バナーが1デプロイで2〜3回出る問題を解消**（`src/app/pwa/ReloadPrompt.tsx`）。原因は、待機中の新SW
  （`reg.waiting`）は1つなのに、①登録時の `reg.waiting`、②`updatefound`、③約1分ごとのポーリング、
  ④タブ復帰の `visibilitychange` の**複数経路が同じSWに対して繰り返し `showBanner` を呼ぶ**こと。
  `notifiedRef`（通知済みSWインスタンスを記録）を追加し**同一バージョンは1回だけ通知**。✕で閉じた版も
  再ポップせず、本当に新しいデプロイ（別インスタンス）のときだけ再表示する。
- **更新ボタンにクリックフィードバックを追加**: 押下で `更新中...` に切替＋ボタン無効化（✕も一時非表示）。
  SKIP_WAITING送信後、`controllerchange` を優先しつつ発火しない環境向けに**0.8秒のフォールバックタイマー**で
  リロード（この遅延が「更新中...」を一瞬見せる役割も果たす）。iOS standalone 対策。
- **スキル `.claude/skills/pwa-auto-update/` を更新**: `assets/ReloadPrompt.tsx` を本番最新へ同期し、
  SKILL.md の gotchas に「per-SWでのバナー重複防止」「更新中の可視フィードバック」「controllerchange単独に
  依存しない（フォールバックタイマー）」を追記。

### 本セッションで実施した変更（2026-07-16 その3・「配信」メニュー復活）
- **管理ナビに「配信」を復活**（`src/app/admin/nav.tsx`）。従業員へメッセージ＋メールを送る `/admin/notices` を
  メニューから再表示。**PCサイドバーでは従業員の直後**に配置（`moreLinks` 先頭に追加）。iPhoneでは下部タブに
  収まらないため**ハンバーガー(その他)内**に表示。紙飛行機の `SendIcon` を追加。
- **ハンバーガーのキャプションを「メニュー」→「その他」に変更**。

### 本セッションで実施した変更（2026-07-16 その4・配信タイトル統一／QR専用印刷）
- **配信画面のタイトルを「連絡・催促」→「配信」に統一**（`admin/notices/page.tsx`）。メニュー名と一致。
- **設定「出勤・退勤QRコード」の印刷をQRのみに**（`admin/settings/clock.tsx` + `globals.css`）。従来は設定画面全体が
  印刷されていた。印刷ボタンで `document.body` に `qr-print-mode` クラスを付与 → `@media print` で
  **シート `.qr-print-sheet` 以外を `visibility:hidden`**、シートのみ表示 → `afterprint`（＋1秒フォールバック）で
  クラス解除。シートは画面では `display:none`、印刷時のみ表示。QR画像は data URL なので display:none でも即描画。
  - レイアウト: タイトル「{会社名}　出退勤登録用QRコード」＋出勤/退勤QRを大きく（70mm）横並び＋説明3項目
    （読み取り手順／{丸め単位}分単位で丸め〔0・1は「1」表示〕／この職場以外では記録不可）。
  - `ClockSettingsForm` に `companyName` prop を追加（page から `app_settings.company_name` を渡す）。丸め単位は
    フォームのライブ値 `round` を `QrCodes` に渡す（保存前の編集も印刷に反映）。
  - ⚠️ 税理士資料など他画面の印刷（`.print-report`）は `qr-print-mode` を付けないため影響なし。
  - **空白ページ／ヘッダ・フッタ対策（追修正）**: 当初 `visibility:hidden` で隠したが、隠した設定画面が高さを
    保持して**空白ページが2枚出た**。対策として印刷シートを **`createPortal` で `body` 直下**に出し、印刷時は
    `body.qr-print-mode > *:not(.qr-print-sheet){display:none}` で**高さごと除外**。ブラウザ既定の日付/URL/
    ページ番号ヘッダ・フッタは**名前付き `@page qrsheet { margin:0 }`**（シートに `page:qrsheet` を割当）で抑制し、
    シート側に `padding:14mm 12mm` を持たせて余白を確保。

### 本セッションで実施した変更（2026-07-18・セキュリティレビュー全項目対応／認証リンク不具合修正）
外部の視点でのセキュリティレビューを実施し、致命的1件・危険4件・勧告5件を洗い出して**全10項目を対応**した
（詳細な調査ログ・対応メモは `docs/security-review-2026-07-18.md` に記録。今後の追加レビューもこのファイルに
追記していく運用）。加えて、レビュー後にオーナーから実際に報告された認証リンクの不具合も原因調査の上で修正。
すべて `claude/payroll-system-plan-8wvobq` で作業し都度 `npm run build && npm test` で確認後、mainへマージ・
Cloudflare自動デプロイまで実施済み。

- **🔴 致命的: 認証メールのリンクがHostヘッダー依存だった**: 初回登録・パスワード再設定メールのリダイレクト先を
  `headers().get("x-forwarded-host")`等から組み立てていたのを、`NEXT_PUBLIC_SITE_URL`（固定値）ベースの
  `src/lib/site-url.ts`(`getSiteUrl()`)に統一。Hostヘッダー詐称による認証リンクの誘導・アカウント乗っ取り
  リスクを解消。`.env`/`.env.example`/`wrangler.jsonc`に`NEXT_PUBLIC_SITE_URL`を追加。
- **🟠 危険→対応済み**:
  - `next.config.ts`にセキュリティヘッダー追加（`X-Frame-Options`・`X-Content-Type-Options`・
    `Strict-Transport-Security`・`Referrer-Policy`・`Permissions-Policy`）。
  - DB: `delete_employee`・`count_employee_work_entries`・`get_clock_settings`のanon実行権限を剥奪し
    `authenticated`限定に（アプリコードは常に`requireAdmin()`/`requireEmployee()`後にしか呼ばないため
    機能影響なしを確認済み）。
  - DB: `log_activity`に簡易フラッド対策（未ログイン由来の呼び出しが1分20件超で記録スキップ）を追加。
  - Supabaseの「漏洩パスワード保護」はダッシュボードでONにしても**Proプラン以上限定**でエラーになり
    無料プランでは有効化不可と判明。オーナーの判断で代替策（`/set-password`に英字+数字混在必須化）を実装。
- **🟡 勧告→対応済み**:
  - `npm audit`のpostcss脆弱性（Next内部バンドル分）を`package.json`の`"overrides"`で解消、0件に。
  - 打刻（`clock/actions.ts`）の失敗時に生のDBエラー文を画面表示するのをやめ、汎用メッセージ+
    `logActivity`でのサーバー記録に変更。
  - 初回登録申請（`sendRegisterLink`）も未登録メールで成功と同じ応答を返すよう統一（アカウント列挙対策、
    `requestPasswordReset`と同じ設計）。
  - `.env.local`から未使用の`SUPABASE_SECRET_KEY`・`RESEND_API_KEY`を削除（gitignore対象のためリポジトリへの
    影響なし。過去に検討したResend経由送信の名残で、現在は自作SMTPのため未参照だった）。
- **🐛 レビュー後に発見・修正: 認証メールリンクがセキュリティスキャナーの自動プリフェッチでトークン消費される
  不具合**: オーナーより「パスワード再設定リンクを押すとログイン画面が表示される（以前にも発生）」と報告あり、
  Supabase監査ログ（`get_logs` service=auth）を確認したところ、同一トークンへの`POST /verify`が約2分20秒差で
  2回発生し、1回目成功・2回目`403 One-time token not found`だった。旧`/auth/callback`はGETを受けた瞬間に
  `verifyOtp`/`exchangeCodeForSession`（1回限りのトークンを消費する状態変更操作）を即実行していたため、
  メールのセキュリティスキャナー等の自動先読みでトークンが消費され、本人クリック時には無効になっていたと判明。
  対策として`/auth/callback`は検証を行わず`/auth/confirm`へパラメータ付きリダイレクトするだけにし、
  新設した`/auth/confirm`（クライアントコンポーネント）で**「続ける」ボタン押下時にのみ**検証を実行するよう
  変更。自動プリフェッチ（JS非実行）ではボタンを押せないため誤って消費されなくなる。初回登録・パスワード
  再設定（本人申請・管理者発行）すべてに共通の導線のためまとめて修正。オーナーが実機で「パスワード変更、
  管理者/従業員それぞれのログイン、打刻画面の表示」を確認し問題なしと確認済み。

### 本セッションで実施した変更（2026-07-18 その5・勤務表入力UIの改善）
オーナーからの修正依頼6件に対応（`src/app/(employee)/timesheet/{ui,schema}.tsx`・`actions.ts`・
`src/app/admin/timesheet/actions.ts`）:
- **削除ボタン押下時に確認ダイアログ**（`window.confirm`）を追加。誤操作での即削除を防止。
- **出勤/退勤の時刻入力に`step={900}`（15分刻み）を設定**。iOSのネイティブ時刻ダイヤルが15分単位のみ
  選べるようになる。⚠️「リセット」ボタンはiOS Safari自体のネイティブUIであり、アプリ側のコードから
  制御できないことをオーナーに説明済み（対応不可として合意済み）。
- **休憩(分)を0/15/.../120分の`<select>`に変更**（`breakMinuteOptions()`）。iOSでは`<select>`が自然に
  ホイールピッカーで表示される。既存データが15分刻みから外れる値でも選択肢から消えないよう動的に追加。
- **区間の見出しを「区間(駅1/駅2)」→「区間(From/To)」に変更**、プレースホルダーを「大波駅/新世界駅」
  →「梅田/動物園前」に変更。
- **勤務表画面（従業員・管理者共通）でも退勤時刻を未入力のまま保存できるように**。`schema.ts`の
  `end_time`を空文字許容にし、`actions.ts`側で空文字は`null`として保存。打刻機能の退勤未入力と同じ
  DB上の扱い（`end_time IS NULL`）になるため、締め処理の「退勤未入力の日があります」チェックも
  そのまま機能する。

### 本セッションで実施した変更（2026-07-19・実従業員登録後の再テストで判明した認証不具合3件）
オーナーが実際の従業員登録完了後、改めてテスト従業員で初回招待をテストしたところ3件報告があり、
すべて調査・修正した。**特に1件目は認証まわりで繰り返し起きている不具合の「真因」**だったため重点的に記載する。

- **🔑 根本原因が判明: Supabase「Confirm signup」テンプレートが未設定だった（★最重要・再発防止の要）**:
  Supabase監査ログ（`get_logs` service=auth）を時系列で確認したところ、
  `POST /otp`(`user_confirmation_requested`) → `GET /verify`(`user_signedup`、303、**Supabase自身の
  検証URLへの直接GET**) → 同一トークンへの2回目の`GET /verify`が`"One-time token not found"`で失敗、
  という並びを確認した。**そのメールアドレスへの初回招待**（＝`auth.users`にまだレコードが無い状態）の
  場合、`sendRegisterLink`が呼ぶ`signInWithOtp({shouldCreateUser:true})`はSupabase内部で
  「サインアップ」フローとして扱われ、**「Magic Link」ではなく「Confirm signup」という別のメール
  テンプレート**が使われる。これまで「Magic Link」「Reset password」の2つだけを`token_hash`方式に
  変更していたが、**「Confirm signup」は変更し忘れていた**ため既定の`{{ .ConfirmationURL }}`（Supabase
  自身の検証URLへの生リンク、一度きりのトークンをリンクを開いた瞬間に消費）のままになっており、
  7/18に対策したはずの「メールスキャナーの自動先読みでトークン消費→有効期限切れ」が**初回招待のみ**
  再発していた。**2回目以降の再招待では`auth.users`が残っているため症状が出ず**、原因特定を難しくしていた
  （従業員を一度削除して再登録した場合の再テストで「今度はエラーが出ない」のはこのため）。
  - **対応**: Supabaseダッシュボードで「Confirm signup」テンプレートも
    `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&setup=1` に変更する必要がある
    （**要オーナー作業・コードだけでは直らない**。詳細手順は design.md「4. 認証・ロール」参照）。
  - コード側は`src/app/admin/employees/actions.ts`の招待メール文中のパスワードルール表記を
    「8文字以上」→「8文字以上・英字と数字を両方含める」に修正（7/18のパスワードポリシー変更が
    案内文に反映されていなかった）。
- **`/auth/confirm`のタイトルが初回登録なのに「パスワード再設定」と表示される不具合を修正**:
  タイトル判定が`setup === "1"`を見ていたが、`setup=1`は初回登録・パスワード再設定の**両方**で
  常にtrueのため、初回登録(`type=magiclink`/`signup`)でも「パスワード再設定」と誤表示していた。
  `type === "recovery"`のみで判定するよう修正し、初回登録時は「初回登録」と表示するようにした
  （`src/app/auth/confirm/page.tsx`）。`/set-password`側は元々「パスワードの設定」という中立表現で
  両フロー共通のため変更不要だった。
- ⚠️ **今後の教訓**: 認証メールリンクの不具合は「Magic Link」「Reset password」の2テンプレートだけ
  直して満足しがちだが、**「Confirm signup」（初回サインアップ時）も必ず同時に確認する**こと。
  新しい認証関連の不具合報告があった場合は、まず Supabase 監査ログ（`get_logs` service=auth）で
  実際に踏んだテンプレート（`user_confirmation_requested` vs `user_recovery_requested` vs
  `login`のaction種別、`/verify`がGETかPOSTか）を確認してから対応すること。推測だけで直さない。

### 本セッションで実施した変更（2026-07-19 その2・supabase-invite-authスキル更新）
上記の認証不具合2件（Hostヘッダー依存・プリフェッチ消費・Confirm signupテンプレート見落とし）を、
他プロジェクトでも再発させないよう `.claude/skills/supabase-invite-auth/` に反映した。
- SKILL.mdに「3つの落とし穴」（PKCEデバイス不一致／3テンプレート中の見落とし／プリフェッチ消費）を
  整理し、それぞれ同じ症状（リンクがログイン画面に戻る・期限切れ表示）で現れることを明記。
- `/auth/callback`を検証なしのリダイレクトのみにし、`/auth/confirm`でボタン押下時に検証する
  パターンをコード例ごと追加（`assets/confirm-page.tsx`新設、`assets/callback-route.ts`更新）。
- Supabase監査ログでの診断手順（Diagnosingセクション）を追加。推測ではなくログを見てから対応する
  運用を明文化。
- 検証手順に「削除して再登録したテストユーザーではConfirm signup経路を踏まないため、必ず一度も
  招待したことのない新しいメールアドレスで最終確認する」ことを追加。
- スキル内`employee-actions.ts`サンプルのHostヘッダー依存も本体同様に修正。

### 本セッションで実施した変更（2026-07-19 その3・従業員マスターに「ふりがな」「ニックネーム」追加）
- DB: `employees`テーブルに`furigana`・`nickname`カラムを追加（ともに任意項目）。
- 従業員追加フォーム・編集パネルの両方で、入力順を「氏名 → ふりがな/ニックネーム（同じ行に横並び）
  → メールアドレス」に統一（`src/app/admin/employees/{actions,page,ui}.tsx`）。
- `addEmployee`/`updateEmployeeProfile`のスキーマ・保存処理に追加。一覧表示（`EmployeeTableRow`）は
  変更なし（氏名のみ表示、スコープ外）。

### 本セッションで実施した変更（2026-07-19 その4・勤務予定/シフト管理の追加）
オーナー依頼の大型機能。**開発ブランチ `claude/payroll-system-plan-8wvobq` で作業（main 未マージ・テスト用）**。
`npm run build && npm test`(21件) 通過、Supabase security advisor も新規オブジェクトの警告なしを確認済み。
- **DB(適用済み・`supabase/migrations/20260719_add_shift_scheduling.sql` に記録)**: `employees.color` 追加、
  `shift_assignments`(employee_id, work_date, slot A/B/C, unique(employee_id,work_date)。閲覧=全ログインユーザー/
  変更=管理者)、`app_settings` に `shift_slot_*` 既定、関数 `norm_hhmm` / `get_shift_status`(予実状態のみ返す・
  時刻は返さない) / `get_shift_roster` / `get_shift_settings`(いずれも SECURITY DEFINER・anon revoke・authenticated 付与)。
- **シフト予定表**: 管理者ホーム(`/admin`)を ShiftSchedule に置換(旧 DashboardCalendar は削除)。従業員は `/shifts`
  (下部ナビ「シフト」タブ追加)で閲覧のみ。カレンダーの各日にニックネームを**色付きチップ**で表示、予実相違の名前を
  **太字の赤字**。予定入力は管理者のみ(日タップ→従業員ごとにA/B/C選択/解除)。共有部品 `src/app/admin/shifts/`。
- **従業員色**: 従業員編集パネルで `SHIFT_COLORS`(明度高・彩度低の10色)から割当(重複可・任意)。一覧に色ドット。
- **勤務表 予実**: 下部一覧を**上段=予定(青)/下段=実績(緑)・日ごと横線**に変更。時刻相違は実績側を赤太字。
  カレンダー本体は実績のみ(従来通り)。**実績の新規入力時はシフト予定の時刻を初期表示**(`buildShiftMap`)。
- **設定「シフト枠」**: A/B/C のラベル・時刻を編集(`updateShiftSlots`)。深夜0時は「24:00」表記のまま保持、
  比較/入力用に `norm_hhmm`/`toInputTime` で正規化。
- **QR打刻に交通費**: 出勤・退勤どちらでも交通費入力可(開閉式)。**直近の交通費入力をデフォルト表示**、手段・区間・
  金額が揃った時のみ保存(`clock/actions.ts` の `transportFields`)。
- 詳細は design.md「8. 勤務予定・シフト管理」。⚠️ **本番 Supabase にはスキーマを適用済み**(追加のみで既存動作に影響なし)。

### 本セッションで実施した変更（2026-07-19 その5・シフト表を紙カレンダー実物に合わせて微修正/従業員一覧・時給の改善）
オーナーが実際の紙カレンダー画像を提示。レイアウト・文言・データモデルを実物と合わせて調整した。
`npm run build && npm test`(21件) 通過、Supabase advisor 警告なしを確認済み。
- **枠名称を A/B/C → 早番/遅番/深夜 に変更**（`app_settings` 更新済み、設定画面から変更可）。
- **カレンダーのセルを縦3段(上=早番/中=遅番/下=深夜)の色帯レイアウトに変更**（画像の紙カレンダーに合わせる）。
- **ニックネームのフォント表示区分を明確化**（`nicknameStyle()`）: 実績未入力=通常フォント/
  実績が予定と合致=**黒字の太字**/実績と不一致=**赤字の太字**（以前は「相違かどうか」の2値判定だった）。
- **DB: `shift_assignments` の自由記述メモ(note)を廃止し、`custom_start`/`custom_end`（変則出勤/退勤予定）に置換**。
  入力時は枠の既定時刻を上書きして `get_shift_status` の予実判定に使う（例: 深夜勤務の開始を早めた場合など）。
  カレンダー上のチップには**時(HH)のみの短縮表示**（`shiftNoteLabel()`。例「20〜」「〜7」「11〜18」）。
  シフト編集パネルに「変則勤務時間」の見出しで2欄（変則出勤予定 〜 変則退勤予定）を追加、未入力時のプレースホルダーは
  その枠の本来の予定時刻を表示。分割シフトは同じ枠に2人割当+各自の変則時刻で表現。
- **カレンダー上部レイアウト**: 早番/遅番/深夜の時刻一覧は**シフト編集パネルの上部**（管理者のみ）に移動。
  カレンダー上の補足説明は「太字＝実績入力済み。赤太字＝予定と実績が相違」に変更。編集パネルの説明文は削除。
- **DB: `wage_rates.hourly_wage` の CHECK制約を `>0` → `>=0` に変更**（経営者が現場ヘルプで無給勤務する場合に対応）。
  従業員登録・時給変更フォームの `min` も `0` に変更、スキーマ検証(`positive`→`min(0)`)も合わせて修正。
- **従業員一覧UI**: 「更新」ボタンをメール欄の右→**カラー選択の右**に移動。氏名の右にニックネームを表示。
  「状態」列見出しを**「在籍」**に変更し、在籍=**○**/退職=**×**の記号表示に変更。
- DB変更は `supabase/migrations/20260719_add_shift_scheduling.sql`（custom_start/custom_end に置換）と
  新設 `supabase/migrations/20260719_allow_zero_wage.sql` に記録。

### 本セッションで実施した変更（2026-07-19 その6・シフト画面のレイアウト微調整）
DBスキーマ変更なし。`src/app/admin/shifts/ShiftSchedule.tsx`・`src/app/admin/page.tsx` のみ変更。
`npm run build && npm test`(21件) 通過。
- **ホーム画面上部の期間ステータスバッジ（受付中/締め済み等）を廃止**（`admin/page.tsx`。シフト予定表への置換に伴い
  `pay_periods` の状態取得クエリごと削除）。
- **「シフト予定」タイトルの文字サイズを拡大**（`text-sm`→`text-lg font-bold`）。
- **カレンダー上部に「日をタップしてシフトを指定してください」を追加**（管理者の編集可能画面のみ。従業員の閲覧
  専用画面では表示しない）。続けて「太字＝実績入力済み。赤太字＝予定と実績が相違」を表示。
- **カレンダーのセルを勤務表カレンダーのスタイルに統一**: 日付を右寄せ→**中央寄せ**、文字サイズを拡大
  （`text-base sm:text-lg font-bold`）、曜日見出しも拡大（`text-sm`）。セルの最小高さを縮小
  （`min-h-24`→`min-h-16 sm:min-h-20`）し下の余白を詰めた。
- **シフト編集パネル上部の枠時刻一覧（早番 8:00〜17:00 等）を、背景ボックスなしの横スクロール1行表示に変更**
  （`rounded-lg bg-gray-50` の枠を廃止し `whitespace-nowrap overflow-x-auto` で1行に収める）。
- **変則勤務時間の入力行を右寄せ**（`justify-end` を追加）。

### 本セッションで実施した変更（2026-07-19 その7・シフト画面のコンパクト化）
DBスキーマ変更なし。`src/lib/shifts.ts`・`src/app/admin/shifts/ShiftSchedule.tsx` のみ変更。
`npm run build && npm test`(21件) 通過。
- **カレンダーのセル余白を極限まで詰めた**: セルの `margin`/`padding` を撤廃し、区切りは細い `border` のみに変更
  （隣接セルとほぼ接する）。ニックネーム＋変則時刻の短縮表記（例「けーやん20〜」）が5文字程度まで収まるように
  なった。合わせて日付見出しのラッパーからも余分な余白を除去。
- **シフト編集パネル上部の枠時刻一覧を「早番 8〜17時、遅番 15〜24時、深夜 24〜9時」の1行に短縮**: 従来は
  「早番 8:00〜17:00」のように分・コロン付きで表示し画面幅で見切れていたため、時(HH)のみの表記に変更する
  `slotHourRangeLabel()`（`src/lib/shifts.ts`）を新設。24時表記はそのまま「24」と表示（`hourOnly`の%24折返しを
  行わない別実装）。読点「、」区切りで1行に収める。
- **「変則勤務時間」の見出しを入力欄と同じ行・入力欄のすぐ左に移動**（従来は見出し→改行→入力欄の2行構成だった）。
- **シフト編集の一覧の行間隔を詰めてコンパクト化**: 各行の `py-1.5`→`py-1`、リスト全体の `space-y-2`→`space-y-1`、
  枠選択ボタンの高さも `h-8`→`h-7` に縮小。

### 本セッションで実施した変更（2026-07-19 その8・従業員画面の実機検証を踏まえたレイアウト調整）
オーナーが従業員側の画面も実機検証。管理者・従業員どちらにも枠時刻を見せたい、という要望を反映した。
DBスキーマ変更なし。`src/lib/shifts.ts`・`src/app/admin/shifts/ShiftSchedule.tsx` のみ変更。
`npm run build && npm test`(21件)・`eslint` 通過。
- **枠時刻一覧（早番 8〜17時、遅番 15〜24時、深夜 24〜9時）を、シフト編集パネル内から「カレンダーの直下」に移動**
  し、**管理者・従業員どちらの画面にも共通表示**にした（以前は管理者の編集パネル内のみで従業員からは見えなかった）。
- **「太字＝実績入力済み。赤太字＝予定と実績が相違」の説明文を、上記の枠時刻一覧の下に移動**（カレンダー上部から
  カレンダー下部へ）。カレンダー上部には管理者向けの「日をタップしてシフトを指定してください」のみ残した。
- **従業員側の日別パネル（閲覧専用・カレンダー下に表示）を全面刷新**: 従来は枠ごとにヘッダーを立てて色付きチップを
  横並びにしていたが、**「早番　ニックネーム　（変則時刻）」の1人1行・タブ状の縦揃え表示**に変更
  （`grid grid-cols-[3.5rem_auto_1fr]` を使い `Fragment` で3セルずつ流し込む3列グリッド）。
  - 名前列は**ニックネームのみ**（カレンダーチップのように変則時刻を連結した短縮表記ではなく、`displayName()`の
    プレーンな名前）。
  - フォントサイズはカレンダーの日付と同じ大きさ（`text-base sm:text-lg`）に拡大。
  - 変則勤務時間は**設定されている場合のみ**分まで含めて括弧書き（例「（〜11:00）」「（11:00〜）」）。新設の
    `customTimeParen()`（`src/lib/shifts.ts`）を使用。カレンダーチップ用の時のみ短縮表記
    `shiftNoteLabel()` とは別関数として使い分けている（表示形式が異なるため）。
  - 割当が無い日は「この日のシフト予定はありません」を表示。

### 本セッションで実施した変更（2026-07-19 その9・QR打刻シートの印刷不具合修正/PDFダウンロード追加）
オーナーから2件報告: ①印刷したQRコードが縦に伸びて表示される、②iPhone/iPadで印刷が反応しない。
両方とも `src/app/admin/settings/clock.tsx`・`src/app/globals.css` を変更して対応。依存追加
（`html2canvas`・`jspdf`、いずれも動的importでクライアント側のみ）。`npm run build && npm test`(21件) 通過。
- **QR画像が縦に伸びる不具合を修正**: `.qr-print-code img` に `aspect-ratio:1/1` と `object-fit:contain` を追加。
  従来は `width:70mm; height:70mm` のみで理論上は正方形のはずだったが、レンダリング環境によって歪みが出ていたため、
  縦横比を明示的に固定して確実に正方形になるようにした。
- **PDFダウンロード機能を追加**: iPhone/iPadを**ホーム画面に追加した状態(PWA standalone表示)では
  `window.print()` がそもそも動作しない**というWebKit側の既知の制限が原因と判明（通常のSafariタブでは動作する）。
  印刷に依存しない代替として、「PDFダウンロード」ボタンを追加。
  - 実装は `html2canvas`（印刷シート `.qr-print-sheet` をそのまま画像化。印刷と全く同じ見た目になる）→
    `jsPDF`（A4 1枚のPDFにその画像を貼り付けて `.save()` でダウンロード）という2段構成。
  - **日本語フォントをPDF側に埋め込む必要がない**のがこの方式の利点（jsPDFの標準フォントはCJK非対応だが、
    html2canvasでの画像化はブラウザ自身のcanvas描画に任せるため、端末に入っている日本語フォントがそのまま使われる）。
  - CSS: `.qr-print-sheet` 系のレイアウト定義（タイトル・QR・注意書きのスタイル）を `@media print` の外に出し、
    常時定義されたクラスにした。印刷時(`body.qr-print-mode`)・PDF生成時(`body.qr-capture-mode`)のどちらでも
    同じ見た目でレンダリングされる。PDF生成時は `position:fixed;left:-10000px` で画面外に描画してキャプチャし、
    ユーザーには見えないようにしている。
  - ボタン押下時にのみ `import("html2canvas")`/`import("jspdf")` を動的読み込みするため、通常の設定画面の
    バンドルサイズには影響しない。

### 本セッションで実施した変更（2026-07-19 その10・QR印刷の空白2ページ目対策/印刷ボタン非表示/打刻拒否UI/ログ分類）
オーナーから4件報告。DBスキーマ変更なし。`npm run build && npm test`(21件) 通過。
- **QR印刷/PDFの空白2ページ目を修正**: 前回セッションで縦横比バグを直したところ、今度は空白の2ページ目が
  出るようになった（過去にも同種の不具合があり一度直した経緯があるため再発防止を優先）。原因を断定できなかった
  ため、`.qr-print-sheet` を `min-height:297mm` から **`height:297mm; overflow:hidden;`** に変更し、
  `break-after`/`break-inside`（および互換のため `page-break-after`/`page-break-inside`）を `avoid` に設定。
  内容が万一はみ出しても2ページ目が生成されないようにする防御的な修正で、印刷・PDFダウンロードの両方に効く。
- **「印刷」ボタンをiPhone/iPad(ホーム画面追加=PWA standalone)では非表示に**: `window.print()`が動作しない
  環境そのものでボタンを出さないようにした（`src/app/admin/settings/clock.tsx`）。判定は
  `navigator.userAgent`のiPad/iPhone/iPod検出 + iPadOSがMacと名乗る問題への対応
  (`navigator.platform==="MacIntel"&&maxTouchPoints>1`) + `navigator.standalone`(iOS固有)または
  `matchMedia("(display-mode: standalone)")`。非対応環境では説明文も「PDFダウンロードをお使いください」に変更。
- **打刻拒否時にOKボタンをグレーアウト**: 圏外で打刻拒否になった場合、`ClockResult`に`blocked:true`を追加し
  (`src/app/clock/actions.ts`)、`ClockConfirm`(`src/app/clock/ui.tsx`)がそれを見てボタンを`disabled`+灰色表示に
  する。同じ場所からの再試行では結果が変わらないため。
- **操作ログの「打刻」を「圏外打刻」に分離**: 圏外のまま「警告のみ」ポリシーで打刻が通った場合、従来の「打刻」
  カテゴリではなく**「圏外打刻」（オレンジ色バッジ）**で記録するよう変更（`src/app/clock/actions.ts`の
  `logActivity`呼び出し、`src/app/admin/logs/page.tsx`の`actionClass()`にオレンジ色を追加）。打刻拒否
  （reject方針）は従来通り「エラー」カテゴリのまま変更していない。

> ⚠️ 過去セッションは開発ブランチ `claude/payroll-system-plan-8wvobq` に直接 push して main へマージ運用してきた。
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
- 初回登録フロー: `/register`（メールのみ・OTP送信・`friendlyOtpError`）→ `/auth/callback`（検証なしのリダイレクトのみ）
  → `/auth/confirm`（「続ける」ボタン押下時に`verifyOtp`実行、setup=1判定）→ `/set-password`。
  `/auth/callback`が即座に検証していた旧実装はメールのセキュリティスキャナーによる自動先読みでトークンが
  消費される不具合があったため2026-07-18に`/auth/confirm`経由に変更(下記参照)。
  `/set-password`（`src/app/set-password/page.tsx`）は `updateUser` で設定。8文字以上＋英数字混在必須。
  **過去パスワードとの一致チェックは不要**方針のため、GoTrue の `same_password` エラーは成功扱いにして `/` へ進める
  （同一パスワードで再設定可）。
- 税額表の取込・国税庁リンク: `src/app/admin/settings/{page,ui,actions.ts}`（`importTaxTable`）。甲欄0〜7人＋乙欄を保持。
  取込済みデータは年選択の表で表示。国税庁DLページ（No.2502）への外部リンク＋コピペ手順を UI に併記。
- **パスワード再設定（管理者発行）**: `src/app/admin/employees/actions.ts` の `resetEmployeePassword`、
  検証は `src/app/auth/confirm/page.tsx`（`token_hash`+`verifyOtp`、ボタン押下時のみ実行）。
  `src/app/auth/callback/route.ts`は検証を行わず`/auth/confirm`へリダイレクトするだけ。
  **Supabase「Reset password」テンプレート依存**。認証パターンの解説はスキル `.claude/skills/supabase-invite-auth/`。
- RLS/権限: DBの関数 `is_admin()` 等（Supabase側）。画面ガードは `src/lib/auth.ts`。
- 従業員の登録/編集・No自動採番: `src/app/admin/employees/{actions,ui}.tsx`（`addEmployee`/`nextEmployeeNo`/`updateEmployeeProfile`/`resetEmployeePassword`）。
  氏名・ふりがな・ニックネーム・メールアドレスの入力順で登録・編集する（ふりがな/ニックネームは任意・同じ行に横並び）。
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
- 操作ログ: 記録ヘルパー `src/lib/log.ts`（`log_activity` RPC）、閲覧 `src/app/admin/logs/page.tsx`、DB関数 `log_activity`
  （90日自動削除・削除も記録）。記録追加は各アクションで `logActivity("種別", "詳細")` を呼ぶだけ。
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
- [ ] **Supabase メールテンプレ依存の注意（要確認: 3テンプレ全て）**: 初回登録・パスワード再設定は
      「Magic Link」「Reset password」「Confirm signup」の**3つとも**`{{ .TokenHash }}`リンクである
      ことに依存。どれか1つでも初期化/変更すると壊れる（design.md「4. 認証・ロール」参照。
      「Confirm signup」は2026-07-19に見落としが発覚し修正済み）。
- [x] **セキュリティレビュー(2026-07-18)**: 致命的1件・危険4件・勧告5件を全件対応済み。
      詳細・今後の追跡は `docs/security-review-2026-07-18.md` 参照。
- [ ] **Supabase 漏洩パスワード保護は無料プランで利用不可**: Proプランへのアップグレード判断待ち
      （現状はアプリ側の代替策＝英数字混在必須化のみで運用。design.md「6.1 セキュリティ」参照）。
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
