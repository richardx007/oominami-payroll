import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const publicPaths = ["/login", "/register", "/auth", "/install", "/api"];
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
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
