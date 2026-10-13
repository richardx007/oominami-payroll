"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { parseClockQr } from "@/lib/clock-qr";
import { ClockOpening } from "@/app/RootLoading";

/**
 * ヘッダー中央のカメラボタン＋アプリ内のQR読み取り(2026-10-13 オーナー依頼)。
 *
 * iPhone の標準カメラで出退勤QRを読むと Safari で開いてしまい、ホーム画面アプリ(PWA)へは
 * 移れない(iOS にその仕組みが無い。docs/design.md §7.6「打刻完了画面のPWA誘導」参照)。
 * そこでアプリの中でQRを読み取り、打刻画面までアプリ内で完結させる。
 * 読み取った内容が自サイトの /clock?type=in|out のときだけ打刻画面へ進む(それ以外は無視して読み取りを続ける)。
 * 打刻後に元の画面へ戻れるよう、メニューから開いた場合と同じく from に現在のパスを付ける。
 */
export function QrScanButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="出退勤のQRコードを読み取る"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white active:opacity-70"
      >
        <CameraIcon className="h-6 w-6" />
      </button>
      {open && <QrScanner onClose={() => setOpen(false)} />}
    </>
  );
}

function QrScanner({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // 読み取れたら打刻画面へ進む。画面が切り替わるまで、打刻画面の読み込み中表示と同じ見た目を出し続ける
  // (ここで閉じると元の画面が一瞬見えてチラつくため。ヘッダーごと入れ替わる時点で自然に消える)
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    let lastScan = 0;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    function stop() {
      stopped = true;
      cancelAnimationFrame(raf);
      clearTimeout(hintTimer);
      stream?.getTracks().forEach((t) => t.stop());
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("この端末・ブラウザではカメラを使えません。");
        return;
      }
      // jsQR は読み取り画面を開いたときだけ読み込む(全画面の初期表示を重くしない)
      const [{ default: jsQR }, media] = await Promise.all([
        import("jsqr"),
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: "environment" }, audio: false })
          .catch(() => null),
      ]);
      if (stopped) {
        media?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!media) {
        setError(
          "カメラを起動できませんでした。カメラの使用が許可されているか、端末の設定をご確認ください。"
        );
        return;
      }
      stream = media;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = media;
      await video.play().catch(() => {});

      const tick = (t: number) => {
        if (stopped) return;
        raf = requestAnimationFrame(tick);
        // 毎フレーム解析すると重いので 0.2 秒ごと
        if (t - lastScan < 200 || !ctx || video.readyState < 2) return;
        lastScan = t;
        // 解析は縮小して行う(QRはポスター上で十分大きいので精度は落ちない)
        const scale = Math.min(1, 640 / video.videoWidth);
        const w = Math.round(video.videoWidth * scale);
        const h = Math.round(video.videoHeight * scale);
        if (!w || !h) return;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, {
          inversionAttempts: "dontInvert",
        });
        if (!code) return;
        const type = parseClockQr(code.data, window.location.origin);
        if (type) {
          stop();
          setOpening(true);
          router.push(`/clock?type=${type}&from=${encodeURIComponent(pathname)}`);
        } else {
          setHint("出退勤のQRコードではありません。");
          clearTimeout(hintTimer);
          hintTimer = setTimeout(() => setHint(null), 2000);
        }
      };
      raf = requestAnimationFrame(tick);
    }

    start();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (opening) return <ClockOpening />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* 読み取り枠(目安) */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="aspect-square w-2/3 max-w-xs rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 px-4 pt-[calc(1rem+env(safe-area-inset-top))] text-center">
          <p className="text-lg font-bold">出退勤のQRコードを読み取る</p>
          <p className="mt-1 text-sm text-white/80">
            出勤・退勤どちらか一方のQRコードを枠に合わせてください
          </p>
        </div>
        {(error || hint) && (
          <div className="absolute inset-x-4 bottom-6 mx-auto max-w-sm rounded-xl bg-white px-4 py-3 text-center text-sm text-gray-800">
            {error ?? hint}
          </div>
        )}
      </div>
      <div className="shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onClose}
          className="mx-auto block w-full max-w-sm rounded-xl border border-white/40 py-3 text-base font-medium text-white active:opacity-70"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
