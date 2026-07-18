# セキュリティレビュー結果と対応管理表

実施日: 2026-07-18
対象: 本番稼働中の給与管理システム（`richardx007/oominami-payroll`）
方法: DB(Supabase) の RLSポリシー・SECURITY DEFINER関数・Security Advisor の確認、
サーバーアクション/認証フロー/メール送信処理のコードレビュー、依存パッケージの脆弱性チェック(`npm audit`)。

このドキュメントは今後の対応状況を追記して管理するための資料です。対応が完了した項目は
「状態」列を `✅ 対応済み(日付)` に更新し、対応内容を「対応メモ」に追記してください。

---

## 総評

全体として **RLSと認可チェックの設計は堅牢**。各テーブルは `is_admin()` / `current_employee_id()`
で適切にガードされ、サーバーアクション側でも `requireAdmin()` による二重チェックがある。
以下は個別に見つかった改善点。

---

## 🔴 致命的（今すぐ対応すべき）

### #1 パスワード再設定・初回登録メールのリンク先が Host ヘッダーに依存

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `src/app/register/actions.ts:54`、`src/app/login/actions.ts:37`、`src/app/admin/employees/actions.ts:258,316` |
| 問題 | メールに載せるリンクの生成元を `headers().get("x-forwarded-host") ?? headers().get("host")` から組み立てている。Hostヘッダー詐称(Host Header Injection)が可能な場合、初回登録・パスワード再設定メールのリンクを攻撃者ドメインへ誘導できる。本システムのリンクは `token_hash` をURLクエリに直接含む方式(`verifyOtp`)のため、リンクが攻撃者サーバーに渡ると**そのままアカウント(管理者含む)を乗っ取られ、パスワードを勝手に設定される**おそれがある。 |
| 対応方針 | リダイレクト先を環境変数(例: `NEXT_PUBLIC_SITE_URL=https://oominami-payroll.shinsekai.workers.dev`)に固定し、リクエストヘッダーに依存しないようにする。4箇所とも数行の修正で対応可能。 |
| 対応メモ | `src/lib/site-url.ts` に `getSiteUrl()` を新設し、4箇所すべてを `NEXT_PUBLIC_SITE_URL` ベースに置き換え。`.env`・`.env.example`・`wrangler.jsonc` に `NEXT_PUBLIC_SITE_URL=https://oominami-payroll.shinsekai.workers.dev` を追加。`npm run build`・`npm test` とも成功を確認。開発ブランチにコミット・push済み(mainマージは別途判断)。 |

---

## 🟠 危険（早めに対処すべき）

### #2 Supabaseの「漏洩パスワード保護」が無効

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 代替策で対応済み(2026-07-18) |
| 該当箇所 | Supabase ダッシュボード > Authentication > Attack Protection、`src/app/set-password/page.tsx` |
| 問題 | Security Advisor 検出 (`auth_leaked_password_protection`)。HaveIBeenPwned.org 照合による既知漏洩パスワードのブロックが無効。従業員は高齢者含む一般ユーザーで使い回しパスワードのリスクが高い。 |
| 対応方針 | Supabaseダッシュボードで機能を有効化するのみ(コード変更不要)…のはずだったが、**この機能はProプラン以上限定**と判明(2026-07-18、オーナーが実際にダッシュボードでON→Saveを試行した際に `Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up.` のエラーで保存失敗)。現在のプロジェクトは無料(FREE)プランのため有効化不可。 |
| 対応メモ | Proプランへのアップグレードは行わず、**無料プランのままアプリ側で緩和策を追加**する方針をオーナーが選択。`/set-password` のパスワード検証に「英字と数字の両方を含める」ことを必須化(8文字以上の既存条件に追加)。HaveIBeenPwned照合そのものは実現できていないため、Supabase側の対応(将来的なProプラン移行)は引き続き選択肢として残る。 |

### #3 セキュリティヘッダーが一切設定されていない

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `next.config.ts`、`middleware.ts`(`src/lib/supabase/middleware.ts`) |
| 問題 | CSP / X-Frame-Options / HSTS / X-Content-Type-Options などのレスポンスヘッダーが未設定。給与・個人情報を扱う画面がiframeに埋め込まれてクリックジャッキングされるリスク等に対する防御がない。 |
| 対応方針 | `next.config.ts` の `headers()` で最低限 `X-Frame-Options: DENY`、`X-Content-Type-Options: nosniff`、`Strict-Transport-Security` を追加。 |
| 対応メモ | `next.config.ts` に `headers()` を追加し、全パスに `X-Frame-Options: DENY`・`X-Content-Type-Options: nosniff`・`Referrer-Policy: strict-origin-when-cross-origin`・`Strict-Transport-Security`・`Permissions-Policy(geolocation=self・camera/microphone禁止)` を付与。`next start` で実際にヘッダーが返ることを確認、`npx opennextjs-cloudflare build` でもビルド成功を確認。CSP(Content-Security-Policy)は本番動作を壊すリスクがあるため今回は見送り、別タスクとして検討する。 |

### #4 `log_activity` RPCが未ログインでも無制限に呼べる

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | DB関数 `public.log_activity(p_action, p_detail)`、呼び出し元 `src/lib/log.ts`・`login/page.tsx` |
| 問題 | ログイン試行の記録のためanon実行を許可しているが、レート制限が無く、未認証のまま`/rest/v1/rpc/log_activity`へ任意テキストを送り続けることで`activity_logs`テーブルを埋め尽くせる(ストレージ消費・ログ画面のノイズ化)。 |
| 対応方針 | Cloudflare側のIP単位レート制限の追加、またはDB側での簡易フラッド対策(頻度制限)を検討。 |
| 対応メモ | `log_activity` 関数を更新し、未ログイン(`actor_id`特定不可)からの呼び出しが直近1分間に20件を超える場合は記録をスキップするようにした(例外にせず無視することで、正規の登録・再設定メール送信フローのUXは維持)。anon実行権限自体は登録/パスワード再設定フローに必須のため維持。マイグレーション `harden_security_definer_grants_and_rate_limit_log_activity` として適用済み。より厳密なレート制限が必要ならCloudflare側のIPベース制限も別途検討可。 |

### #5 SECURITY DEFINER関数にanon/authenticatedへの実行権限がデフォルトのまま残っている

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18・一部) |
| 該当箇所 | DB関数 `delete_employee`・`count_employee_work_entries`・`get_clock_settings`・`log_activity`・`current_employee_id`・`is_admin`・`is_period_open`・`link_employee_account`・`email_registered` |
| 問題 | Advisorが「anon/authenticatedが実行可能」と警告。関数内部は`is_admin()`等のチェックで守られており**現状は悪用不可**と確認済みだが、これは「たまたま安全」な状態。将来の修正でチェックを外し忘れると即座に脆弱性化する。 |
| 対応方針 | `REVOKE EXECUTE ... FROM anon, authenticated` した上で、必要な関数(`email_registered`など)だけ個別に`GRANT`し直す運用に変更(多層防御)。 |
| 対応メモ | 管理者専用の`delete_employee`・`count_employee_work_entries`はanon/PUBLICから実行権限を剥奪し`authenticated`のみに限定。`get_clock_settings`は打刻(要ログイン)時にのみ呼ばれるためanon権限を剥奪し`authenticated`のみに限定。アプリコード側もこれら3関数は`requireAdmin()`/`requireEmployee()`通過後にしか呼んでいないことを確認済みで機能影響なし。`email_registered`(登録前チェック用)・`log_activity`(登録/再設定申請用)はanon実行が業務上必須のため維持(#4のフラッド対策で補強)。`current_employee_id`・`is_admin`・`is_period_open`・`link_employee_account`は元々authenticatedのみでanon権限は無く、RLSポリシー内部評価に必要なため変更なし。 |

---

## 🟡 勧告（運用上で留意）

### #6 `npm audit`: postcss (<8.5.10) の中程度脆弱性

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `next` の依存(ビルド時) |
| 問題 | XSS via Unescaped `</style>` in CSS Stringify Output。ユーザー入力がCSSとして出力される経路は無く実行時影響は限定的。 |
| 対応方針 | 定期的な依存更新(`npm audit` / `npm outdated`)の習慣化。 |
| 対応メモ | Next 16.2.10自体は最新安定版(16.3はcanary/preview限定)で、脆弱なpostcss@8.4.31はNext内部にバンドルされたもの。`package.json` に `"overrides": { "postcss": "^8.5.10" }` を追加して強制的に安全なバージョンへ固定。`npm audit` は0件に。ビルド後の実際のCSS出力(`_next/static/chunks/*.css`)が正常に生成・配信されることも確認済み。 |

### #7 サーバーエラーメッセージをそのままユーザーに表示している箇所が多い

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `admin/employees/actions.ts`、`clock/actions.ts` 等の複数箇所(`"...に失敗しました: " + error.message` 形式) |
| 問題 | Supabase/Postgresの生エラー文をUIに表示しており、内部実装の手がかりを与える情報漏洩の一種。管理者専用画面は許容範囲だが、一般従業員が見る画面(打刻など)では望ましくない。 |
| 対応方針 | 一般ユーザー向け画面は汎用メッセージ＋サーバー側ログ記録に寄せる。管理者向け画面は現状維持で可。 |
| 対応メモ | 一般従業員が使う`clock/actions.ts`(出勤/退勤打刻)の2箇所を修正。生の`error.message`をUIから外し、「時間をおいて再度お試しください」という汎用メッセージに変更。詳細は`logActivity("エラー", ...)`でサーバー側の操作ログに記録し、原因調査は`/admin/logs`から追跡可能。`(employee)/timesheet/actions.ts`は元々`error.message`を分類判定にのみ使い画面表示していないことを確認、変更不要。管理者専用画面(`admin/employees/actions.ts`等)は現状維持。 |

### #8 メールアドレスの登録有無で応答メッセージが異なる(アカウント列挙)

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `src/app/register/actions.ts`(`sendRegisterLink`) |
| 問題 | `requestPasswordReset`は意図的に常に同じ文言を返す設計だが、`sendRegisterLink`は「従業員として登録されていない」旨を明示的に返す。実害は小さい(このシステムの利用者かどうかが分かる程度)が一貫性の観点で気になる場合は要検討。 |
| 対応方針 | 必要に応じて中立メッセージ化。優先度は低い。 |
| 対応メモ | `email_registered`が`false`の場合でも実際にはメール送信をスキップしつつ`{ ok: true, message: "" }`を返すよう変更。画面側は成功時と同じ「確認メールを送信しました」表示になるため、`requestPasswordReset`と同様にアカウント列挙ができなくなった。 |

### #9 パスワードポリシーが「8文字以上」のみ

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `src/app/set-password/page.tsx` |
| 問題 | 文字種の強制がない。#2(漏洩パスワード保護)と合わせて対応すると効果的。 |
| 対応方針 | 最低限の運用ガイド(推測されやすいパスワードを避ける案内文)をパスワード設定画面に追加。 |
| 対応メモ | #2の代替策として、英字と数字の両方を含めることを必須化済み(8文字以上の既存条件に追加)。詳細は#2の対応メモ参照。 |

### #10 `.env.local` に未使用の空シークレット項目が残っている

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `.env.local`(`SUPABASE_SECRET_KEY`・`RESEND_API_KEY`) |
| 問題 | 過去に検討したResend経由送信の名残。現在は自作SMTPに置き換え済みでコード内で未参照、値も空欄で実害なしを確認済み。git履歴にも含まれていないことを確認済み。 |
| 対応方針 | 混乱防止のため未使用項目を`.env.example`含め整理。優先度は低い。 |
| 対応メモ | `.env.local`から未使用の`SUPABASE_SECRET_KEY`・`RESEND_API_KEY`を削除(このファイルは`.gitignore`対象のためリポジトリには影響なし、ローカル環境のみの整理)。現役利用中の`TAX_ACCOUNTANT_EMAIL`は残置。`.env.example`は元々未使用項目を含んでおらず対応不要だった。 |

---

## 追加で発見・対応した不具合

### #11 認証メールのリンクがメールセキュリティスキャナーの自動プリフェッチでトークン消費され、本人クリック時に無効になる

| 項目 | 内容 |
|---|---|
| 状態 | ✅ 対応済み(2026-07-18) |
| 該当箇所 | `src/app/auth/callback/route.ts`(旧実装)、新設 `src/app/auth/confirm/page.tsx` |
| 経緯 | オーナーより「パスワード再設定メールのリンクを押すと、再設定画面ではなくログイン画面が表示される(以前にも発生)」と報告。 |
| 原因 | Supabase監査ログ(`get_logs` service=auth)を確認した結果、同一トークンに対して`POST /verify`が約2分20秒の間隔で2回発生していた: 1回目は成功(200)、2回目は`403 "One-time token not found"`(エラー: One-time token not found)。旧`/auth/callback`はGETリクエストを受けた瞬間に`verifyOtp`(状態変更・1回限り消費)を即実行していたため、メールセキュリティスキャナーやリンクプレビュー機能がメール内リンクを自動で先読み(プリフェッチ)した際にトークンを消費してしまい、本人が実際にクリックした時には既に無効という状態になっていたと判断。 |
| 対応内容 | `/auth/callback`は検証を行わず、パラメータをそのまま`/auth/confirm`へリダイレクトするだけに変更。新設した`/auth/confirm`(クライアントコンポーネント)は「続ける」ボタンを表示し、**ユーザーがボタンを押した時点で初めて**`verifyOtp`/`exchangeCodeForSession`を実行する。自動プリフェッチ(GETのみ、JS非実行のボットが大半)はボタンを押せないため、トークンが誤って消費されなくなる。ビルド・テスト・Playwrightでのボタン表示確認(JSエラー0件)まで実施。 |
| 影響範囲 | パスワード再設定(管理者発行・本人申請の両方)・初回登録の確認メール、双方のリンクに対して同様の保護が適用される(いずれも`/auth/callback`経由のため)。 |

---

## 良好だった点(参考・現状維持でOK)

- 全テーブルRLS有効、`employees`テーブルに自己UPDATE権限がなく権限昇格経路なし
- 各admin系サーバーアクションが`requireAdmin()`を毎回呼び、RLSだけに依存しない多層防御
- メールヘッダー生成(`smtp.ts`)はCRLF文字を含む文字列を自動的にMIMEエンコードしており、ヘッダーインジェクション対策済み
- メールアドレスは全経路で`zod`のメール形式検証を通過してから保存されている
- 秘密情報(`GMAIL_APP_PASSWORD`)はCloudflare Secretで正しく管理、`.env`にコミットされているのは公開値のみ

---

## 進捗サマリー(更新のたびにここを書き換える)

| レベル | 件数 | 対応済み |
|---|---|---|
| 🔴 致命的 | 1 | 1 |
| 🟠 危険 | 4 | 4(#2はSupabase側は無料プランの制約で代替策対応) |
| 🟡 勧告 | 5 | 5 |

最終更新: 2026-07-18(全10項目対応完了。#2のみSupabase無料プランの制約でアプリ側代替策)
