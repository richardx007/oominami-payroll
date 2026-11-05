import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE_MAX_AGE,
  DEVICE_SESSION_COOKIE,
  DEVICE_SESSION_COOKIE_MAX_AGE,
  canIssueDeviceToken,
  DEVICE_PENDING_PATH,
  DEVICE_TOKEN_COOKIE,
  HANDOFF_COOKIE,
  HANDOFF_COOKIE_MAX_AGE,
  STANDALONE_COOKIE,
  TOUCH_MAC_COOKIE,
  deviceLabel,
  deviceSessionMarker,
  isDeviceGateExempt,
  isHandoffToken,
  newDeviceToken,
  sessionIdFromAccessToken,
} from "@/lib/device";

/** "/" の行き先(管理者か)を覚えておく Cookie。値は "ユーザーID:admin" か "ユーザーID:staff" */
const HOME_COOKIE = "oom_home";
const HOME_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

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

  // ログインの確認は getClaims(アクセストークンの署名を手元で検証する。署名の鍵 JWKS は
  // 一度取ったら Worker の中で使い回す)。以前の getUser は画面を開くたびに Supabase Auth へ
  // 問い合わせていて、起動時は "/" → "/admin" の2回ぶん、白い画面のまま待たされていた(2026-11-05)。
  // ここは画面の振り分け(未ログインなら /login へ)だけで、本当の守りは DB の RLS と、
  // 各画面の requireEmployee(getUser で Supabase Auth に確かめる)。
  // トークンの期限切れは getClaims の中(getSession)で更新され、Cookie も setAll で書き戻される。
  // 署名の鍵が HS256(旧方式)のときは getClaims が自動で getUser に切り替わる。
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  const user = userId ? { id: userId } : null;

  // /install: QRコードからログイン前でも開けるよう公開(ホーム画面追加の案内のみで機密情報なし)
  // /api: 外部(Supabase の pg_cron)から呼ばれる。ログインセッションを持たないため、
  //       ここで /login へリダイレクトすると通知が一切動かなくなる。
  //       各 API ルートは共有シークレットのヘッダーで自前に認証すること。
  // /calendar/embed: ホームページに iframe で埋め込む営業カレンダー(公開情報のみ。?preview=1 の
  //                  準備中の月の表示は管理者だけに許可する)
  // 端末承認制: ログインごとに1回、この端末を登録する(device_register)。
  // 全体は「記録だけ」の段階(app_settings.device_enforcement='log')。ブロックの対象の人
  // (試験運用の device_enforce_test、または全体が 'enforce')だけ、承認待ちなら承認待ちの画面へ移す。
  // 本当の守りは DB 側(RLS の土台の関数が device_session_ok() を見る)で、ここは画面の案内。
  // 登録済みの目印は「承認済み」か「ブロック対象でない」ときだけ付け、承認待ちの間は毎回確かめる。
  // /api は外部(pg_cron)から呼ばれ、ログインしている端末ではないので対象外。
  const deviceCookies: { name: string; value: string; maxAge: number }[] = [];
  let deviceBlocked = false;
  // ホーム画面アプリの起動先(/?h=札)。ログイン前に開かれるので、まず Cookie に預ける
  const handoffParam =
    request.nextUrl.pathname === "/" ? request.nextUrl.searchParams.get("h") : null;
  if (!user && isHandoffToken(handoffParam)) {
    deviceCookies.push({ name: HANDOFF_COOKIE, value: handoffParam, maxAge: HANDOFF_COOKIE_MAX_AGE });
  }
  // 合言葉はログイン前(ログイン画面を開いたとき)から持たせる。ログイン直後の最初のリクエストは
  // 画面の裏の読み込みで合言葉を作れないため、それまでに無いと登録が1回遅れ、その間に開いた画面が
  // 「従業員が見つからない」扱いになる(ブロック対象の人のホーム画面アプリで起きる)。
  let token = request.cookies.get(DEVICE_TOKEN_COOKIE)?.value ?? "";
  if (
    token.length < 32 &&
    canIssueDeviceToken(request.headers.get("sec-fetch-dest")) &&
    !request.nextUrl.pathname.startsWith("/api") &&
    !request.nextUrl.pathname.startsWith("/calendar/embed")
  ) {
    token = newDeviceToken();
    deviceCookies.push({ name: DEVICE_TOKEN_COOKIE, value: token, maxAge: DEVICE_COOKIE_MAX_AGE });
  }
  if (user && !request.nextUrl.pathname.startsWith("/api")) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const sid = sessionIdFromAccessToken(session?.access_token);
    const touchMac = request.cookies.has(TOUCH_MAC_COOKIE);
    const standalone = request.cookies.has(STANDALONE_COOKIE);
    const marker = sid ? deviceSessionMarker(sid, touchMac, standalone) : null;
    if (sid && marker && request.cookies.get(DEVICE_SESSION_COOKIE)?.value !== marker) {
      // 合言葉が無く、ここでは作れないリクエスト(裏の読み込み)は、次の画面の読み込みで登録する
      if (token.length >= 32) {
        const { data: status, error } = await supabase.rpc("device_register", {
          p_token: token,
          p_app: "payroll",
          p_label: deviceLabel(request.headers.get("user-agent"), touchMac, standalone),
        });
        // 失敗したら目印を付けない(次のリクエストでもう一度試す)。画面の表示は止めない。
        // 目印は1日で切れ、もう一度登録して端末一覧の「最終利用」を更新する
        if (error) console.error("[device_register]", error.message);
        else {
          let approved = status === "approved";
          // 承認待ちで引き継ぎ札があれば使う(使えても使えなくても札は捨てる)
          const handoff = isHandoffToken(handoffParam)
            ? handoffParam
            : request.cookies.get(HANDOFF_COOKIE)?.value;
          if (!approved && status === "pending" && isHandoffToken(handoff)) {
            const { data: r } = await supabase.rpc("device_handoff_redeem", { p_token: handoff });
            approved = r === "approved";
          }
          if (request.cookies.has(HANDOFF_COOKIE)) {
            deviceCookies.push({ name: HANDOFF_COOKIE, value: "", maxAge: 0 });
          }
          if (!approved) {
            const { data: enforced } = await supabase.rpc("device_enforced");
            deviceBlocked = enforced === true;
          }
          if (!deviceBlocked)
            deviceCookies.push({
              name: DEVICE_SESSION_COOKIE,
              value: marker,
              maxAge: DEVICE_SESSION_COOKIE_MAX_AGE,
            });
        }
      }
    }
  }
  const withDeviceCookies = (res: NextResponse) => {
    // リダイレクトの応答にも、更新したログインの Cookie(setAll で supabaseResponse に書いたもの)を載せる。
    // 載せないと、起動時("/" → "/admin")に "/" で更新したトークンが捨てられ、"/admin" でもう一度
    // 更新の問い合わせが走っていた(2026-11-05)
    if (res !== supabaseResponse) {
      for (const c of supabaseResponse.cookies.getAll()) res.cookies.set(c);
    }
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
    // 引き継ぎ札の Cookie を、/login への移動と一緒に保存する
    return withDeviceCookies(NextResponse.redirect(url));
  }

  // 承認待ち(ブロック対象の人だけ)は承認待ちの画面へ
  if (user && deviceBlocked && !isDeviceGateExempt(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = DEVICE_PENDING_PATH;
    url.search = "";
    return withDeviceCookies(NextResponse.redirect(url));
  }

  // "/"(PWAのstart_url)は行き先を振り分けるだけのページ。ここで判定してしまうことで、
  // src/app/page.tsx 側で同じ auth.getUser()+employees 問い合わせをもう一度行う無駄を無くす
  // (二重問い合わせが起動直後の白画面を長引かせていた)。
  // 行き先(管理者か)は Cookie(HOME_COOKIE = "ユーザーID:admin|staff")に覚えておき、2回目からは
  // DB に問い合わせずに振り分ける(起動のたびの待ち時間を減らす。2026-11-05)。ユーザーが違えば問い合わせ直す。
  // 覚えた後に管理者でなくなった人は /admin の requireAdmin が /timesheet へ移すので、見えてはいけない
  // 画面が見えることはない。管理者になった人は最長 HOME_COOKIE_MAX_AGE の間、起動先が勤務表のまま。
  if (user && request.nextUrl.pathname === "/") {
    const remembered = request.cookies.get(HOME_COOKIE)?.value ?? "";
    let isAdmin: boolean;
    if (remembered === `${user.id}:admin` || remembered === `${user.id}:staff`) {
      isAdmin = remembered.endsWith(":admin");
    } else {
      const { data: employee } = await supabase
        .from("employees")
        .select("is_admin")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      isAdmin = employee?.is_admin === true;
      // 従業員が見つからない(承認前の端末など)ときは覚えない
      if (employee)
        deviceCookies.push({
          name: HOME_COOKIE,
          value: `${user.id}:${isAdmin ? "admin" : "staff"}`,
          maxAge: HOME_COOKIE_MAX_AGE,
        });
    }
    const url = request.nextUrl.clone();
    url.pathname = isAdmin ? "/admin" : "/timesheet";
    return withDeviceCookies(NextResponse.redirect(url));
  }

  return withDeviceCookies(supabaseResponse);
}
