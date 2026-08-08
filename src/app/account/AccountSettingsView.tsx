"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
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
  notifyFirstLoginEnabled,
}: {
  name: string;
  nickname: string | null;
  furigana: string | null;
  isAdmin: boolean;
  vapidPublicKey: string | null;
  /** サーバー側に登録済みの購読エンドポイント(この本人の分) */
  registeredEndpoints: string[];
  /** 管理者のみ使用。出勤/退勤・初回ログインそれぞれの通知スイッチの現在値 */
  notifyInEnabled?: boolean;
  notifyOutEnabled?: boolean;
  notifyFirstLoginEnabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <ProfileForm name={name} nickname={nickname} furigana={furigana} />
      <DeviceNotificationSection
        vapidPublicKey={vapidPublicKey}
        registeredEndpoints={registeredEndpoints}
        notifyTypeSection={
          isAdmin ? (
            <NotifyTypeForm
              notifyInEnabled={notifyInEnabled ?? true}
              notifyOutEnabled={notifyOutEnabled ?? true}
              notifyFirstLoginEnabled={notifyFirstLoginEnabled ?? true}
            />
          ) : null
        }
      />
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
  notifyTypeSection,
}: {
  vapidPublicKey: string | null;
  registeredEndpoints: string[];
  /** 管理者のみ。「通知」枠の内側にネストして表示する通知対象スイッチ */
  notifyTypeSection?: ReactNode;
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
        // 🔴 これは画面を開いた時に裏で自動的に行う突き合わせ(本人の操作ではない)。
        // 初回訪問(まだ一度も登録していない)でも通りうる経路なので、ここで赤いエラーを
        // 出すと「初回は未登録で当然なのに」不安を煽ってしまう(実際にオーナー報告あり)。
        // 失敗時は静かに「未登録」の表示に倒し、原因追跡用に console にだけ残す。
        // ユーザーが実際にボタンを押した(toggleDevice)ときの失敗は、そちらで表示する。
        if (!res.ok) {
          console.warn("[account] 通知購読の自動突き合わせに失敗:", res.message);
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

      {notifyTypeSection}
    </section>
  );
}

/** 通知対象(未打刻の出勤/退勤・初回ログイン)それぞれのスイッチ(管理者のみ)。
 * 「通知」枠の内側にネストして表示する(端末の通知許可が親、対象の選別が子という
 * 親子関係のため)。
 */
function NotifyTypeForm({
  notifyInEnabled,
  notifyOutEnabled,
  notifyFirstLoginEnabled,
}: {
  notifyInEnabled: boolean;
  notifyOutEnabled: boolean;
  notifyFirstLoginEnabled: boolean;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="font-semibold text-gray-800">通知対象（管理者向け）</h3>
      <p className="mt-1 text-sm text-gray-500">種類ごとに個別にオン/オフできます。</p>
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
          <span className="font-normal text-gray-500">
            （シフトの出勤予定時刻を5分過ぎても打刻が無い場合に通知）
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="notify_missing_punch_out"
            defaultChecked={notifyOutEnabled}
            className="h-4 w-4 rounded border-gray-300"
          />
          退勤の未打刻を通知する
          <span className="font-normal text-gray-500">
            （シフトの退勤予定時刻を30分過ぎても打刻が無い場合に通知）
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            name="notify_first_login"
            defaultChecked={notifyFirstLoginEnabled}
            className="h-4 w-4 rounded border-gray-300"
          />
          新規従業員の初回ログイン
          <span className="font-normal text-gray-500">
            （初回パスワード設定の完了時に通知）
          </span>
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
    </div>
  );
}
