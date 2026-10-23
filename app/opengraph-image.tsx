import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "NuvLink — Encontre. Agende. Conecte.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const runtime = "nodejs";

export default async function OpenGraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/logo-full.png"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 32,
          background: "linear-gradient(135deg, #FFFFFF, #EAF4FF)",
          color: "#0B2D6B",
        }}
      >
        <img
          src={`data:image/png;base64,${logo.toString("base64")}`}
          width={960}
          height={224}
          alt="NuvLink"
        />
        <div style={{ display: "flex", fontSize: 38 }}>
          Encontre. Agende. Conecte.
        </div>
      </div>
    ),
    size,
  );
}
