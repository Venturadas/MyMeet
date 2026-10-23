import { expect, test } from "@playwright/test";
import sharp from "sharp";

const description =
  "NuvLink conecta clientes e negócios por meio de agendamentos simples, rápidos e online.";
const legacyBrand = /Nuvem\s*Meet|My\s*Meet/i;

// Keep old names in this negative assertion so a regression is detected.
test("metadados do navegador e das redes sociais identificam o NuvLink", async ({ page, request }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("NuvLink");
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute("content", description);
  }
  for (const selector of [
    'meta[name="application-name"]',
    'meta[name="apple-mobile-web-app-title"]',
    'meta[property="og:site_name"]',
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ]) {
    await expect(page.locator(selector)).toHaveAttribute("content", "NuvLink");
  }
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#2F80FF");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  // URLs retain the existing production domain; inspect only human-facing metadata.
  const textMetadata = await page.locator("meta[content]").evaluateAll((metas) =>
    metas
      .map((meta) => meta.getAttribute("content") || "")
      .filter((content) => !/^https?:\/\//.test(content)),
  );
  expect(textMetadata.join(" ")).not.toMatch(legacyBrand);
  const checkedImages = new Set<string>();
  for (const selector of ['meta[property="og:image"]', 'meta[name="twitter:image"]']) {
    const content = await page.locator(selector).getAttribute("content");
    expect(content).toBeTruthy();
    const imageUrl = new URL(content!);
    expect(["http:", "https:"]).toContain(imageUrl.protocol);
    // Request local generation without depending on a deployed site.
    const path = imageUrl.pathname + imageUrl.search;
    if (checkedImages.has(path)) continue;
    checkedImages.add(path);
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const image = await sharp(await response.body()).metadata();
    expect([image.width, image.height]).toEqual([1200, 630]);
  }
});

test("manifesto instalável e ícones entregam a nuvem nos tamanhos anunciados", async ({ page, request }) => {
  await page.goto("/");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
  const response = await request.get(manifestHref!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("manifest+json");
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    id: "/", name: "NuvLink", short_name: "NuvLink", description,
    start_url: "/", scope: "/", lang: "pt-BR", display: "standalone",
    theme_color: "#2F80FF", background_color: "#FFFFFF",
  });
  expect(JSON.stringify(manifest)).not.toMatch(legacyBrand);
  for (const purpose of ["any", "maskable"]) {
    for (const size of [192, 512]) {
      const icon = manifest.icons.find((entry: { purpose: string; sizes: string }) =>
        entry.purpose === purpose && entry.sizes === `${size}x${size}`,
      );
      expect(icon).toBeTruthy();
      const asset = await request.get(icon.src);
      expect(asset.status()).toBe(200);
      expect(asset.headers()["content-type"]).toContain("image/png");
      const image = await sharp(await asset.body()).metadata();
      expect([image.width, image.height]).toEqual([size, size]);
    }
  }
  for (const size of [16, 32, 48, 180]) {
    const icon = await request.get(`/brand/icon-${size}.png`);
    expect(icon.status()).toBe(200);
    const image = await sharp(await icon.body()).metadata();
    expect([image.width, image.height]).toEqual([size, size]);
  }
  const touchIcon = page.locator('link[rel="apple-touch-icon"]');
  await expect(touchIcon).toHaveAttribute("href", "/brand/icon-180.png");
  await expect(touchIcon).toHaveAttribute("sizes", "180x180");
  const favicon = await request.get("/favicon.ico");
  expect(favicon.status()).toBe(200);
  const ico = await favicon.body();
  expect(ico.readUInt16LE(0)).toBe(0);
  expect(ico.readUInt16LE(2)).toBe(1);
  expect(ico.readUInt16LE(4)).toBe(3);
  expect([ico[6], ico[22], ico[38]]).toEqual([16, 32, 48]);
  const legacyIcon = await request.get("/icon");
  expect(legacyIcon.status()).toBe(200);
  const image = await sharp(await legacyIcon.body()).metadata();
  expect([image.width, image.height]).toEqual([32, 32]);
});

test("a marca permanece visível e proporcional no desktop, tablet e celular", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/entrar", "/empresas", "/planos", "/privacidade"]) {
      await page.goto(path);
      const brand = page.locator(".brand-logo img[alt='NuvLink']").first();
      await expect(brand).toBeVisible();
      await expect.poll(() => brand.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
      const dimensions = await brand.evaluate((image: HTMLImageElement) => {
        const rect = image.getBoundingClientRect();
        return {
          ratio: rect.width / rect.height,
          naturalRatio: image.naturalWidth / image.naturalHeight,
          left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height,
        };
      });
      expect(dimensions.width).toBeGreaterThan(24);
      expect(dimensions.height).toBeGreaterThan(16);
      expect(Math.abs(dimensions.ratio / dimensions.naturalRatio - 1)).toBeLessThan(0.02);
      expect(dimensions.left).toBeGreaterThanOrEqual(0);
      expect(dimensions.right).toBeLessThanOrEqual(width);
      expect(dimensions.top).toBeGreaterThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${path} em ${width}px`).toBeLessThanOrEqual(1);
    }
  }
});
