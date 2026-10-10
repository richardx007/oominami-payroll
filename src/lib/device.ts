/**
 * 端末承認制(アクセスの厳格化)のための端末識別。middleware(Edge)から使うため Node 専用 API は使わない。
 *
 * - 端末ごとのランダムな合言葉を httpOnly Cookie(DEVICE_TOKEN_COOKIE)に持たせる。
 *   DB(trusted_devices)にはそのハッシュだけが入る(関数 device_register が計算する)。
 * - DEVICE_SESSION_COOKIE は「このログイン(session_id)はもう登録した」という目印。
 *   これがあるうちは device_register を呼ばない(ログインごとに1回だけ問い合わせる)。
 *
 * 仕組みの全体は supabase/migrations/20261010120000_trusted_devices.sql と設計書§21 を参照。
 * ⚠️ 経費管理(oominami-business)にも同じファイルがある。変えるときは両方そろえること。
 */

import { parseUserAgent } from "./client-info";

export const DEVICE_TOKEN_COOKIE = "oom_dvt";
export const DEVICE_SESSION_COOKIE = "oom_dvs";

/** 合言葉 Cookie の有効期限(秒)。Chrome の上限(400日)に合わせる */
export const DEVICE_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** 登録済みの目印の有効期限(秒)。切れたらもう一度登録し、端末一覧の「最終利用」を更新する(1日1回) */
export const DEVICE_SESSION_COOKIE_MAX_AGE = 24 * 60 * 60;

/**
 * 合言葉を新しく作ってよいリクエストか。画面そのもの(document)の読み込みのときだけ作る。
 * 画面を開くと裏で同時に何本もリクエストが走るため、どれでも作ると合言葉が2つできて
 * 同じ端末が2行になる(2026-10-11 に発生)。Sec-Fetch-Dest の無い古いブラウザは作ってよいことにする。
 */
export function canIssueDeviceToken(secFetchDest: string | null): boolean {
  return secFetchDest === null || secFetchDest === "document";
}

/** 端末の合言葉(32バイトの乱数を base64url で43文字) */
export function newDeviceToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * アクセストークン(JWT)から session_id を取り出す。署名は確かめない
 * (「登録済みか」の目印に使うだけで、承認の判定は DB 側が検証済みの JWT で行うため)。
 */
export function sessionIdFromAccessToken(token: string | undefined): string | null {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const sid = (JSON.parse(json) as { session_id?: unknown }).session_id;
    return typeof sid === "string" && sid ? sid : null;
  } catch {
    return null;
  }
}

/** 管理画面の端末一覧に出す名前(例: "iPhone / iOS 18.5 / Safari 18") */
export function deviceLabel(userAgent: string | null): string {
  const { device, os, browser } = parseUserAgent(userAgent ?? "");
  return [device, os, browser].join(" / ");
}
