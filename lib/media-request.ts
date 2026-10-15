import { MAX_IMAGE_BYTES } from "./media-path";

export const MAX_MULTIPART_BYTES = MAX_IMAGE_BYTES + 64 * 1024;
export class MediaError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "MediaError";
  }
}
export async function readBoundedBody(request: Request, limit = MAX_MULTIPART_BYTES) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new MediaError("A imagem é muito grande. Use um arquivo de até 4 MB.", 413);
  if (!request.body) throw new MediaError("Selecione uma imagem.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new MediaError("A imagem é muito grande. Use um arquivo de até 4 MB.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), size);
}
