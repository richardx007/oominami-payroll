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
| 状態 | ⬜ **対応不可(無料プランの制約)** |
| 該当箇所 | Supabase ダッシュボード > Authentication > Attack Protection |
| 問題 | Security Advisor 検出 (`auth_leaked_password_protection`)。HaveIBeenPwned.org 照合による既知漏洩パスワードのブロックが無効。従業員は高齢者含む一般ユーザーで使い回しパスワードのリスクが高い。 |
| 対応方針 | Supabaseダッシュボードで機能を有効化するのみ(コード変更不要)…のはずだったが、**この機能はProプラン以上限定**と判明(2026-07-18、オーナーが実際にダッシュボードでON→Saveを試行した際に `Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up.` のエラーで保存失敗)。現在のプロジェクトは無料(FREE)プランのため有効化不可。 |
| 対応メモ | 選択肢: (a) Supabaseを Pro プラン(有料)にアップグレードして本機能を有効化する、(b) 無料プランのまま運用でカバーする(アプリ側で簡易的な弱いパスワードのブロックリストチェックを追加する等の代替策、完全に同等ではないが緩和にはなる)。費用判断が絡むためオーナーの意思決定待ち。 |

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
| 状態 | ⬜ 未対応 |
| 該当箇所 | `next` の依存(ビルド時) |
| 問題 | XSS via Unescaped `</style>` in CSS Stringify Output。ユーザー入力がCSSとして出力される経路は無く実行時影響は限定的。 |
| 対応方針 | 定期的な依存更新(`npm audit` / `npm outdated`)の習慣化。 |
| 対応メモ | (未記入) |

### #7 サーバーエラーメッセージをそのままユーザーに表示している箇所が多い

| 項目 | 内容 |
|---|---|
| 状態 | ⬜ 未対応 |
| 該当箇所 | `admin/employees/actions.ts`、`clock/actions.ts` 等の複数箇所(`"...に失敗しました: " + error.message` 形式) |
| 問題 | Supabase/Postgresの生エラー文をUIに表示しており、内部実装の手がかりを与える情報漏洩の一種。管理者専用画面は許容範囲だが、一般従業員が見る画面(打刻など)では望ましくない。 |
| 対応方針 | 一般ユーザー向け画面は汎用メッセージ＋サーバー側ログ記録に寄せる。管理者向け画面は現状維持で可。 |
| 対応メモ | (未記入) |

### #8 メールアドレスの登録有無で応答メッセージが異なる(アカウント列挙)

| 項目 | 内容 |
|---|---|
| 状態 | ⬜ 未対応 |
| 該当箇所 | `src/app/register/actions.ts`(`sendRegisterLink`) |
| 問題 | `requestPasswordReset`は意図的に常に同じ文言を返す設計だが、`sendRegisterLink`は「従業員として登録されていない」旨を明示的に返す。実害は小さい(このシステムの利用者かどうかが分かる程度)が一貫性の観点で気になる場合は要検討。 |
| 対応方針 | 必要に応じて中立メッセージ化。優先度は低い。 |
| 対応メモ | (未記入) |

### #9 パスワードポリシーが「8文字以上」のみ

| 項目 | 内容 |
|---|---|
| 状態 | ⬜ 未対応 |
| 該当箇所 | `src/app/set-password/page.tsx` |
| 問題 | 文字種の強制がない。#2(漏洩パスワード保護)と合わせて対応すると効果的。 |
| 対応方針 | 最低限の運用ガイド(推測されやすいパスワードを避ける案内文)をパスワード設定画面に追加。 |
| 対応メモ | (未記入) |

### #10 `.env.local` に未使用の空シークレット項目が残っている

| 項目 | 内容 |
|---|---|
| 状態 | ⬜ 未対応 |
| 該当箇所 | `.env.local`(`SUPABASE_SECRET_KEY`・`RESEND_API_KEY`) |
| 問題 | 過去に検討したResend経由送信の名残。現在は自作SMTPに置き換え済みでコード内で未参照、値も空欄で実害なしを確認済み。git履歴にも含まれていないことを確認済み。 |
| 対応方針 | 混乱防止のため未使用項目を`.env.example`含め整理。優先度は低い。 |
| 対応メモ | (未記入) |

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
| 🟠 危険 | 4 | 3(#2は無料プランのため対応不可、意思決定待ち) |
| 🟡 勧告 | 5 | 0 |

最終更新: 2026-07-18(#1・#3・#4・#5 対応。#2はSupabase無料プランの制約で保留、代替策要検討)
