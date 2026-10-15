import { isMediaRecordId, MAX_GALLERY_IMAGES } from "@/lib/media-path";
import { MediaError, readBoundedBody } from "@/lib/media-request";
import { assertMediaOrigin, mediaContext, mediaFailure, mediaResponse } from "@/lib/media-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertMediaOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) throw new MediaError("Pedido inválido.");
    const context = await mediaContext("gallery");
    let payload: { ids?: unknown };
    try { payload = JSON.parse((await readBoundedBody(request, 4096)).toString("utf8")); }
    catch (error) { if (error instanceof MediaError) throw error; throw new MediaError("Pedido inválido."); }
    if (!payload || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "ids") || !Array.isArray(payload.ids) || payload.ids.length > MAX_GALLERY_IMAGES || payload.ids.some((id) => !isMediaRecordId(id)) || new Set(payload.ids).size !== payload.ids.length) throw new MediaError("A ordem da galeria está inválida.");
    const updated = await context.db.rpc("reorder_company_gallery", { p_ids: payload.ids });
    if (updated.error) throw new MediaError("Não foi possível ordenar a galeria. Atualize a página e tente novamente.", 409);
    return mediaResponse({ saved: true });
  } catch (error) { return mediaFailure(error); }
}
