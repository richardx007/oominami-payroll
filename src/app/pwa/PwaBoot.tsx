"use client";

import { useEffect } from "react";
import { installPwaRecovery, markAppMounted } from "./pwaRecovery";

// PwaBoot — 空白画面リカバリの起点。ルート layout の <body> 内に 1 つだけ置く。
// レンダリング内容は無い(副作用のみ)。
//
//   - installPwaRecovery() … チャンク読込失敗を捕捉して 1 回だけ復帰リロード
//   - markAppMounted()     … 起動成功フラグ。<head> のウォッチドッグに「正常起動」を伝え、
//                            起動スプラッシュ(#boot-splash)を消す
//
// layout 側:  import { PwaBoot } from "./pwa/PwaBoot";  → <body> の先頭付近に <PwaBoot />
export function PwaBoot() {
  useEffect(() => {
    installPwaRecovery();
    markAppMounted();
  }, []);
  return null;
}
