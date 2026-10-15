export const COMPANY_MEDIA_BUCKET = "company-images";
export const AVATAR_MEDIA_BUCKET = "user-avatars";
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_STORED_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 12;

export const MEDIA_KINDS = ["logo", "cover", "gallery", "professional", "avatar"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const objectPath = new RegExp(`^${uuid}/${uuid}\\.webp$`);
const recordId = new RegExp(`^${uuid}$`);

export function isMediaPath(path: unknown): path is string {
  return typeof path === "string" && objectPath.test(path);
}
export function isMediaRecordId(id: unknown): id is string {
  return typeof id === "string" && recordId.test(id);
}
export function companyImageUrl(path: unknown): string | null {
  if (!isMediaPath(path)) return null;
  try {
    const origin = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
    if (origin.protocol !== "https:" || origin.username || origin.password) return null;
    return `${origin.origin}/storage/v1/object/public/${COMPANY_MEDIA_BUCKET}/${path}`;
  } catch { return null; }
}
export function avatarImageUrl(path: unknown): string | null {
  if (!isMediaPath(path)) return null;
  // Identity is derived from the session by the route, never from this suffix.
  return `/api/media/avatar?v=${path.slice(path.lastIndexOf("/") + 1, -5)}`;
}
