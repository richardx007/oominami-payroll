/**
 * 認証メール(初回登録・パスワード再設定)のリンク生成に使うサイトのオリジン。
 *
 * 以前はリクエストの Host / X-Forwarded-Host ヘッダーから組み立てていたが、
 * Host ヘッダーは詐称の余地があり、詐称された場合 token_hash 付きの認証リンクが
 * 攻撃者のドメインへ誘導されアカウント乗っ取りにつながるため、
 * 環境変数(NEXT_PUBLIC_SITE_URL)に固定する。
 */
export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL が未設定です。.env / wrangler.jsonc に本番URLを設定してください。"
    );
  }
  return url.replace(/\/+$/, "");
}
