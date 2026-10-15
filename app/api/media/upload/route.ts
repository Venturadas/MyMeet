import { randomUUID } from "node:crypto";
import { AVATAR_MEDIA_BUCKET, COMPANY_MEDIA_BUCKET, isMediaRecordId } from "@/lib/media-path";
import { compressImage } from "@/lib/media-processing";
import { MediaError, readBoundedBody } from "@/lib/media-request";
import { assertMediaOrigin, mediaContext, mediaFailure, mediaResponse, parseMediaKind, removeUnusedImage } from "@/lib/media-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertMediaOrigin(request);
    const contentType = request.headers.get("content-type") || "";
    if (!/^multipart\/form-data;\s*boundary=.{1,200}$/i.test(contentType)) throw new MediaError("Selecione uma imagem JPG, PNG ou WebP.");
    // Query kind lets authentication precede buffering. It must match the
    // multipart kind; neither can select a caller-supplied owner or company.
    const kind = parseMediaKind(new URL(request.url).searchParams.get("kind"));
    const context = await mediaContext(kind);
    const bytes = await readBoundedBody(request);
    let form: FormData;
    try { form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": contentType } }).formData(); }
    catch { throw new MediaError("Não foi possível ler a imagem. Selecione o arquivo novamente."); }
    const keys = Array.from(form.keys());
    if (keys.length > 3 || new Set(keys).size !== keys.length || keys.some((key) => !["kind", "file", "professional_id"].includes(key))) throw new MediaError("Envie uma imagem por vez.");
    if (form.get("kind") !== kind) throw new MediaError("Tipo de imagem inválido.");
    const file = form.get("file");
    if (!(file instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new MediaError("Use uma imagem JPG, PNG ou WebP.");
    const professionalId = form.get("professional_id");
    if ((kind === "professional" && !isMediaRecordId(professionalId)) || (kind !== "professional" && professionalId !== null)) throw new MediaError("Escolha um profissional da sua empresa.");
    const image = await compressImage(Buffer.from(await file.arrayBuffer()), kind);
    const path = `${kind === "avatar" ? context.user.id : context.businessId}/${randomUUID()}.webp`;
    const bucket = kind === "avatar" ? AVATAR_MEDIA_BUCKET : COMPANY_MEDIA_BUCKET;
    const uploaded = await context.db.storage.from(bucket).upload(path, image.bytes, { contentType: "image/webp", cacheControl: kind === "avatar" ? "0" : "31536000", upsert: false });
    if (uploaded.error) throw new MediaError("Não foi possível enviar a imagem. Tente novamente.", 503);
    try {
      const saved = kind === "avatar"
        ? await context.db.rpc("set_avatar", { p_path: path })
        : await context.db.rpc("attach_company_image", { p_kind: kind, p_path: path, p_record_id: professionalId });
      if (saved.error) throw new MediaError(kind === "gallery" ? "Não foi possível adicionar a foto. A galeria aceita até 12 imagens." : "Não foi possível salvar a imagem. Tente novamente.", 409);
      await removeUnusedImage(context, kind, kind === "avatar" ? saved.data : saved.data?.previous_path);
      return mediaResponse({ path, id: kind === "avatar" ? context.user.id : saved.data?.id, width: image.width, height: image.height });
    } catch (error) {
      await removeUnusedImage(context, kind, path);
      throw error;
    }
  } catch (error) { return mediaFailure(error); }
}
