# 引き継ぎ書（次セッション向け）

最終更新: 2026-07-07

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

## 2. 現在の状態（2026-07-07 時点）

### 実装済み・本番稼働中
- ✅ 認証（初回登録・ログイン・ロール別リダイレクト）
- ✅ 従業員管理（登録・時給変更・税区分変更・退職・招待メール）
- ✅ 勤務表入力（スマホ向けカレンダーUI）
- ✅ 入力状況ダッシュボード（管理者）
- ✅ 給与計算エンジン + Vitest テスト18件
- ✅ 締め処理（プレビュー・締め・締め解除・支払済み）
- ✅ 給与明細閲覧（従業員）・メール配信
- ✅ 連絡・催促・一斉報知
- ✅ 税理士向け支給一覧（印刷/PDF・メール送信）
- ✅ 源泉徴収税額表のCSV取込
- ✅ メール設定の画面管理化（会社名・送信元・税理士アドレス）
- ✅ Cloudflare 自動デプロイ（main push）

### 動作確認済み（実機）
初回登録 → ログイン → 従業員登録 → 招待メール送信 → 従業員の初回登録 →
勤務表画面表示、まで確認済み。

### 未確認・これからテストする領域
- 勤務表の複数日入力 → ダッシュボード反映
- 締め処理 → 明細生成 → 従業員の明細閲覧 → メール配信
- 税理士資料のPDF出力・メール送信
- 88,000円以上の従業員での源泉税額表を使った計算

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

---

## 5. コード上の要点（変更時に見るべき場所）

- 給与計算を変えるとき: `src/lib/payroll.ts`（純粋関数）+ `payroll.test.ts` を必ず更新。
  DB集計は `src/lib/payroll-data.ts`。
- 給与期間（26日〜25日）の定義: `src/lib/period.ts`。締め日・支払日ルールはここ。
- メール本文・送信: `src/lib/email.ts`（設定取得・本文生成）、`src/lib/smtp.ts`（SMTP）。
- RLS/権限: DBの関数 `is_admin()` 等（Supabase側）。画面ガードは `src/lib/auth.ts`。
- 用語: UIは「従業員」で統一。**DBのカラム名は `employee_*` のまま**（変更していない）。

---

## 6. 未実装・改善候補（バックログ）

優先度は状況により再判断すること。

- [ ] **Supabase 休止対策**: 無料プロジェクトは長期未アクセスで一時停止。
      Cloudflare Cron Trigger で定期 ping する仕組みが未実装（当初計画にはあった）。
- [ ] **E2Eテスト**: 締め〜配信の一連フローの自動テストは未整備。
- [ ] 招待メール本文に「迷惑メールを確認してください」の一文を追加すると親切。
- [ ] 従業員の氏名編集UI（現状、編集は時給・税区分・退職のみ）。
- [ ] 給与明細のPDF体裁（現状はブラウザ印刷。専用レイアウトが必要なら @react-pdf 等）。
- [ ] 会社名・住所などを給与明細/税理士資料の帳票ヘッダーに反映（company_name は
      メール差出人名のみ利用中）。
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
