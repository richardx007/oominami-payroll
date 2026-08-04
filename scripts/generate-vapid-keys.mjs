// Web Push で使う VAPID 鍵ペアを生成する。
//
// 使い方: node scripts/generate-vapid-keys.mjs
//
// 出力された2つの値を Cloudflare に登録する:
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY … 公開鍵。ブラウザにも渡るので wrangler.jsonc の vars でよい。
//   VAPID_PRIVATE_KEY            … 秘密鍵。**必ず Secret(暗号化)として登録すること。**
//
// 鍵は一度作ったら変更しないこと。変更すると既存の購読がすべて無効になり、
// 各端末で登録し直しになる。
import { generateKeyPairSync, createPublicKey } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64url");

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });

// JWK にすると x/y/d がそのまま base64url で得られる
const jwk = privateKey.export({ format: "jwk" });
const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });

// 公開鍵は非圧縮点(0x04 || X || Y)の65バイトで渡す必要がある
const x = Buffer.from(publicJwk.x, "base64url");
const y = Buffer.from(publicJwk.y, "base64url");
const publicKey = b64url(Buffer.concat([Buffer.from([0x04]), x, y]));

console.log("");
console.log("=== VAPID 鍵を生成しました（この2つを Cloudflare に登録してください）===");
console.log("");
console.log("NEXT_PUBLIC_VAPID_PUBLIC_KEY (公開鍵・Variable でよい):");
console.log(publicKey);
console.log("");
console.log("VAPID_PRIVATE_KEY (秘密鍵・必ず Secret として登録):");
console.log(jwk.d);
console.log("");
console.log("※ この画面を閉じると秘密鍵は二度と表示されません。先に登録してください。");
console.log("");
