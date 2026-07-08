// vite-plugin-pwa の React 版仮想モジュール(virtual:pwa-register/react)の型参照。
/// <reference types="vite-plugin-pwa/react" />

// index.html の起動ウォッチドッグが参照するフラグ。markAppMounted() で true になる。
interface Window {
  __APP_MOUNTED__?: boolean
}
