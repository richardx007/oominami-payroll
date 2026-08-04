import { describe, it, expect } from "vitest";
import {
  b64urlToBytes,
  bytesToB64url,
  encryptPayloadWith,
} from "./web-push";

describe("base64url", () => {
  it("往復して元に戻る", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect(b64urlToBytes(bytesToB64url(bytes))).toEqual(bytes);
  });

  it("URLに使えない文字(+ / =)を含まない", () => {
    // +/ が出やすいバイト列。base64url では -_ に置換され = は落ちる
    const s = bytesToB64url(new Uint8Array([251, 255, 190, 255]));
    expect(s).not.toMatch(/[+/=]/);
  });

  it("パディングが省略された文字列も復号できる", () => {
    // "AAA" は本来 "AAA=" だが、base64url ではパディングを省略する
    expect(b64urlToBytes("AAA")).toEqual(new Uint8Array([0, 0]));
  });
});

/**
 * RFC 8291 Section 5 の公式テストベクタ。
 * 本文暗号化(aes128gcm)は実装を誤っても通知が「届かない」だけで原因が掴めないため、
 * 既知の入力→既知の出力で固定しておく。乱数に依存する使い捨て鍵と salt は
 * テストベクタの値を注入する。
 */
describe("encryptPayloadWith(RFC 8291 テストベクタ)", () => {
  const PLAINTEXT = "When I grow up, I want to be a watermelon";
  const UA_PUBLIC =
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
  const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
  const AS_PUBLIC =
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
  const AS_PRIVATE = "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw";
  const SALT = "DGv6ra1nlYgDCS1FRnbzlw";
  const EXPECTED =
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";

  it("既知の入力から仕様どおりの本文を作る", async () => {
    const asPublicBytes = b64urlToBytes(AS_PUBLIC);
    const ephPrivate = await crypto.subtle.importKey(
      "jwk",
      {
        kty: "EC",
        crv: "P-256",
        x: bytesToB64url(asPublicBytes.slice(1, 33)),
        y: bytesToB64url(asPublicBytes.slice(33, 65)),
        d: AS_PRIVATE,
        ext: true,
      },
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"]
    );

    const body = await encryptPayloadWith(
      { endpoint: "https://example.com/p", p256dh: UA_PUBLIC, auth: AUTH },
      PLAINTEXT,
      ephPrivate,
      asPublicBytes,
      b64urlToBytes(SALT)
    );

    expect(bytesToB64url(body)).toBe(EXPECTED);
  });
});
