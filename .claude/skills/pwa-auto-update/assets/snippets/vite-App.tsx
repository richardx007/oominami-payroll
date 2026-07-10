// Vite + React 配線サンプル。ReloadPrompt をアプリのルートに常設し、
// ロゴを reloadApp() で最新化する。ファイル配置は src/pwa/ を想定。
//   - src/pwa/reloadApp.ts     (assets/reloadApp.ts)
//   - src/pwa/ReloadPrompt.tsx (assets/ReloadPrompt.tsx)
import { ReloadPrompt } from "./pwa/ReloadPrompt";
import { reloadApp } from "./pwa/reloadApp";

export default function App() {
  return (
    <>
      {/* 既存のアプリ本体 / ルーター */}
      {/* <RouterProvider .../> など */}

      {/* ロゴをタップで最新化(ヘッダー等に配置) */}
      <button
        type="button"
        onClick={() => reloadApp()}
        aria-label="最新の状態に更新"
        style={{ touchAction: "manipulation" }}
      >
        {/* <Logo /> */}
      </button>

      {/* 新版検知バナー。開発中は出さないなら import.meta.env.PROD で条件表示 */}
      {import.meta.env.PROD && <ReloadPrompt accentColor="#152449" position="top" />}
    </>
  );
}

// 補足:
//  - SW は本番ビルドの public/sw.js を登録する。開発(vite dev)でも public/sw.js は配信されるが、
//    上記のように import.meta.env.PROD で ReloadPrompt を本番のみ描画すれば、開発中に
//    SW 登録・更新バナーが出てこない(HMR と干渉しない)。
//  - この最小 SW は fetch を持たず何もキャッシュしないため、Vite の SPA ナビゲーション
//    (React Router 等)にも一切影響しない。
