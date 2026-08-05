"use client";

import { useEffect, useState, useTransition } from "react";
import {
  updateOwnProfile,
  saveMyPushSubscription,
  deleteMyPushSubscription,
  updateNotifyTypeSettings,
} from "./actions";
import {
  checkPushSupport,
  getSubscription,
  subscribeThisDevice,
  unsubscribeThisDevice,
} from "@/app/pwa/push";
import type { ActionResult } from "../admin/employees/actions";

/**
 * アカウント設定画面の本体(管理者・従業員共通)。
 * 管理者・従業員それぞれの `account/page.tsx` から呼ぶ。
 * 管理者だけに見せる項目(出退勤の通知種類別スイッチ)は `isAdmin` で出し分ける。
 */
export function AccountSettingsView({
  name,
  nickname,
  furigana,
  isAdmin,
  vapidPublicKey,
  registeredEndpoints,
  notifyInEnabled,
  notifyOutEnabled,
}: {
  name: string;
  nickname: string | null;
  furigana: string | null;
  isAdmin: boolean;
  vapidPublicKey: string | null;
  /** サーバー側に登録済みの購読エンドポイント(この本人の分) */
  registeredEndpoints: string[];
  /** 管理者のみ使用。出勤/退勤それぞれの通知スイッチの現在値 */
  notifyInEnabled?: boolean;
  notifyOutEnabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <ProfileForm name={name} nickname={nickname} furigana={furigana} />
      <DeviceNotificationSection
        vapidPublicKey={vapidPublicKey}
        registeredEndpoints={registeredEndpoints}
      />
      {isAdmin && (
        <NotifyTypeForm
          notifyInEnabled={notifyInEnabled ?? true}
          notifyOutEnabled={notifyOutEnabled ?? true}
        />
      )}
    </div>
  );
}

/** ニックネーム・氏名・ふりがなの編集フォーム */
function ProfileForm({
  name,
  nickname,
  furigana,
}: {
  name: string;
  nickname: string | null;
  furigana: string | null;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">プロフィール</h2>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateOwnProfile(fd)))
        }
        className="mt-4 max-w-sm space-y-3"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            ニックネーム
          </label>
          <input
            name="nickname"
            defaultValue={nickname ?? ""}
            placeholder="未設定の場合は氏名が表示されます"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            氏名
          </label>
          <input
            name="name"
            required
            defaultValue={name}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            ふりがな
          </label>
          <input
            name="furigana"
            defaultValue={furigana ?? ""}
            placeholder="かな推奨・任意"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}

/**
 * この端末を通知先として登録/解除するボタン(管理者・従業員共通)。
 * 現時点で従業員向けの通知は無いが、今後の準備として全員に見せる。
 * ロジックは admin/settings/ui.tsx の旧 NotifySettingsForm と同じ(2026-08-06にこちらへ移動)。
 */
function DeviceNotificationSection({
  vapidPublicKey,
  registeredEndpoints,
}: {
  vapidPublicKey: string | null;
  registeredEndpoints: string[];
}) {
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [unsupported, setUnsupported] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceMsg, setDeviceMsg] = useState<ActionResult | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    const support = checkPushSupport();
    if (!support.supported) {
      setUnsupported(support.reason);
      setDeviceOn(false);
      return;
    }
    setPermission(Notification.permission);
    // 🔴 「登録済み」はブラウザ側の購読だけでは判定できない。サーバー保存が独立して
    //    失敗しうるため、サーバー側の一覧と突き合わせ、食い違っていれば登録し直す。
    getSubscription()
      .then(async (sub) => {
        if (!sub) {
          setDeviceOn(false);
          return;
        }
        if (registeredEndpoints.includes(sub.endpoint)) {
          setDeviceOn(true);
          return;
        }
        const json = sub.toJSON();
        if (!json.keys?.p256dh || !json.keys?.auth) {
          setDeviceOn(false);
          return;
        }
        const res = await saveMyPushSubscription({
          endpoint: sub.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
          userAgent: navigator.userAgent,
        });
        setDeviceOn(res.ok);
        if (!res.ok) {
          setDeviceMsg({
            ok: false,
            message:
              "この端末の登録がサーバーに残っていません。「この端末で通知を受け取る」を押し直してください。",
          });
        }
      })
      .catch(() => setDeviceOn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDevice() {
    if (!vapidPublicKey) {
      setDeviceMsg({
        ok: false,
        message: "通知用の鍵が未設定のため登録できません。管理者にご確認ください。",
      });
      return;
    }
    setDeviceBusy(true);
    setDeviceMsg(null);
    try {
      if (deviceOn) {
        const endpoint = await unsubscribeThisDevice();
        if (endpoint) setDeviceMsg(await deleteMyPushSubscription(endpoint));
        setDeviceOn(false);
      } else {
        const sub = await subscribeThisDevice(vapidPublicKey);
        const saved = await Promise.race([
          saveMyPushSubscription({ ...sub, userAgent: navigator.userAgent }),
          new Promise<ActionResult>((_, reject) =>
            setTimeout(
              () => reject(new Error("サーバーへの登録が完了しませんでした（20秒待機）")),
              20_000
            )
          ),
        ]);
        setDeviceMsg(saved);
        setDeviceOn(saved.ok);
      }
    } catch (e) {
      const raw = e instanceof Error ? e.message : "処理に失敗しました";
      const stale = /Server Action|failed-to-find-server-action/i.test(raw);
      setDeviceMsg({
        ok: false,
        message: stale
          ? "アプリが更新されています。ページを再読み込みしてから、もう一度お試しください。"
          : raw,
      });
    } finally {
      if (typeof Notification !== "undefined") setPermission(Notification.permission);
      setDeviceBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">通知</h2>
      <p className="mt-1 text-sm text-gray-500">
        通知は端末ごとに許可が必要です。受け取りたい端末それぞれで登録してください。
      </p>

      {permission === "denied" && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">
            この端末では通知が「拒否」に設定されているため、登録できません。
          </p>
          <p className="mt-2">
            下記の設定で通知を許可したあと、
            <span className="font-medium">このページを再読み込み</span>してから
            もう一度お試しください。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <span className="font-medium">Mac</span>: システム設定 → 通知 →
              （ブラウザ名／このアプリ）→「通知を許可」をオン
            </li>
            <li>
              <span className="font-medium">Safari</span>: 設定 → Webサイト → 通知 →
              このサイトを「許可」
            </li>
            <li>
              <span className="font-medium">Chrome</span>: アドレスバー左の鍵アイコン →
              通知 → 「許可」
            </li>
            <li>
              <span className="font-medium">iPhone / iPad</span>: 設定 → 通知 →
              ホーム画面に追加したこのアプリ →「通知を許可」をオン
            </li>
          </ul>
        </div>
      )}

      {permission === "default" && (
        <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          ボタンを押すと通知の許可を求めるダイアログが出ます。「許可」を選んでください。
          Mac では、先に「システム設定 → 通知」でブラウザ（またはこのアプリ）の
          通知がオンになっている必要があります。
        </p>
      )}

      {unsupported ? (
        <p className="mt-3 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-800">
          {unsupported}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={toggleDevice}
            disabled={deviceBusy || deviceOn === null}
            className={`rounded-lg px-6 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              deviceOn ? "bg-gray-500 hover:bg-gray-600" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {deviceBusy
              ? "処理中..."
              : deviceOn === null
                ? "確認中..."
                : deviceOn
                  ? "この端末への通知を解除する"
                  : "この端末で通知を受け取る"}
          </button>
          <span className="text-sm text-gray-500">
            {deviceOn === null ? "" : deviceOn ? "登録済み" : "未登録"}
          </span>
        </div>
      )}

      {deviceMsg && (
        <p className={`mt-2 text-sm ${deviceMsg.ok ? "text-green-700" : "text-red-600"}`}>
          {deviceMsg.message}
        </p>
      )}

      {!vapidPublicKey && (
        <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          通知用の鍵（VAPID）が未設定のため、通知は動作しません。
        </p>
      )}
    </section>
  );
}

/** 未打刻の出勤/退勤それぞれのスイッチ(管理者のみ) */
function NotifyTypeForm({
  notifyInEnabled,
  notifyOutEnabled,
}: {
  notifyInEnabled: boolean;
  notifyOutEnabled: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="border-l-4 border-blue-600 pl-2 font-semibold">
        未打刻通知（管理者向け）
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        シフトの出勤予定時刻を5分、退勤予定時刻を30分過ぎても打刻が無い場合に通知します。
        同じ人・同じ日・同じ種別につき通知は1回だけです。種類ごとに個別にオン/オフできます。
      </p>
      <form
        action={(fd) =>
          startTransition(async () => setResult(await updateNotifyTypeSettings(fd)))
        }
        className="mt-4 space-y-2"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="notify_missing_punch_in"
            defaultChecked={notifyInEnabled}
            className="h-4 w-4 rounded border-gray-300"
          />
          出勤の未打刻を通知する
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="notify_missing_punch_out"
            defaultChecked={notifyOutEnabled}
            className="h-4 w-4 rounded border-gray-300"
          />
          退勤の未打刻を通知する
        </label>
        {result && (
          <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>
            {result.message}
          </p>
        )}
        <button
          disabled={pending}
          className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "保存中..." : "保存する"}
        </button>
      </form>
    </section>
  );
}
