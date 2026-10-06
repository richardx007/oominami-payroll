"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/log";
import {
  audienceLabel,
  GUIDE_FILE_NAME_MAX,
  GUIDE_SUMMARY_MAX,
  GUIDE_TITLE_MAX,
  GUIDE_VIDEO_BUCKET,
  GUIDE_VIDEO_PATH_RE,
  type GuideGroup,
} from "@/lib/app-guides";
import type { ActionResult } from "../employees/actions";

// ---- アプリの解説（操作説明の動画・資料へのリンク）----

// 動画はブラウザから Storage へ直接アップロードし（Workers を通すと CPU 時間・リクエストサイズの上限に当たる）、
// ここでは保存先のパス・大きさ・元のファイル名だけを受け取って記録する。
const guideSchema = z
  .object({
    id: z.uuid().nullable(),
    title: z.string().trim().min(1, "タイトルを入力してください").max(GUIDE_TITLE_MAX, `タイトルは${GUIDE_TITLE_MAX}文字までです`),
    kind: z.enum(["video", "url"]),
    url: z.string().trim().max(1000, "URLが長すぎます"),
    video_path: z.string().nullable(),
    video_size: z.number().int().nonnegative().nullable(),
    /** 動画ファイルの作成日時（ISO。未入力は null） */
    video_created_at: z.iso.datetime({ offset: true }).nullable(),
    /** アップロードした動画の元のファイル名（未記録は null） */
    video_file_name: z.string().trim().min(1).max(GUIDE_FILE_NAME_MAX).nullable(),
    summary: z.string().trim().max(GUIDE_SUMMARY_MAX, `概略は${GUIDE_SUMMARY_MAX}文字までです`),
    for_admin: z.boolean(),
    for_employee: z.boolean(),
  })
  .refine((g) => g.for_admin || g.for_employee, { message: "公開対象を1つ以上選んでください" })
  .refine((g) => g.kind !== "url" || /^https?:\/\/\S+$/.test(g.url), {
    message: "URLは https:// から始まる形で入力してください",
  })
  .refine((g) => g.kind !== "video" || (g.video_path != null && GUIDE_VIDEO_PATH_RE.test(g.video_path)), {
    message: "動画ファイルを選んでください",
  });

function revalidateGuides() {
  revalidatePath("/admin/guides");
  revalidatePath("/guides");
}

/** 使わなくなった動画を Storage から消す（失敗しても保存自体は成功扱い。容量が残るだけ） */
async function removeGuideVideo(supabase: Awaited<ReturnType<typeof createClient>>, path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(GUIDE_VIDEO_BUCKET).remove([path]);
}

export async function saveAppGuide(input: z.input<typeof guideSchema>): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = guideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const g = parsed.data;
  const supabase = await createClient();
  const isVideo = g.kind === "video";
  const row = {
    title: g.title,
    url: isVideo ? null : g.url,
    video_path: isVideo ? g.video_path : null,
    video_size: isVideo ? g.video_size : null,
    video_created_at: isVideo ? g.video_created_at : null,
    video_file_name: isVideo ? g.video_file_name : null,
    summary: g.summary,
    for_admin: g.for_admin,
    for_employee: g.for_employee,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  };

  let error;
  let oldVideo: string | null = null;
  if (g.id) {
    const { data: before } = await supabase.from("app_guides").select("video_path").eq("id", g.id).maybeSingle();
    oldVideo = before?.video_path ?? null;
    ({ error } = await supabase.from("app_guides").update(row).eq("id", g.id));
  } else {
    const { data: last } = await supabase
      .from("app_guides")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase.from("app_guides").insert({ ...row, sort_order: (last?.sort_order ?? 0) + 1 }));
  }
  if (error) return { ok: false, message: "保存に失敗しました" };
  // 動画を差し替えた・URL に切り替えた場合は、前の動画を消す
  if (oldVideo && oldVideo !== row.video_path) await removeGuideVideo(supabase, oldVideo);

  await logActivity(
    "アプリの解説",
    `${g.id ? "変更" : "追加"}: ${g.title}（${isVideo ? `動画${g.video_file_name ? `: ${g.video_file_name}` : ""}` : "URL"}・${audienceLabel(g)}）`
  );
  revalidateGuides();
  return { ok: true, message: `「${g.title}」を保存しました` };
}

export async function deleteAppGuide(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_guides")
    .delete()
    .eq("id", id)
    .select("title, video_path")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "削除できませんでした" };
  await removeGuideVideo(supabase, data.video_path);
  await logActivity("アプリの解説", `削除: ${data.title}`);
  revalidateGuides();
  return { ok: true, message: `「${data.title}」を削除しました` };
}

/** アップロードしたが保存しなかった動画を消す（保存に失敗したとき・やめたとき）。どこからも使われていないものだけ */
export async function discardGuideVideo(path: string): Promise<void> {
  await requireAdmin();
  if (!GUIDE_VIDEO_PATH_RE.test(path)) return;
  const supabase = await createClient();
  const { data: used } = await supabase.from("app_guides").select("id").eq("video_path", path).maybeSingle();
  if (!used) await removeGuideVideo(supabase, path);
}

/** 並び順を1つ上（-1）または下（+1）へ。同じグループ（管理者用／従業員用）の中で隣の項目と入れ替える */
export async function moveAppGuide(id: string, dir: -1 | 1, group: GuideGroup): Promise<ActionResult> {
  await requireAdmin();
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "指定が正しくありません" };
  if (group !== "admin" && group !== "employee") return { ok: false, message: "指定が正しくありません" };
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("app_guides")
    .select("id, sort_order, for_admin, for_employee")
    .order("sort_order")
    .order("created_at");
  if (error || !rows) return { ok: false, message: "並べ替えに失敗しました" };
  // グループ内の位置で隣を探し、全体の並び（sort_order）の中でその2つを入れ替える
  const inGroup = rows.filter((r) => (group === "admin" ? r.for_admin : r.for_employee)).map((r) => r.id);
  const gi = inGroup.indexOf(id);
  const gj = gi + dir;
  if (gi < 0 || gj < 0 || gj >= inGroup.length) return { ok: true, message: "" };
  // sort_order が重複していても確実に入れ替わるよう、一覧の位置で振り直す
  const order = rows.map((r) => r.id);
  const i = order.indexOf(id);
  const j = order.indexOf(inGroup[gj]);
  [order[i], order[j]] = [order[j], order[i]];
  for (let k = 0; k < order.length; k++) {
    const { error: e } = await supabase.from("app_guides").update({ sort_order: k + 1 }).eq("id", order[k]);
    if (e) return { ok: false, message: "並べ替えに失敗しました" };
  }
  revalidateGuides();
  return { ok: true, message: "" };
}
