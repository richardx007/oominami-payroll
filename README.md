# 給与管理システム(oominami-payroll)

アルバイトの勤務表申告・給与計算・明細配信・税理士向け資料作成を行うシステム。

- 開発計画: [docs/development-plan.md](docs/development-plan.md)
- 技術スタック: Next.js (App Router) / TypeScript / Tailwind CSS / Supabase / Cloudflare Workers

## 開発

```bash
cp .env.example .env.local   # 環境変数を設定
npm install
npm run dev                  # http://localhost:3000
```

## デプロイ(Cloudflare Workers Builds / Git連携)

Cloudflare ダッシュボード > Workers & Pages > Create > 「Import a repository」で
このリポジトリを接続すると、プッシュのたびに自動デプロイされる。

- ビルドコマンド: `npx opennextjs-cloudflare build`
- デプロイコマンド: `npx opennextjs-cloudflare deploy`

Secrets(Workers > 設定 > 変数と Secrets):

| 変数 | 用途 |
|------|------|
| `GMAIL_USER` | 送信元 Gmail アドレス |
| `GMAIL_APP_PASSWORD` | Gmail のアプリパスワード(2段階認証必須) |
| `TAX_ACCOUNTANT_EMAIL` | 税理士宛てメールアドレス |

デプロイ後、Supabase ダッシュボード > Authentication > URL Configuration の
Site URL / Redirect URLs に本番URL(`https://…workers.dev` など)を追加すること。

手動デプロイする場合(要 `wrangler login`):

```bash
npm run deploy
```

## Supabase

- プロジェクト: `oominami-payroll`(ap-northeast-1)
- マイグレーションは Supabase MCP / ダッシュボード経由で管理
