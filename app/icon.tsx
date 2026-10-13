import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function Icon() {
  const image = await readFile(
    join(process.cwd(), "public/brand/nuvemmeet-icon.png"),
  );
  return new ImageResponse(
    (
      <img
        src={`data:image/png;base64,${image.toString("base64")}`}
        width={32}
        height={32}
        alt=""
      />
    ),
    size,
  );
}
