/**
 * Worker の入口(wrangler.jsonc の main)。OpenNext が作る .open-next/worker.js を包む。
 *
 * /expense と /expense/* は経費管理(oominami-business)の Worker へサービスバインディング(EXPENSE)で中継する
 * (2026-10-12)。経費管理は basePath "/expense" で動く。同じアドレスなのでログイン(Supabase の Cookie)と
 * 端末承認の合言葉(oom_dvt)が共通になり、給与管理のホーム画面アプリの中で経費の画面を開ける。
 * 中継したリクエストは給与管理の middleware を通らない(ログイン確認・端末の登録は経費管理側で行う)。
 */
// .open-next/worker.js はビルドで作られる(型定義なし。型チェックの時点では無いこともあるので ts-expect-error は使えない)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { default as handler } from "./.open-next/worker.js";

const EXPENSE_PREFIX = "/expense";

type Env = { EXPENSE?: { fetch(request: Request): Promise<Response> } };

const worker = {
  async fetch(request: Request, env: Env, ctx: unknown): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === EXPENSE_PREFIX || pathname.startsWith(`${EXPENSE_PREFIX}/`)) {
      if (!env.EXPENSE) return new Response("経費管理に接続できません", { status: 503 });
      return env.EXPENSE.fetch(request);
    }
    return handler.fetch(request, env, ctx);
  },
};

export default worker;
