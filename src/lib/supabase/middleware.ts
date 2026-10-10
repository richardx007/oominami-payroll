import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_SESSION_COOKIE,
  DEVICE_SESSION_COOKIE_MAX_AGE,
  canIssueDeviceToken,
  DEVICE_TOKEN_COOKIE,
  deviceLabel,
  newDeviceToken,
  sessionIdFromAccessToken,
} from "@/lib/device";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // /install: QRコードからログイン前でも開けるよう公開(ホーム画面追加の案内のみで機密情報なし)
  // /api: 外部(Supabase の pg_cron)から呼ばれる。ログインセッションを持たないため、
  //       ここで /login へリダイレクトすると通知が一切動かなくなる。
  //       各 API ルートは共有シークレットのヘッダーで自前に認証すること。
  // /calendar/embed: ホームページに iframe で埋め込む営業カレンダー(公開情報のみ。?preview=1 の
  //                  準備中の月の表示は管理者だけに許可する)
  // 端末承認制: ログインごとに1回、この端末を登録する(device_register)。
  // 今は「記録だけ」の段階で、承認待ちでもブロックしない(app_settings.device_enforcement='log')。
  // /api は外部(pg_cron)から呼ばれ、ログインしている端末ではないので対象外。
  const deviceCookies: { name: string; value: string; maxAge: number }[] = [];
  if (user && !request.nextUrl.pathname.startsWith("/api")) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sid = sessionIdFromAccessToken(session?.access_token);
    if (sid && request.cookies.get(DEVICE_SESSION_COOKIE)?.value !== sid) {
      let token = request.cookies.get(DEVICE_TOKEN_COOKIE)?.value ?? "";
      if (token.length < 32 && canIssueDeviceToken(request.headers.get("sec-fetch-dest"))) {
        token = newDeviceToken();
        deviceCookies.push({ name: DEVICE_TOKEN_COOKIE, value: token, maxAge: DEVICE_COOKIE_MAX_AGE });
      }
      // 合言葉が無く、ここでは作れないリクエスト(裏の読み込み)は、次の画面の読み込みで登録する
      if (token.length >= 32) {
        const { error } = await supabase.rpc("device_register", {
          p_token: token,
          p_app: "payroll",
          p_label: deviceLabel(request.headers.get("user-agent")),
        });
        // 失敗したら目印を付けない(次のリクエストでもう一度試す)。画面の表示は止めない。
        // 目印は1日で切れ、もう一度登録して端末一覧の「最終利用」を更新する
        if (error) console.error("[device_register]", error.message);
        else
          deviceCookies.push({
            name: DEVICE_SESSION_COOKIE,
            value: sid,
            maxAge: DEVICE_SESSION_COOKIE_MAX_AGE,
          });
      }
    }
  }
  const withDeviceCookies = (res: NextResponse) => {
    for (const c of deviceCookies) {
      res.cookies.set(c.name, c.value, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: c.maxAge,
      });
    }
    return res;
  };

  const publicPaths = ["/login", "/register", "/auth", "/install", "/api", "/calendar/embed"];
  const isPublic = publicPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    // 元々開こうとしていた画面をログイン後に復元できるよう保持する。
    // 特に QR 打刻(/clock?type=in / ?type=out)は、未ログイン端末で読み取ると
    // ここで /login に飛ばされ、ログイン後は既定の /timesheet に着地して
    // 「出勤の確認画面が出ずに勤務表に飛ぶ」という混乱の原因になっていた。
    const dest = request.nextUrl.pathname + request.nextUrl.search;
    if (dest && dest !== "/" && !dest.startsWith("/login")) {
      url.searchParams.set("redirect", dest);
    }
    return NextResponse.redirect(url);
  }

  // "/"(PWAのstart_url)は行き先を振り分けるだけのページ。ここで判定してしまうことで、
  // src/app/page.tsx 側で同じ auth.getUser()+employees 問い合わせをもう一度行う無駄を無くす
  // (二重問い合わせが起動直後の白画面を長引かせていた)。
  if (user && request.nextUrl.pathname === "/") {
    const { data: employee } = await supabase
      .from("employees")
      .select("is_admin")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    const url = request.nextUrl.clone();
    url.pathname = employee?.is_admin ? "/admin" : "/timesheet";
    return withDeviceCookies(NextResponse.redirect(url));
  }

  return withDeviceCookies(supabaseResponse);
}
