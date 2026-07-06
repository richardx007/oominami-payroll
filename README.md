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

## デプロイ(Cloudflare)

```bash
npm run preview   # ローカルで Workers ランタイム確認
npm run deploy    # Cloudflare へデプロイ(要 wrangler login)
```

## Supabase

- プロジェクト: `oominami-payroll`(ap-northeast-1)
- マイグレーションは Supabase MCP / ダッシュボード経由で管理
