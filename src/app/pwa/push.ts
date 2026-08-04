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

/**
 * 各段階にタイムアウトを付ける。
 * 🔴 `navigator.serviceWorker.ready` や `pushManager.subscribe()` は、うまくいかないとき
 *    **拒否されずに永久に保留される**ことがある(ボタンが「処理中...」のまま固まる)。
 *    どこで止まったかを利用者に伝えられるよう、段階名付きで必ず打ち切る。
 */
function withTimeout<T>(p: Promise<T>, ms: number, step: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`「${step}」で応答がありませんでした（${ms / 1000}秒待機）`)),
        ms
      )
    ),
  ]);
}

/**
 * Service Worker の登録を取り、有効化されるまで待つ。
 * `navigator.serviceWorker.ready` を使わないのは、登録が無い/失敗している場合に
 * **永久に解決しない**ため。ここでは自分で取得・登録し、状態を明示的に待つ。
 */
async function getActiveRegistration(): Promise<ServiceWorkerRegistration> {
  let reg = await withTimeout(
    navigator.serviceWorker.getRegistration(),
    10_000,
    "Service Workerの確認"
  );
  if (!reg) {
    reg = await withTimeout(
      navigator.serviceWorker.register("/sw.js"),
      15_000,
      "Service Workerの登録"
    );
  }
  if (reg.active) return reg;

  // まだ有効化されていない場合だけ待つ
  const worker = reg.installing ?? reg.waiting;
  if (!worker) {
    throw new Error(
      "Service Worker が有効になっていません。ページを再読み込みしてから、もう一度お試しください。"
    );
  }
  await withTimeout(
    new Promise<void>((resolve) => {
      const onChange = () => {
        if (worker.state === "activated" || reg!.active) {
          worker.removeEventListener("statechange", onChange);
          resolve();
        }
      };
      worker.addEventListener("statechange", onChange);
      onChange();
    }),
    15_000,
    "Service Workerの有効化"
  );
  return reg;
}

/** 現在この端末が購読済みかどうか */
export async function getSubscription(): Promise<PushSubscription | null> {
  if (!checkPushSupport().supported) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
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

  // 既に許可済みなら聞き直さない。古い Safari は Promise ではなくコールバック形式
  // (戻り値 undefined)のことがあるため、戻り値ではなく Notification.permission を見る。
  if (Notification.permission !== "granted") {
    await withTimeout(
      Promise.resolve(Notification.requestPermission()),
      60_000,
      "通知の許可"
    );
  }
  if (Notification.permission !== "granted") {
    throw new Error(
      "通知が許可されませんでした。端末の設定からこのアプリの通知を許可してください。"
    );
  }

  const reg = await getActiveRegistration();
  // 既に購読済みならそれを使う(再登録すると endpoint が変わり、古い購読が残る)
  const existing = await withTimeout(
    reg.pushManager.getSubscription(),
    10_000,
    "既存の購読の確認"
  );
  const sub =
    existing ??
    (await withTimeout(
      reg.pushManager.subscribe({
        // Chrome は必須。通知を出さない「サイレントプッシュ」を禁じる設定。
        userVisibleOnly: true,
        applicationServerKey: b64urlToBytes(vapidPublicKey) as BufferSource,
      }),
      20_000,
      "購読の作成"
    ));

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
  const sub = await withTimeout(getSubscription(), 10_000, "購読の確認");
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await withTimeout(sub.unsubscribe(), 10_000, "購読の解除");
  return endpoint;
}
