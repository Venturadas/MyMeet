import "server-only";
import QRCode from "qrcode";

export async function publicBusinessLink(slug: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (
    !configured ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    slug.length < 3 ||
    slug.length > 60
  )
    return null;

  let site: URL;
  try {
    site = new URL(configured);
  } catch {
    return null;
  }
  const localDevelopment =
    process.env.NODE_ENV !== "production" &&
    site.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if (
    (site.protocol !== "https:" && !localDevelopment) ||
    site.username ||
    site.password ||
    site.pathname !== "/" ||
    site.search ||
    site.hash
  )
    return null;

  const url = new URL(`/agendar/${slug}`, site.origin).href;
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(url, {
      type: "image/png",
      width: 256,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#183153", light: "#FFFFFF" },
    });
  } catch {
    // Compartilhar o link permanece disponível se a imagem não puder ser gerada.
  }
  return { url, qrDataUrl };
}
