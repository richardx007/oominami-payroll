/** QRの文字列が出退勤QR(自サイトの /clock?type=in|out)なら打刻の種別を返す */
export function parseClockQr(text: string, origin: string): "in" | "out" | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.origin !== origin || url.pathname !== "/clock") return null;
  const type = url.searchParams.get("type");
  return type === "in" || type === "out" ? type : null;
}
