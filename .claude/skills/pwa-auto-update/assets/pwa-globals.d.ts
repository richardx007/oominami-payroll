// layout.tsx の起動ウォッチドッグが参照するフラグ。markAppMounted() で true になる。
// Next.js では tsconfig の include(通常 next-env.d.ts / **/*.ts で拾われる)に含まれること。
interface Window {
  __APP_MOUNTED__?: boolean;
}
