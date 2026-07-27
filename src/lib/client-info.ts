/**
 * ログイン端末の情報（起動方法・デバイス・OS・ブラウザ）
 *
 * 操作ログの「ログイン」に記録して、問い合わせ対応（「アプリが更新されない」
 * 「打刻できない」等）のときに、どの環境から使っているかを追えるようにする。
 *
 * ※**PWA（ホーム画面アプリ）かブラウザかは User-Agent では判別できない**。
 *   display-mode は表示中のウィンドウの状態であり、リクエストヘッダーには乗らない
 *   （`Sec-CH-UA-*` にも display-mode の標準ヘッダーは無い）。そのためサーバー側では
 *   判定できず、ログイン画面のクライアント側で判定して送る必要がある。
 */

export type ClientInfo = {
  /** "PWA" = ホーム画面アプリから起動 / "ブラウザ" */
  mode: string;
  /** iPhone / iPad / Android / PC など */
  device: string;
  /** iOS 18.5 / Android 15 / Windows / macOS など */
  os: string;
  /** Safari / Chrome 130 など */
  browser: string;
};

/** "18_5" → "18.5"。iOS の UA は "_" 区切りで版を書く */
function dot(v: string | undefined): string {
  return (v ?? "").replaceAll("_", ".");
}

/** メジャー版だけ取り出す（"130.0.0.0" → "130"） */
function major(v: string | undefined): string {
  return (v ?? "").split(".")[0] ?? "";
}

/**
 * User-Agent からデバイス・OS・ブラウザを推定する（純粋関数・テスト対象）。
 *
 * 判定順に注意: Edge は UA に "Chrome" を含み、Chrome は "Safari" を含むため、
 * **Edge → Chrome → Safari の順**に判定する。iOS 上の Chrome/Firefox/Edge は
 * それぞれ CriOS/FxiOS/EdgiOS を名乗る（中身は WebKit）。
 */
export function parseUserAgent(ua: string): Omit<ClientInfo, "mode"> {
  const u = ua ?? "";

  // --- OS・デバイス ---
  let device = "不明";
  let os = "不明";

  const iOS = /\((iPhone|iPad|iPod)/.exec(u);
  const iosVer = /OS (\d+[_\d]*) like Mac OS X/.exec(u);
  const android = /Android (\d+[.\d]*)/.exec(u);

  if (iOS) {
    device = iOS[1] === "iPod" ? "iPod" : iOS[1];
    os = iosVer ? `iOS ${dot(iosVer[1])}` : "iOS";
  } else if (android) {
    // Android は「Mobile」の有無でスマホ/タブレットを分ける
    device = /Mobile/.test(u) ? "Android" : "Androidタブレット";
    os = `Android ${android[1]}`;
  } else if (/Windows NT/.test(u)) {
    device = "PC";
    os = "Windows";
  } else if (/Macintosh|Mac OS X/.test(u)) {
    // ※iPadOS 13以降の「デスクトップ用サイトを表示」は Macintosh を名乗るため、
    //   ここでは Mac と区別できない。区別は describeClient() 側でタッチ数を見て行う。
    device = "Mac";
    os = "macOS";
  } else if (/CrOS/.test(u)) {
    device = "Chromebook";
    os = "ChromeOS";
  } else if (/Linux/.test(u)) {
    device = "PC";
    os = "Linux";
  }

  // --- ブラウザ（判定順が重要）---
  let browser = "不明";
  let m: RegExpExecArray | null;
  if ((m = /(?:Edg|EdgiOS|EdgA)\/(\d+[.\d]*)/.exec(u))) {
    browser = `Edge ${major(m[1])}`;
  } else if ((m = /(?:CriOS|Chrome)\/(\d+[.\d]*)/.exec(u))) {
    browser = `Chrome ${major(m[1])}`;
  } else if ((m = /(?:FxiOS|Firefox)\/(\d+[.\d]*)/.exec(u))) {
    browser = `Firefox ${major(m[1])}`;
  } else if (/Safari/.test(u)) {
    const v = /Version\/(\d+[.\d]*)/.exec(u);
    browser = v ? `Safari ${major(v[1])}` : "Safari";
  }

  return { device, os, browser };
}

/** ClientInfo を操作ログ用の1行にする（例: "PWA / iPhone / iOS 18.5 / Safari 18"） */
export function formatClientInfo(info: ClientInfo): string {
  return [info.mode, info.device, info.os, info.browser].join(" / ");
}

/**
 * 現在のブラウザ環境を判定する（クライアント専用）。
 * サーバー側や navigator が無い環境では null を返す。
 */
export function describeClient(): ClientInfo | null {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return null;
  }

  const ua = navigator.userAgent ?? "";
  const parsed = parseUserAgent(ua);

  // ホーム画面アプリ(PWA)からの起動かどうか。iOS Safari は navigator.standalone、
  // それ以外は display-mode メディアクエリで判定する。
  const standalone =
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    ["standalone", "minimal-ui", "fullscreen"].some((mode) => {
      try {
        return window.matchMedia(`(display-mode: ${mode})`).matches;
      } catch {
        return false;
      }
    });

  // iPadOS 13以降は既定で Macintosh を名乗るため UA だけでは Mac と区別できない。
  // タッチ点数が2以上の Mac は iPad とみなす（clock/ui.tsx と同じ判定）。
  let { device, os } = parsed;
  if (
    device === "Mac" &&
    navigator.maxTouchPoints > 1 &&
    /MacIntel|Mac/.test(navigator.platform ?? "")
  ) {
    device = "iPad";
    os = "iPadOS";
  }

  return {
    mode: standalone ? "PWA" : "ブラウザ",
    device,
    os,
    browser: parsed.browser,
  };
}
