/*
 * キルスイッチ Service Worker
 * -----------------------------------------------------------
 * かつて配信していた PWA 用 SW(Serwist)が端末に残ると、ナビゲーション遷移が壊れる
 * 不具合があったため、この SW は「自分自身を解除して、全キャッシュを消し、開いている
 * 画面を再読込する」だけの役割を持つ。ブラウザが /sw.js の更新チェックでこの内容を
 * 取得すると、旧 SW がこれに置き換わり、有効化時に自己解除して SW 無しの状態に戻る。
 *
 * ※ PWA 機能を再導入する際は、このファイルを Serwist 生成物に差し替える。
 */
self.addEventListener("install", () => {
  // 待機せず即インストール(旧 SW を素早く置き換える)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1) すべてのキャッシュを削除(旧 SW が作った壊れたページ/RSC キャッシュを含む)
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        /* 失敗しても続行 */
      }
      // 2) この SW 自身の登録を解除(以後ページは SW に制御されない)
      try {
        await self.registration.unregister();
      } catch (e) {
        /* 失敗しても続行 */
      }
      // 3) 開いているウィンドウを再読込して、SW 無しのクリーンな状態にする
      try {
        const clients = await self.clients.matchAll({ type: "window" });
        for (const client of clients) {
          client.navigate(client.url);
        }
      } catch (e) {
        /* 失敗しても続行 */
      }
    })()
  );
});
