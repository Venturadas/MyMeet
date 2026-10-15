import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { compressImage } from "../lib/media-processing";
import { MAX_MULTIPART_BYTES, readBoundedBody } from "../lib/media-request";
import { avatarImageUrl, companyImageUrl, isMediaPath } from "../lib/media-path";

test("an actual image is resized, oriented and stripped of identifying metadata", async () => {
  const input = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#1679dd" } })
    .jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Private test fixture" } } }).toBuffer();
  const output = await compressImage(input, "avatar");
  const metadata = await sharp(output.bytes).metadata();
  expect(metadata.format).toBe("webp");
  expect(metadata.width).toBe(192);
  expect(metadata.height).toBe(384);
  expect(metadata.orientation).toBeUndefined();
  expect(metadata.exif).toBeUndefined();
  expect(output.bytes.length).toBeLessThan(30_000);
});

test("the decoder rejects mislabeled SVG, corrupt files and oversized pixel input", async () => {
  await expect(compressImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'), "logo")).rejects.toThrow();
  await expect(compressImage(Buffer.from("not a photo"), "gallery")).rejects.toThrow();
  const huge = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "white" } }).png().toBuffer();
  await expect(compressImage(huge, "cover")).rejects.toThrow();
});

test("the decoder rejects animated WebP instead of processing many frames", async () => {
  const frames = Buffer.alloc(10 * 20 * 3);
  frames.fill(50, 0, 10 * 10 * 3);
  frames.fill(200, 10 * 10 * 3);
  const animated = await sharp(frames, { raw: { width: 10, height: 20, pageHeight: 10, channels: 3 } })
    .webp({ loop: 0, delay: [100, 100] }).toBuffer();
  expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
  await expect(compressImage(animated, "gallery")).rejects.toThrow("sem animação");
});

test("streaming requests are capped before parsing even without Content-Length", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_MULTIPART_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } });
  const request = new Request("https://nuvemmeet.vercel.app/api/media/upload", { method: "POST", body, duplex: "half" } as RequestInit);
  await expect(readBoundedBody(request)).rejects.toThrow("muito grande");
});

test("media references reject external URLs and traversal; avatars never reveal a storage URL", () => {
  const path = "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002.webp";
  expect(isMediaPath(path)).toBe(true);
  for (const invalid of [`https://attacker.test/${path}`, `../${path}`, `${path}?secret=x`, path.replace(".webp", ".svg"), path.replace("/", "/../")]) {
    expect(isMediaPath(invalid)).toBe(false);
    expect(companyImageUrl(invalid)).toBeNull();
    expect(avatarImageUrl(invalid)).toBeNull();
  }
  expect(avatarImageUrl(path)).toBe("/api/media/avatar?v=20000000-0000-4000-8000-000000000002");
  expect(avatarImageUrl(path)).not.toContain("10000000");
});

test("private avatar responses never enter shared caches and uploads reject cross-site requests", async ({ request }) => {
  const avatar = await request.get("/api/media/avatar");
  expect([401, 503]).toContain(avatar.status());
  expect(avatar.headers()["cache-control"]).toContain("private, no-store");
  const upload = await request.post("/api/media/upload?kind=avatar", {
    headers: { Origin: "https://attacker.test", "Sec-Fetch-Site": "cross-site" },
    multipart: { kind: "avatar", file: { name: "photo.png", mimeType: "image/png", buffer: Buffer.from("invalid") } },
  });
  expect(upload.status()).toBe(403);
  expect(upload.headers()["cache-control"]).toContain("private, no-store");
});
