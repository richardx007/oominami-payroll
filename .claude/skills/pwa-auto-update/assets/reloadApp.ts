// reloadApp — ロゴタップなど任意のボタンから呼ぶ「アプリ最新化」処理。
//
// 単純な location.reload() だと、待機中の新しい Service Worker(SW) は有効化されず
// 古い版のままになる。逆に「update() 直後に即 reload()」すると、新 SW のインストール中に
// リロードが割り込んで新旧アセットの取り違えが起き、画面が真っ暗になることがある(特に iOS/iPadOS)。
//
// そこでこの関数は:
//   1) 全 registration に update() を投げて新版の有無を確認
//   2) 待機中(waiting)の新 SW があれば SKIP_WAITING で正しく有効化し、
//      切替完了(controllerchange)を待ってから 1 回だけリロード(来ない端末向けに保険タイマー)
//   3) 待機 SW が無ければそのままリロード
//
// 生成 SW 側は「SKIP_WAITING メッセージで self.skipWaiting()」する必要がある。
// Serwist(skipWaiting:false)の addEventListeners() はこの SKIP_WAITING ハンドラを含む
// (ReloadPrompt バナーの更新経路と同一)。
//
// フレームワーク非依存(navigator.serviceWorker のみに依存)なので Next.js でもそのまま使える。

export interface ReloadAppOptions {
  /** controllerchange が来ない端末向けの保険リロード時間(ms)。既定 3000。 */
  fallbackMs?: number
}

export async function reloadApp(options: ReloadAppOptions = {}): Promise<void> {
  const { fallbackMs = 3000 } = options
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      // オフライン時などの update() 失敗は無視(この後リロードするため)
      await Promise.all(regs.map((r) => r.update().catch(() => {})))
      const waiting = regs.find((r) => r.waiting)?.waiting
      if (waiting) {
        let reloaded = false
        const reloadOnce = () => {
          if (reloaded) return
          reloaded = true
          window.location.reload()
        }
        navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true })
        // controllerchange が発火しない環境でも確実に更新するための保険
        window.setTimeout(reloadOnce, fallbackMs)
        waiting.postMessage({ type: 'SKIP_WAITING' })
        return
      }
    }
  } catch {
    /* 失敗してもリロードは行う */
  }
  window.location.reload()
}
