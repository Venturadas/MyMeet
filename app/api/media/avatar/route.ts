import { AVATAR_MEDIA_BUCKET, isMediaPath, MAX_STORED_IMAGE_BYTES } from "@/lib/media-path";
import { mediaContext, mediaFailure, PRIVATE_MEDIA_HEADERS } from "@/lib/media-server";
import { MediaError } from "@/lib/media-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const context = await mediaContext("avatar");
    const profile = await context.db.from("profiles").select("avatar_path").eq("id", context.user.id).maybeSingle();
    if (profile.error) throw new MediaError("Imagem indisponível.", 503);
    const path = profile.data?.avatar_path;
    if (!isMediaPath(path) || !path.startsWith(`${context.user.id}/`)) throw new MediaError("Imagem não encontrada.", 404);
    const downloaded = await context.db.storage.from(AVATAR_MEDIA_BUCKET).download(path);
    if (downloaded.error || !downloaded.data || downloaded.data.size > MAX_STORED_IMAGE_BYTES) throw new MediaError("Imagem indisponível.", 404);
    const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
    if (bytes.length < 12 || Buffer.from(bytes.subarray(0, 4)).toString("ascii") !== "RIFF" || Buffer.from(bytes.subarray(8, 12)).toString("ascii") !== "WEBP") throw new MediaError("Imagem indisponível.", 404);
    return new Response(bytes, { headers: { ...PRIVATE_MEDIA_HEADERS, "Content-Type": "image/webp", "Content-Length": String(bytes.byteLength), "Content-Disposition": "inline; filename=avatar.webp" } });
  } catch (error) { return mediaFailure(error); }
}
