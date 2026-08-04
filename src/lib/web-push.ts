/**
 * Web Push の送信(VAPID + RFC 8291 aes128gcm)。
 *
 * なぜ自前実装か:
 *   npm の `web-push` は Node の crypto/https に依存しており、Cloudflare Workers 上では
 *   動作が保証されない。ここで使うのは Web Crypto API(`crypto.subtle`)だけなので、
 *   Workers でもブラウザでも同じコードで動く。処理はすべてネイティブ実装なので
 *   無料プランの CPU 制限(10ms)でも数件の送信なら収まる。
 *
 * 仕様の出典:
 *   - RFC 8291 Message Encryption for Web Push
 *   - RFC 8292 VAPID (Voluntary Application Server Identification)
 */

export type PushSubscriptionInfo = {
  endpoint: string;
  /** ブラウザの公開鍵(base64url, 65バイトの非圧縮P-256点) */
  p256dh: string;
  /** 認証シークレット(base64url, 16バイト) */
  auth: string;
};

export type VapidKeys = {
  /** base64url, 65バイト(0x04 || X || Y) */
  publicKey: string;
  /** base64url, 32バイト(秘密スカラー d) */
  privateKey: string;
  /** VAPID の sub。mailto: か https: のURL */
  subject: string;
};

// ---------------------------------------------------------------------------
// base64url ヘルパー
// ---------------------------------------------------------------------------

export function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  // padding は base64url では省略されるので補う
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

/** ArrayBuffer 由来の型ゆらぎを吸収して Uint8Array<ArrayBuffer> に揃える */
function u8(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

// ---------------------------------------------------------------------------
// HKDF(RFC 5869)。Web Push が使うのは SHA-256 で L<=32 の範囲のみ。
// ---------------------------------------------------------------------------

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return u8(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}

/** HKDF-Expand の1ブロック目だけを取り出す(length <= 32 前提) */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm);
  const okm = await hmac(prk, concat(info, new Uint8Array([1])));
  return okm.slice(0, length);
}

// ---------------------------------------------------------------------------
// VAPID: ES256 の JWT を作り Authorization ヘッダーにする
// ---------------------------------------------------------------------------

async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64urlToBytes(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 0x04) {
    throw new Error("VAPID公開鍵の形式が不正です(65バイトの非圧縮P-256点が必要)");
  }
  // Web Crypto に秘密鍵を渡すには JWK が必要。x/y は公開鍵から切り出す。
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: keys.privateKey,
    ext: true,
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function vapidAuthHeader(
  endpoint: string,
  keys: VapidKeys
): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = bytesToB64url(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToB64url(
    utf8(
      JSON.stringify({
        aud,
        // 有効期限は12時間。RFC 8292 は最大24時間を推奨。
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      })
    )
  );
  const signingInput = `${header}.${payload}`;
  const key = await importVapidPrivateKey(keys);
  // ECDSA の署名は Web Crypto では既に r||s の生形式で返る(JWT が求める形と同じ)
  const sig = u8(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      utf8(signingInput) as BufferSource
    )
  );
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${keys.publicKey}`;
}

// ---------------------------------------------------------------------------
// 本文の暗号化(RFC 8291, Content-Encoding: aes128gcm)
// ---------------------------------------------------------------------------

/**
 * 使い捨て鍵と salt を外から渡せる形の暗号化本体。
 * 通常は encryptPayload() から呼ぶ。RFC 8291 のテストベクタで検証できるように、
 * 乱数に依存する2つ(鍵ペア・salt)だけを注入可能にしてある。
 */
export async function encryptPayloadWith(
  sub: PushSubscriptionInfo,
  plaintext: string,
  ephPrivate: CryptoKey,
  asPublic: Uint8Array,
  salt: Uint8Array
): Promise<Uint8Array> {
  const uaPublic = b64urlToBytes(sub.p256dh);
  const authSecret = b64urlToBytes(sub.auth);

  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const shared = u8(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephPrivate, 256)
  );

  // IKM: 共有秘密を auth_secret と両者の公開鍵で混ぜる
  const keyInfo = concat(
    utf8("WebPush: info"),
    new Uint8Array([0]),
    uaPublic,
    asPublic
  );
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);

  const cek = await hkdf(
    salt,
    ikm,
    concat(utf8("Content-Encoding: aes128gcm"), new Uint8Array([0])),
    16
  );
  const nonce = await hkdf(
    salt,
    ikm,
    concat(utf8("Content-Encoding: nonce"), new Uint8Array([0])),
    12
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  // 0x02 は「これが最終レコード」を表すパディング区切り
  const padded = concat(utf8(plaintext), new Uint8Array([2]));
  const ciphertext = u8(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce as BufferSource },
      aesKey,
      padded as BufferSource
    )
  );

  // ヘッダー: salt(16) || レコードサイズ(4, ビッグエンディアン) || 鍵長(1) || 送信側公開鍵(65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** 使い捨て鍵と salt を毎回新しく作って暗号化する(実運用の入口) */
async function encryptPayload(
  sub: PushSubscriptionInfo,
  plaintext: string
): Promise<Uint8Array> {
  // 送信のたびに使い捨ての鍵ペアを作る(RFC 8291 の要件)
  const eph = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;
  const asPublic = u8(await crypto.subtle.exportKey("raw", eph.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return encryptPayloadWith(sub, plaintext, eph.privateKey, asPublic, salt);
}

// ---------------------------------------------------------------------------
// 送信
// ---------------------------------------------------------------------------

export type SendResult = {
  endpoint: string;
  ok: boolean;
  status: number;
  /** 購読が失効している(404/410)。呼び出し側で削除してよい合図。 */
  expired: boolean;
};

/**
 * 1件の購読へ通知を送る。
 * 例外は投げず、結果を返す(1端末の失敗で他の端末への送信を止めないため)。
 */
export async function sendPush(
  sub: PushSubscriptionInfo,
  payload: string,
  keys: VapidKeys,
  ttlSeconds = 3600
): Promise<SendResult> {
  try {
    const body = await encryptPayload(sub, payload);
    const auth = await vapidAuthHeader(sub.endpoint, keys);
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(ttlSeconds),
        Urgency: "high",
      },
      body: body as BodyInit,
    });
    return {
      endpoint: sub.endpoint,
      ok: res.ok,
      status: res.status,
      expired: res.status === 404 || res.status === 410,
    };
  } catch {
    return { endpoint: sub.endpoint, ok: false, status: 0, expired: false };
  }
}
