# 障害復旧手順書（バックアップと再構築）

このシステムが失われた場合に作り直すための手順と、そのために必要な備えをまとめる。

> **結論: Git だけでは再構築できない。**
> コードは Git にあるが、**シークレット・各サービスの設定・DBのデータ**は Git に無い。
> 「Git + データバックアップ + この手順書 + パスワードマネージャ」の4点が揃って初めて復旧できる。

---

## 1. 何がどこにあるか

| 対象 | 保管場所 | 失われたときの影響 |
|---|---|---|
| アプリのコード | GitHub `richardx007/oominami-payroll` | 大（作り直し） |
| DBのスキーマ・データ | **GitHub `oominami-payroll-backups`（毎日自動）** | 致命的 |
| 認証ユーザー（auth.users） | 同上（`auth_data.sql`） | 全員が再登録に |
| シークレット類 | **パスワードマネージャ（要・人手で管理）** | 再発行で対応可 |
| Supabase の各種設定 | Supabase ダッシュボードのみ → 本書 §4 に手順 | 中（手作業で再設定） |
| Cloudflare の設定 | Cloudflare ダッシュボードのみ → 本書 §5 に手順 | 中（手作業で再設定） |
| 勤務ルール文書（Storage） | Supabase Storage のみ | 小（再アップロードで可） |

**Supabase の無料プランには自動バックアップが無い**（Pro以上のみ）。公式ドキュメントでも
無料プランは `db dump` で自分でエクスポートしオフサイト保管することが推奨されている。
また **プロジェクトを削除すると、Supabase 側のバックアップも含めて完全に消える**。

---

## 2. 毎日のバックアップ（自動）

`.github/workflows/backup.yml` が毎日 JST 03:00 に実行され、
プライベートリポジトリ `oominami-payroll-backups` に以下をコミットする。

| ファイル | 内容 |
|---|---|
| `schema.sql` | テーブル・RLSポリシー・関数・トリガ・権限（**再構築の土台**） |
| `data.sql` | 業務データ（public スキーマ） |
| `auth_data.sql` | 認証ユーザー（`auth.users` / `auth.identities`） |

取得には **`pg_dump` を直接**使う（Supabase CLI は使わない）。CLI は `pg_dump` を
コンテナ内で実行する際に接続URLを解析し直すため、**Session pooler 用のユーザー名
`postgres.<project-ref>` が `postgres` に落ちて認証に失敗する**（2026-07-28に判明。
CLIをやめて `pg_dump` を直接叩いたところ同じ資格情報で認証が通った）。

> ⚠️ **`pg_dump` はサーバーと同じメジャーバージョンが必要**（古いと
> `aborting because of server version mismatch` で失敗する）。GitHub の ubuntu ランナーには
> 16 系が入っているため、PGDG から 17 を入れたうえで **`/usr/lib/postgresql/17/bin` を
> PATH の先頭に入れる**こと。入れ忘れると `/usr/bin/pg_dump`（16系）が使われる。

- **世代管理は Git の履歴そのもの。** 「3日前の状態」は `git show HEAD~3:data.sql` で取り出せる。
  保存期間の上限が無いため、**賃金台帳の5年（当分の間3年）保存義務**にも対応できる。
- 内容に変更が無い日はコミットされない。実行の記録は GitHub の Actions のログに残る。
- **失敗すると GitHub からオーナー宛にメールが届く。** 届いたら放置しないこと。

### 実行結果の確認（管理画面の「操作ログ」）

GitHub を見に行かなくても、**管理画面の「操作ログ」に毎日の結果が残る**。

| 種別 | 意味 |
|---|---|
| `バックアップ`（グレー） | 正常終了。詳細に「コミット済み / 変更なし」とファイルサイズ |
| `バックアップ警告`（オレンジ） | 正常終了したが、**トークンの期限が30日以内**。§2.2 の再発行が必要 |
| `エラー`（赤） | 失敗。詳細にある Actions のURLでログを確認する |

記録はワークフローから `activity_logs` に直接 INSERT している（アプリ経由ではないため
`actor_name` は「自動バックアップ」固定）。**記録に失敗してもバックアップ自体は止めない**
（`continue-on-error`）。

## 2.2 バックアップ用トークンの再発行（有効期限が来たら）

`BACKUP_REPO_TOKEN` には有効期限がある（既定1年）。**切れるとバックアップが静かに止まる**ため、
以下のいずれかで気づけるようにしてある。

1. **管理画面の操作ログに `バックアップ警告`** が出る（残り30日から毎日）
2. GitHub の Actions 実行結果の Summary に警告が出る
3. GitHub 自身からも期限切れ予告のメールが届く

### 再発行の手順

1. https://github.com/settings/personal-access-tokens で古い `payroll-backup` を開く
   - **「Regenerate token」**があればそれが最短（権限設定を引き継げる）
   - 無ければ「Generate new token」で新規作成し、下記と同じ設定にする
2. 設定内容（新規作成の場合）
   - Token name: `payroll-backup`
   - Expiration: 1年
   - Repository access: **Only select repositories** → `oominami-payroll-backups` のみ
   - Permissions → Repository permissions → **Contents: Read and write**
   - 発行後、**表示されたトークンをコピー**する（**この画面を閉じると二度と見られない**）
3. https://github.com/richardx007/oominami-payroll/settings/secrets/actions を開き、
   **Repository secrets** にある下記の値を、取得したトークンで更新する（鉛筆アイコンから編集）

   | 名前 | 値 |
   |---|---|
   | `BACKUP_REPO_TOKEN` | 手順2でコピーしたトークン |

4. Actions から「Daily backup」を手動実行し、成功すること・操作ログの警告が消えることを確認

### 必要な Secrets（このリポジトリの Settings > Secrets and variables > Actions）

| 名前 | 値 |
|---|---|
| `SUPABASE_DB_PASSWORD` | Supabase のDBパスワード（**そのまま**。URLエンコード不要） |
| `BACKUP_REPO_TOKEN` | バックアップ先リポジトリへ push できる Personal Access Token |

接続文字列はワークフロー内で `DB_HOST` / `DB_PORT` / `DB_USER`（ファイル冒頭の `env`）と
パスワードから組み立てる。手で組み立てると失敗しやすいため機械的に作る。

> ⚠️ **Session pooler のユーザー名は `postgres.<project-ref>`。**
> ただし **`password authentication failed for user "postgres"` というエラーからは原因を判別できない。**
> Session pooler はプロジェクトを識別したあと内部では `postgres` として認証するため、
> ユーザー名を正しく送っていても文言は常に `user "postgres"` になる。
> このエラーが出たら、パスワード・ユーザー名・**接続URLを解析し直すツール（Supabase CLI）**の
> いずれかを疑うこと。ワークフローには接続テストのステップを入れてあるので、
> そこで通るかどうかで資格情報の問題かダンプ側の問題かを切り分けられる。
> また **直結（`db.<ref>.supabase.co`）は使えない**（GitHub Actions は IPv4 で、Supabase の
> 直結は IPv4 だと有料アドオンが必要）。**Transaction pooler（6543）では `pg_dump` が動かない**ため、
> 必ず **5432 の Session pooler** を使う。

---

## 3. データを復元する

```bash
# バックアップ取得
git clone https://github.com/richardx007/oominami-payroll-backups.git
cd oominami-payroll-backups
# 特定の日付に戻したい場合は git log で探して checkout する

# 新しい Supabase プロジェクトの接続文字列に対して流し込む
# 順序は必ず schema → auth_data → data。data.sql が auth.users を参照する外部キーを
# 持つため、auth_data.sql より先に data.sql を流すと外部キー制約違反で失敗する
# (2026-07-29 の復元テストで実際に発生・確認済み)。
psql "<新プロジェクトの接続文字列>" -f schema.sql
psql "<新プロジェクトの接続文字列>" -f auth_data.sql
psql "<新プロジェクトの接続文字列>" -f data.sql
```

`schema.sql` 実行時に出る以下のエラーは想定内(空のプロジェクトでも発生する)なので無視してよい。

- `schema "public" already exists`(新規プロジェクトには最初から `public` スキーマがあるため)
- `permission denied to change default privileges`(pooler接続ユーザーはスーパーユーザーではないため。Supabase側の既定権限で運用上は問題ない)

**復元後に必ず確認すること**

- 従業員がログインできる（auth.users が入っているか）
- 給与明細画面で過去の月度が正しく表示される
- QR打刻ができる（`app_settings` の `clock_*` が入っているか）

---

## 4. Supabase を作り直す場合の設定（Git に無い）

新しいプロジェクトを作ったら、以下を**手作業で**再設定する。

1. **Authentication > URL Configuration**
   - Site URL: 本番URL（例 `https://oominami-payroll.shinsekai.workers.dev`）
   - Redirect URLs: 同上（`/auth/callback` を含むパスが通ること）
2. **Authentication > Emails（最重要）**
   - **「Magic Link」「Reset password」「Confirm signup」の3つとも** `{{ .TokenHash }}` を使う
     リンクに書き換える。**1つでも既定のままだと認証が壊れる**
     （設計書§4／スキル `.claude/skills/supabase-invite-auth/` に詳細）
   - 「Confirm signup」は忘れやすく、初回招待だけが失敗する形で表面化する
3. **Authentication > SMTP Settings**: 自社Gmailのカスタム SMTP を設定
4. **Storage**: `work-rules` バケットを作成（`schema.sql` に含まれるが、**中のファイルは含まれない**）。
   勤務ルール文書は管理画面から再アップロードする
5. 新しい URL・キーを Cloudflare 側（`wrangler.jsonc` の vars）に反映する

---

## 5. Cloudflare を作り直す場合の設定（Git に無い）

1. Workers & Pages > Create > **Continue with GitHub**（画面表記が変わっており、以前の
   「Import a repository」に相当）で `richardx007/oominami-payroll` を接続
   - ビルド: `npx opennextjs-cloudflare build`
   - デプロイ: `npx opennextjs-cloudflare deploy`
2. デプロイ後、**Worker の Domains タブで Production の `*.workers.dev` トグルをオン**
   にしないと URL が有効にならない（既定はオフ）
3. **Secret（暗号化）** を登録: `GMAIL_APP_PASSWORD`
4. 環境変数は `wrangler.jsonc` の `vars` に入っているので自動で入る
5. デプロイ後、**Supabase の Site URL / Redirect URLs を新しいURLに合わせる**（§4-1）

---

## 6. パスワードマネージャに保管しておくもの

以下は**どこにも自動保存されていない**。人が保管する必要がある。

- Supabase の **DBパスワード**（プロジェクト作成時に設定するもの）
- Supabase の **service role key**（現在アプリでは未使用だが、復旧作業で必要になりうる）
- **Gmail のアプリパスワード**（`GMAIL_APP_PASSWORD`。再発行も可能）
- GitHub の **Personal Access Token**（バックアップ用。再発行も可能）
- Supabase / Cloudflare / GitHub の各アカウント情報

---

## 7. 定期的に確認すること

- [ ] **年1回**、バックアップから実際に復元できるか試す（無料プロジェクトをもう1つ作って流し込む）。
      **試していないバックアップは、あると思い込んでいるだけで存在しないのと同じ。**
      最終確認: 2026-07-29（`kqyziaynvueunqpwfrsx` に復元・全項目確認済み。§3の順序ミスをこの回で発見・修正）
- [ ] **年1回**、Cloudflare 側も別アカウントで実際にデプロイできるか試す。
      最終確認: 2026-07-29（別アカウント `oominami2026@gmail.com` で GitHub 連携 → デプロイ →
      ログイン画面表示まで確認済み。§5-2 の「workers.dev トグルは既定オフ」をこの回で発見・追記。
      メール送信機能は `GMAIL_APP_PASSWORD` を設定しなかったため未検証）
- [ ] バックアップの Actions が失敗していないか（失敗時はメールが届き、操作ログにも `エラー` が残る）
- [ ] 操作ログに `バックアップ警告` が出ていないか（トークンの期限が近い。§2.2 で再発行）
- [ ] Supabase の無料プロジェクトは **7日間アクセスが無いと一時停止**する。
      日常的に使っていれば問題ないが、長期休業時は注意

---

## 7.5 復元テスト用に残している環境（2026-07-29〜）

将来また使う可能性があるため、削除せずそのまま残してある。

| 用途 | 環境 |
|---|---|
| Supabase 復元先 | プロジェクト `kqyziaynvueunqpwfrsx`（DBパスワードはテスト後にリセット済み。使う際は要再発行） |
| Cloudflare デプロイ先 | 別アカウント `oominami2026@gmail.com`、Worker `oominami-payroll`（`oominami-payroll.oominami2026.workers.dev`） |

いずれも本番とは別の環境で、本番の Site URL / Redirect URLs 等は変更していない。

---

## 8. 既知の課題

- **`supabase/migrations/` は完全な履歴ではない。** 初期のセッションでダッシュボードから
  直接適用したぶんが記録に残っておらず、`initial_schema`（全テーブルのDDL）を含む複数が
  リポジトリに存在しない。**マイグレーションを順に流しても現在のスキーマは再現できない。**
  → 再構築には必ず**バックアップの `schema.sql`**（またはリポジトリの `supabase/schema.sql`）を使うこと。
- **`supabase/schema.sql` は 2026-07-28 時点のスナップショット**（バックアップから取り込んだ写し）。
  スキーマを変更したら、バックアップ側の最新の `schema.sql` をコピーして更新すること。
  自動更新はしていない（毎日コミットすると本番デプロイが毎日走ってしまうため）。
