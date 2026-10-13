import { RootLoadingView } from "./RootLoading";

// アプリ起動直後(ログイン判定・初回データ取得中)に表示するスプラッシュ画面。
// ここが無いと、この間は真っ白のまま数秒待たされることになる。
// PWA のスプラッシュ(manifest の background_color/icon)と近い見た目にして、
// ネイティブスプラッシュからの切り替わりを自然にしている。
export default function RootLoading() {
  // 打刻画面(/clock)へ進むときだけはロゴを出さない(RootLoading.tsx 参照)
  return <RootLoadingView />;
}
