/**
 * この端末を Web Push の通知先として登録/解除する処理(ブラウザ側)。
 *
 * 「通知を有効にするか」の全体スイッチは設定画面(app_settings)にあるが、
 * 実際に通知が届くかは**端末ごとの購読**が要る。OSの通知許可はページからしか
 * 求められないため、管理者が自分の端末それぞれで1回登録する必要がある。
 */

import { b64urlToBytes } from "@/lib/web-push";

export type PushSupport =
  | { supported: true }
  | { supported: false; reason: string };

/** この端末で Web Push が使えるかを判定する(使えない理由も返す) */
export function checkPushSupport(): PushSupport {
  if (typeof window === "undefined") return { supported: false, reason: "" };
  if (!("serviceWorker" in navigator)) {
    return { supported: false, reason: "この端末は Service Worker に対応していません。" };
  }
  if (!("PushManager" in window) || !("Notification" in window)) {
    // iOS はホーム画面に追加した PWA でのみ Push が使える(Safari のタブでは不可)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    return {
      supported: false,
      reason: isIOS
        ? "iPhone/iPad では、ホーム画面に追加したアプリから開いた場合のみ通知を利用できます。ホーム画面のアイコンから開き直してください。"
        : "この端末/ブラウザは通知に対応していません。",
    };
  }
  return { supported: true };
}

/** 現在この端末が購読済みかどうか */
export async function getSubscription(): Promise<PushSubscription | null> {
  if (!checkPushSupport().supported) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

/**
 * この端末を通知先として登録する。
 * 通知許可のダイアログはここで出る(ユーザー操作の直後に呼ぶこと。
 * そうしないとブラウザが要求を無視する)。
 */
export async function subscribeThisDevice(
  vapidPublicKey: string
): Promise<{ endpoint: string; p256dh: string; auth: string }> {
  const support = checkPushSupport();
  if (!support.supported) throw new Error(support.reason);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      "通知が許可されませんでした。端末の設定からこのアプリの通知を許可してください。"
    );
  }

  const reg = await navigator.serviceWorker.ready;
  // 既に購読済みならそれを使う(再登録すると endpoint が変わり、古い購読が残る)
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      // Chrome は必須。通知を出さない「サイレントプッシュ」を禁じる設定。
      userVisibleOnly: true,
      applicationServerKey: b64urlToBytes(vapidPublicKey) as BufferSource,
    }));

  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error("購読情報の取得に失敗しました。");
  }
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

/** この端末の購読を解除する。解除した endpoint を返す(サーバー側の削除に使う) */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const sub = await getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}
