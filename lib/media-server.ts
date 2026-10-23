import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./supabase";
import { hasBusinessSubscription } from "./subscription";
import { AVATAR_MEDIA_BUCKET, COMPANY_MEDIA_BUCKET, isMediaPath, isMediaRecordId, MEDIA_KINDS, type MediaKind } from "./media-path";
import { MediaError } from "./media-request";
import { operationalFailure } from "./operations";

export const PRIVATE_MEDIA_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0", "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Vary": "Cookie",
};
export type MediaContext = { db: SupabaseClient; user: User; businessId: string | null };
export function assertMediaOrigin(request: Request) {
  const source = request.headers.get("origin");
  const expected = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  try {
    const canonical = new URL(expected);
    if (!source || new URL(source).origin !== canonical.origin || (process.env.NODE_ENV === "production" && canonical.protocol !== "https:") || request.headers.get("sec-fetch-site") === "cross-site") throw new Error("origin");
  } catch { throw new MediaError("Abra o NuvLink novamente para enviar a imagem.", 403); }
}
export function parseMediaKind(value: unknown): MediaKind {
  if (typeof value !== "string" || !MEDIA_KINDS.includes(value as MediaKind)) throw new MediaError("Escolha o tipo de imagem.");
  return value as MediaKind;
}
export async function mediaContext(kind: MediaKind): Promise<MediaContext> {
  if (!isConfigured()) throw new MediaError("O envio de imagens está indisponível no momento.", 503);
  const db = await supabase();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) throw new MediaError("Entre na sua conta para continuar.", 401);
  if (kind === "avatar") return { db, user, businessId: null };
  if (!(await hasBusinessSubscription(db))) throw new MediaError("Ative seu plano para editar as imagens da empresa.", 403);
  const business = await db.from("businesses").select("id").eq("owner_id", user.id).maybeSingle();
  if (business.error) throw new MediaError("Não foi possível carregar sua empresa. Tente novamente.", 503);
  if (!business.data || !isMediaRecordId(business.data.id)) throw new MediaError("Crie sua empresa antes de adicionar imagens.", 409);
  return { db, user, businessId: business.data.id };
}
export function mediaResponse(data: unknown, status = 200) { return Response.json(data, { status, headers: PRIVATE_MEDIA_HEADERS }); }
export function mediaFailure(error: unknown) {
  if (!(error instanceof MediaError) || error.status >= 500) operationalFailure("media.request_failed");
  return mediaResponse({ error: error instanceof MediaError ? error.message : "Não foi possível salvar a imagem. Tente novamente." }, error instanceof MediaError ? error.status : 503);
}
export function assertOwnPath(context: MediaContext, kind: MediaKind, path: unknown): path is string {
  return isMediaPath(path) && path.startsWith(`${kind === "avatar" ? context.user.id : context.businessId}/`);
}
export async function removeUnusedImage(context: MediaContext, kind: MediaKind, path: unknown) {
  if (!assertOwnPath(context, kind, path)) return;
  if (kind === "avatar") {
    const profile = await context.db.from("profiles").select("avatar_path").eq("id", context.user.id).maybeSingle();
    if (profile.error || profile.data?.avatar_path === path) return;
  } else {
    const references = await context.db.rpc("company_media_path_in_use", { p_path: path });
    if (references.error || references.data !== false) return;
  }
  // RLS repeats ownership and reference checks under its row lock. Failure
  // leaves an orphan rather than deleting a referenced photo. Never a prefix.
  await context.db.storage.from(kind === "avatar" ? AVATAR_MEDIA_BUCKET : COMPANY_MEDIA_BUCKET).remove([path]);
}
