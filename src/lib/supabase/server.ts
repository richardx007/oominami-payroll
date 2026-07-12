import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient(options?: {
  flowType?: "pkce" | "implicit";
}) {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // パスワード再設定メールなど「別端末で開くリンク」を発行する場合は
      // implicit フローにする。PKCE だと code_verifier がリンクを開く端末に
      // 無いと verifyOtp が失敗する(pkce_ 付き token_hash)。implicit なら
      // 端末非依存の token_hash が発行され、verifyOtp が単独で検証できる。
      auth: options?.flowType ? { flowType: options.flowType } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component からの呼び出しでは set できない(middleware で更新される)
          }
        },
      },
    }
  );
}
