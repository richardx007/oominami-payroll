// pwaRecovery — 更新直後の「真っ暗/白い空白画面」からの自動復帰。
//
// 更新直後は新旧の JS チャンク/SW の切替タイミングがズレ、メイン JS や遅延チャンクの
// 読み込みに失敗して React が描画されない瞬間がある(iOS/iPadOS で起きやすい)。
// このモジュールと、index.html 側の「起動ウォッチドッグ」(snippets/index.html 参照)を
// 組み合わせることで、固まった状態から 1 回だけ自動リロードして立て直す。
//
// 使い方(エントリ = main.tsx):
//   import { installPwaRecovery, markAppMounted } from './pwaRecovery'
//   installPwaRecovery()              // createRoot より前に 1 回
//   createRoot(el).render(<App />)
//   // App 側の初回 useEffect で markAppMounted() を呼ぶ(下の markAppMounted 説明参照)

/**
 * 遅延読み込み(dynamic import)のチャンク取得失敗を捕捉し、1 回だけ復帰リロードする。
 * エントリの createRoot より前に一度だけ呼ぶ。
 */
export function installPwaRecovery(): void {
  window.addEventListener('vite:preloadError', () => {
    const KEY = '__chunk_recover__'
    try {
      if (sessionStorage.getItem(KEY)) return // すでに一度復帰済み → 無限ループ防止
      sessionStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* sessionStorage 不可でもリロードは行う */
    }
    window.location.reload()
  })
}

/**
 * React が正常にマウントできたことを index.html のウォッチドッグへ知らせる。
 * これが立てば「起動失敗(真っ暗)」ではないので自動リロードは走らない。
 *
 * App ルートの初回 effect で呼ぶ:
 *   useEffect(() => { markAppMounted() }, [])
 */
export function markAppMounted(): void {
  window.__APP_MOUNTED__ = true
}
