import type { Metadata } from "next";
import Link from "next/link";
import { AddToHomeScreenBanner } from "@/app/pwa/AddToHomeScreenBanner";
import { createClient } from "@/lib/supabase/server";

/**
 * 承認済みの端末でログインして開いたときは、マニフェストに引き継ぎ札を付ける(端末承認制)。
 * ここからホーム画面に追加したアプリは、初めて開いてログインしたときに自動で承認される
 * (iPhone はホーム画面アプリと Safari が Cookie を共有しないため、札が無いと別の端末として承認待ちになる)。
 * 未ログイン・承認待ちの端末では札は出ない(device_handoff_create が null を返す)。
 */
export async function generateMetadata(): Promise<Metadata> {
  let manifest = "/manifest.webmanifest";
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: token } = await supabase.rpc("device_handoff_create");
      if (typeof token === "string" && token) {
        manifest = `/manifest.webmanifest?h=${token}`;
      }
    }
  } catch {
    // 札が作れなくても案内は出す(札なしでも確認コード・管理者の承認で使える)
  }
  return { title: "ホーム画面に追加 | 給与管理システム", manifest };
}

/**
 * スマホのホーム画面にアプリを追加してもらうための案内ページ。
 * QRコードから直接開けるよう未ログインでもアクセス可能(公開ページ、middlewareで許可)。
 * 実際の手順案内は AddToHomeScreenBanner が端末を判定して下部に表示する。
 */
export default async function InstallPage() {
  // ログイン中(初回登録の直後・アカウント設定から)は、追加せずに使い始めるリンクも出す
  let loggedIn = false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    loggedIn = !!user;
  } catch {}

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-50 px-6 pb-32 pt-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo.svg"
        alt="新世界オオミナミ"
        className="h-20 w-20 rounded-full bg-white object-contain shadow"
      />
      <h1 className="mt-6 text-xl font-bold text-gray-900">
        ホーム画面に追加してください
      </h1>
      <p className="mt-3 max-w-xs text-sm leading-relaxed text-gray-600">
        アイコンをホーム画面に置いておくと、次回からアプリのようにワンタップで開けます。
        画面下に表示される案内にそって進めてください。
      </p>
      {loggedIn && (
        <Link href="/" className="mt-6 text-sm text-blue-600 underline">
          あとで追加する(このまま使い始める)
        </Link>
      )}
      <AddToHomeScreenBanner />
    </main>
  );
}
