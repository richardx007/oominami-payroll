/**
 * 依存パッケージなしの最小SMTPクライアント(Cloudflare Workers 専用)
 *
 * cloudflare:sockets の TCP ソケットで smtp.gmail.com:465(implicit TLS)に接続し、
 * AUTH PLAIN(Gmail アプリパスワード)で認証してテキストメールを送信する。
 */

type CFSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
};

async function connectTls(host: string, port: number): Promise<CFSocket> {
  // バンドラー(esbuild/turbopack)に静的解決・定数畳み込みさせないため、
  // 実行時にしか値が決まらない式で指定子を組み立てる
  const specifier =
    process.env.CF_SOCKETS_SPECIFIER || "cloudflare" + ":sockets";
  const mod = (await import(/* webpackIgnore: true */ specifier)) as {
    connect: (
      addr: { hostname: string; port: number },
      opts: { secureTransport: "on"; allowHalfOpen: boolean }
    ) => CFSocket;
  };
  return mod.connect(
    { hostname: host, port },
    { secureTransport: "on", allowHalfOpen: false }
  );
}

/** UTF-8 文字列を Base64 に */
function b64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin);
}

/** 日本語ヘッダー用の MIME エンコード */
function mimeWord(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

/** Base64 本文を 76 文字で折り返し */
function wrap76(s: string): string {
  return s.replace(/(.{76})/g, "$1\r\n");
}

class SmtpError extends Error {}

export type MailAttachment = {
  filename: string; // ASCII推奨
  content: string; // テキスト内容(UTF-8)
  contentType: string; // 例: "text/csv"
};

export async function smtpSendMail(params: {
  host: string;
  port: number;
  username: string;
  password: string;
  fromName: string;
  to: string;
  cc?: string[];
  subject: string;
  text: string;
  attachments?: MailAttachment[];
}): Promise<void> {
  const ccList = (params.cc ?? []).filter((c) => c && c !== params.to);
  const socket = await connectTls(params.host, params.port);
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  /** 応答の最終行("250 xxx" 形式)まで読み、コードを検証する */
  async function expect(codes: number[]): Promise<void> {
    for (;;) {
      const lines = buffer.split("\r\n");
      for (const line of lines) {
        if (/^\d{3} /.test(line)) {
          const code = Number(line.slice(0, 3));
          buffer = "";
          if (!codes.includes(code)) {
            throw new SmtpError(`SMTP ${line.trim()}`);
          }
          return;
        }
      }
      // 応答が返らないままハングしないよう読み取りにタイムアウトを設ける
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new SmtpError("SMTP応答がタイムアウトしました")),
            15000
          )
        ),
      ]);
      if (done) throw new SmtpError("接続が切断されました");
      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function send(command: string): Promise<void> {
    await writer.write(new TextEncoder().encode(command + "\r\n"));
  }

  try {
    await expect([220]);
    await send("EHLO localhost");
    await expect([250]);
    await send("AUTH PLAIN " + b64(`\0${params.username}\0${params.password}`));
    await expect([235]);
    await send(`MAIL FROM:<${params.username}>`);
    await expect([250]);
    await send(`RCPT TO:<${params.to}>`);
    await expect([250, 251]);
    // CC 宛先も配送対象として RCPT に加える
    for (const cc of ccList) {
      await send(`RCPT TO:<${cc}>`);
      await expect([250, 251]);
    }
    await send("DATA");
    await expect([354]);

    const domain = params.username.split("@")[1] ?? "localhost";
    const messageId = `<${crypto.randomUUID()}@${domain}>`;
    const attachments = params.attachments ?? [];

    let message: string;
    if (attachments.length === 0) {
      // 添付なし: シンプルな text/plain
      const headers = [
        `From: ${mimeWord(params.fromName)} <${params.username}>`,
        `To: <${params.to}>`,
        ...(ccList.length ? [`Cc: ${ccList.map((c) => `<${c}>`).join(", ")}`] : []),
        `Subject: ${mimeWord(params.subject)}`,
        `Message-ID: ${messageId}`,
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        `Date: ${new Date().toUTCString()}`,
      ];
      message = headers.join("\r\n") + "\r\n\r\n" + wrap76(b64(params.text));
    } else {
      // 添付あり: multipart/mixed
      const boundary = `b_${crypto.randomUUID().replace(/-/g, "")}`;
      const headers = [
        `From: ${mimeWord(params.fromName)} <${params.username}>`,
        `To: <${params.to}>`,
        ...(ccList.length ? [`Cc: ${ccList.map((c) => `<${c}>`).join(", ")}`] : []),
        `Subject: ${mimeWord(params.subject)}`,
        `Message-ID: ${messageId}`,
        "MIME-Version: 1.0",
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        `Date: ${new Date().toUTCString()}`,
      ];
      const parts: string[] = [];
      // 本文パート
      parts.push(
        `--${boundary}\r\n` +
          'Content-Type: text/plain; charset="UTF-8"\r\n' +
          "Content-Transfer-Encoding: base64\r\n\r\n" +
          wrap76(b64(params.text))
      );
      // 添付パート
      for (const att of attachments) {
        parts.push(
          `--${boundary}\r\n` +
            `Content-Type: ${att.contentType}; charset="UTF-8"; name="${att.filename}"\r\n` +
            "Content-Transfer-Encoding: base64\r\n" +
            `Content-Disposition: attachment; filename="${att.filename}"\r\n\r\n` +
            wrap76(b64(att.content))
        );
      }
      message =
        headers.join("\r\n") +
        "\r\n\r\n" +
        parts.join("\r\n") +
        `\r\n--${boundary}--`;
    }

    await send(message + "\r\n.");
    await expect([250]);
    await send("QUIT");
  } finally {
    try {
      writer.releaseLock();
      reader.releaseLock();
      await socket.close();
    } catch {
      // クローズ時のエラーは無視
    }
  }
}
