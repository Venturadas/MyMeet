import { isMediaRecordId } from "@/lib/media-path";
import { MediaError, readBoundedBody } from "@/lib/media-request";
import { assertMediaOrigin, mediaContext, mediaFailure, mediaResponse, parseMediaKind, removeUnusedImage } from "@/lib/media-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertMediaOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new MediaError("Pedido inválido.");
    let payload: Record<string, unknown>;
    try { payload = JSON.parse((await readBoundedBody(request, 4096)).toString("utf8")); }
    catch (error) { if (error instanceof MediaError) throw error; throw new MediaError("Pedido inválido."); }
    if (!payload || Array.isArray(payload) || Object.keys(payload).some((key) => !["kind", "recordId"].includes(key))) throw new MediaError("Pedido inválido.");
    const kind = parseMediaKind(payload.kind);
    if ((["gallery", "professional"].includes(kind) && !isMediaRecordId(payload.recordId)) || (!["gallery", "professional"].includes(kind) && payload.recordId != null)) throw new MediaError("Imagem inválida.");
    const context = await mediaContext(kind);
    const removed = kind === "avatar"
      ? await context.db.rpc("set_avatar", { p_path: null })
      : await context.db.rpc("remove_company_image", { p_kind: kind, p_record_id: payload.recordId ?? null });
    if (removed.error) throw new MediaError("Não foi possível remover a imagem. Tente novamente.", 409);
    await removeUnusedImage(context, kind, kind === "avatar" ? removed.data : removed.data?.previous_path);
    return mediaResponse({ removed: true });
  } catch (error) { return mediaFailure(error); }
}
