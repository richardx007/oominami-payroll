"use client";

import { usePathname } from "next/navigation";
import { ReloadPrompt, type ReloadPromptProps } from "./ReloadPrompt";

/**
 * アプリ全体の更新バナー。ホームページに iframe で埋め込む営業カレンダー(/calendar/embed)では出さない
 * (このアプリを使っている端末でホームページを見ると、iframe の中にバナーが出てしまうため)。
 */
export function AppReloadPrompt(props: ReloadPromptProps) {
  const pathname = usePathname();
  if (pathname?.startsWith("/calendar/embed")) return null;
  return <ReloadPrompt {...props} />;
}
