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
//   3) まだ installing 中(update() 直後は waiting になる前にここに居ることが多い)なら、
//      installed になるのを待ってから同様に有効化する。これが無いと「1タップで確実」に
//      ならず、初回タップでは古い版のまま・2 回目でやっと更新…という取りこぼしが起きる。
//   4) 新 SW が無ければそのままリロード
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

      let reloaded = false
      const reloadOnce = () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      }
      // 待機 SW を有効化 → controllerchange で 1 回だけリロード(来ない端末向けに保険タイマー)
      const activate = (sw: ServiceWorker) => {
        navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true })
        window.setTimeout(reloadOnce, fallbackMs)
        sw.postMessage({ type: 'SKIP_WAITING' })
      }

      // 既に待機中の新 SW があれば即有効化
      const waiting = regs.find((r) => r.waiting)?.waiting
      if (waiting) {
        activate(waiting)
        return
      }

      // update() 直後は多くの場合まだ installing 中。installed(=待機)になったら有効化する。
      // これを待たずに素の reload() をすると新 SW が有効化されず「1 タップで更新できない」。
      const installing = regs.find((r) => r.installing)?.installing
      if (installing) {
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') activate(installing)
          else if (installing.state === 'redundant') reloadOnce() // 取り込み失敗時も一応リロード
        })
        // インストールが進まない/イベントが来ない端末向けの保険
        window.setTimeout(reloadOnce, fallbackMs)
        return
      }
    }
  } catch {
    /* 失敗してもリロードは行う */
  }
  window.location.reload()
}
