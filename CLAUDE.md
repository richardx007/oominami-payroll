# CLAUDE.md — oominami-payroll

> Claude Code がセッション開始時に読む「このリポジトリの正しい接続先」の宣言。
> 期待値と実接続が食い違ったら、作業を止めて警告すること。

## このアプリのリソース（期待値）※実値確認済み

| 項目 | 期待値 |
|---|---|
| Supabase アカウント/組織 | richardx007's Org（slug: chwdsaoevqkqkggvlopx）＝**旧アカウント** |
| Supabase project ref | zvrwkmriosaldjqpxdwi（プロジェクト名: oominami-payroll） |
| MCP接続名（サーバー名） | supabase-oominami ← このアプリ専用の名前（他アプリと重複させない） |
| リージョン | ap-northeast-1 |
| Cloudflare account_id | 1247387756de44e42854c39476b02e86 |
| Cloudflare プロジェクト名 | oominami-payroll |
| GitHub リポジトリ | richardx007/oominami-payroll（Public） |

## 接続方式（A方式：HTTP + OAuth）

- Supabase は `.mcp.json` の HTTP サーバーとして定義し、URLに **project_ref を固定**。
- 認証は **OAuthログイン**（トークンはファイルに保存しない）。
- 接続名を **supabase-oominami** としているのが重要。OAuthログインは接続名ごとに別々に記憶されるため、
  この名前を他アプリ（特に別アカウントの新アプリ）と重複させないこと。重複させると別アカウントの
  ログインを使い回してしまい、取り違えが起きる。

## ⚠️ セッション開始時プリフライト（必ず最初に実行）

1. GitHub 確認：
   ```
   git remote -v
   ```
   → 期待する oominami-payroll のリポジトリと一致するか。

2. Supabase 認証状態：`/mcp` を実行し、`supabase-oominami` が「Connected（認証済み）」か確認。
   未認証なら `/mcp` からOAuthログイン（richardx007 の**旧アカウント**でログインすること）。

3. 接続先の正しさ確認（project_ref は .mcp.json で固定済みなので、あとは"正しいアカウントでlog inできているか"だけ確認）：
   - MCPツール `list_tables` を実行し、oominami-payroll の想定テーブルが見えるか。
   - もし 403 / Unauthorized なら、別アカウントでログインしている合図。即停止して警告。

食い違ったら停止して報告する。

## 注意
- これは旧アカウント側のアプリ。新アプリ（別アカウント）とは接続名・project_refを絶対に混在させない。
- トークンはコミットしない（この方式ではそもそもトークンを保存しない）。
- **新しいテーブル・ビューには、同じマイグレーションで権限を明示する**(2026-10-30 から Supabase は public の新テーブルに Data API の権限を自動で付けない。付け忘れると画面で「permission denied」になる。既存のテーブルは影響なし)。形: `grant select, insert, update, delete on public.<表> to authenticated, service_role;`(使わない操作は外してよい)。テーブルを `anon` に直接開けない(ログイン前に見せるものは、これまでどおり関数で出す。例: `public_business_calendar`)。経費管理(oominami-business)と DB を共用しているので、経費の CLAUDE.md にも同じ決まりがある

## ⚠️ Cloudflare 無料プランの CPU 上限(Error 1102)
- 無料プランのまま続ける方針(2026-10-18 オーナー決定)。1回 10ms が上限。詳細は `docs/design.md` §32。
- 件数の多い一覧をサーバーで全件読んで画面に埋め込まない(ブラウザから読む/件数を絞る)。重い処理(一斉送信など)を1回の操作で繰り返さない。
- 日付の書式は `src/lib/jst-format.ts` を使う。
- 確認は月1回 `node scripts/cpu-report.mjs`(Workers Logs。トークンに Workers Observability: Read が必要)。
- メニューの先読み(prefetch)は止めない(体感を優先)。
