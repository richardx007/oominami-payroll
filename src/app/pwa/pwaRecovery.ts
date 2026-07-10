// pwaRecovery — 更新直後の「真っ暗/白い空白画面」からの自動復帰。
//
// 更新直後は新旧の JS チャンク/SW の切替タイミングがズレ、メイン JS や遅延チャンクの
// 読み込みに失敗して React が描画されない瞬間がある(iOS/iPadOS で起きやすい)。
// このモジュールと、layout.tsx 側の「起動ウォッチドッグ」(snippets/layout.tsx 参照)を
// 組み合わせることで、固まった状態から 1 回だけ自動リロードして立て直す。
//
// 使い方(Next.js App Router):
//   - installPwaRecovery() … ルートに近いクライアント component の初回 effect で 1 回呼ぶ
//   - markAppMounted()     … 同じく初回 effect で呼ぶ(起動成功フラグ)
//   例) app/pwa/PwaBoot.tsx のような "use client" component を作り、layout の <body> 内に置く:
//       useEffect(() => { installPwaRecovery(); markAppMounted(); }, [])

const RECOVER_KEY = "__chunk_recover__";

function recoverOnce(): void {
  try {
    if (sessionStorage.getItem(RECOVER_KEY)) return; // すでに一度復帰済み → 無限ループ防止
    sessionStorage.setItem(RECOVER_KEY, String(Date.now()));
  } catch {
    /* sessionStorage 不可でもリロードは行う */
  }
  window.location.reload();
}

/**
 * 遅延読み込み(dynamic import)のチャンク取得失敗を捕捉し、1 回だけ復帰リロードする。
 * ルートのクライアント component の初回 effect で一度だけ呼ぶ。
 *
 * Vite の 'vite:preloadError' に相当するイベントは Next.js には無いため、
 * ChunkLoadError(webpack のチャンク読み込み失敗)を error / unhandledrejection から判定する。
 */
export function installPwaRecovery(): void {
  const isChunkError = (name: string, msg: string): boolean =>
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed|Loading CSS chunk|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i.test(
      msg
    );

  window.addEventListener("error", (e: ErrorEvent) => {
    const name = (e.error as { name?: string } | undefined)?.name ?? "";
    if (isChunkError(name, String(e.message ?? ""))) recoverOnce();
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason as { name?: string; message?: string } | undefined;
    if (isChunkError(reason?.name ?? "", String(reason?.message ?? reason ?? ""))) {
      recoverOnce();
    }
  });
}

/**
 * React が正常にマウントできたことを layout.tsx のウォッチドッグへ知らせ、起動スプラッシュを消す。
 * これが立てば「起動失敗(真っ暗)」ではないので自動リロードは走らない。
 *
 * ルートのクライアント component の初回 effect で呼ぶ:
 *   useEffect(() => { markAppMounted() }, [])
 */
export function markAppMounted(): void {
  window.__APP_MOUNTED__ = true;
  // 起動スプラッシュが残っていれば取り除く(React マウント済み = 表示準備完了)。
  document.getElementById("boot-splash")?.remove();
}
