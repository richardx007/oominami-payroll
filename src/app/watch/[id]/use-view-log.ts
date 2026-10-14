"use client";

import { useEffect, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { playedDelta, VIEW_PROGRESS_RPC, VIEW_SEND_INTERVAL_MS, VIEW_START_RPC } from "@/lib/guide-views";

/**
 * 視聴履歴を残す(lib/guide-views.ts)。画面を開いたら1行記録し、実際に再生した秒数を
 * 10秒ごと・一時停止・再生の終わり・画面を隠したとき・閉じたときに送る。記録に失敗しても再生には影響させない。
 */
export function useViewLog(guideId: string, videoRef: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const supabase = createClient();
    let viewId: string | null = null;
    let watched = 0;
    let sent = 0;
    let last: number | null = null;
    let closed = false;

    const send = () => {
      if (!viewId || watched - sent < 0.1) return;
      sent = watched;
      const duration = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : null;
      void supabase.rpc(VIEW_PROGRESS_RPC, { p_view_id: viewId, p_watched_sec: Math.round(watched * 10) / 10, p_duration_sec: duration });
    };
    void supabase.rpc(VIEW_START_RPC, { p_guide_id: guideId }).then(({ data }) => {
      viewId = typeof data === "string" ? data : null;
      if (closed) send();
    });

    const onTime = () => {
      if (!v.seeking) watched += playedDelta(last, v.currentTime);
      last = v.currentTime;
    };
    const onJump = () => {
      last = v.currentTime;
    };
    const onStop = () => {
      onTime();
      send();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };
    const timer = window.setInterval(send, VIEW_SEND_INTERVAL_MS);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onJump);
    v.addEventListener("seeked", onJump);
    v.addEventListener("pause", onStop);
    v.addEventListener("ended", onStop);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", send);
    return () => {
      closed = true;
      window.clearInterval(timer);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onJump);
      v.removeEventListener("seeked", onJump);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("ended", onStop);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", send);
      send();
    };
  }, [guideId, videoRef]);
}
