import sharp from "sharp";
import { MAX_IMAGE_BYTES, MAX_STORED_IMAGE_BYTES, type MediaKind } from "./media-path";
import { MediaError } from "./media-request";

export const MAX_IMAGE_PIXELS = 20_000_000;
export async function compressImage(input: Buffer, kind: MediaKind) {
  if (!input.length || input.length > MAX_IMAGE_BYTES) throw new MediaError("Use uma imagem de até 4 MB.", 413);
  try {
    const image = sharp(input, { failOn: "warning", limitInputPixels: MAX_IMAGE_PIXELS, animated: true });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format)) throw new MediaError("Use uma imagem JPG, PNG ou WebP.");
    if ((metadata.pages ?? 1) !== 1) throw new MediaError("Use uma imagem sem animação.");
    if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) throw new MediaError("A resolução da imagem é muito alta. Use uma foto de até 20 megapixels.");
    const size = kind === "avatar" || kind === "logo" ? 384 : kind === "cover" ? 1600 : 1200;
    // Decode, orient and encode anew. Sharp drops EXIF and other metadata.
    const { data, info } = await image.autoOrient()
      .resize({ width: size, height: kind === "cover" ? 900 : size, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78, effort: 4 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > MAX_STORED_IMAGE_BYTES) throw new MediaError("Não foi possível reduzir a imagem. Escolha uma foto menor.", 413);
    return { bytes: data, width: info.width, height: info.height };
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("A imagem está inválida ou tem resolução excessiva. Use JPG, PNG ou WebP.");
  }
}
