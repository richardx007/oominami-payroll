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
