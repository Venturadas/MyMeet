import { expect, test } from "@playwright/test";
import { renderFixtures } from "./support/redesign-fixtures.cjs";

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920];
let fixtures: Record<string, string>;
test.beforeAll(async ({ baseURL }) => {
  fixtures = await renderFixtures(baseURL!);
});

for (const scenario of [
  "cliente",
  "agendamentos",
  "empresa",
  "perfil",
  "servicos",
  "publico",
]) {
  test(`layout real de ${scenario} cabe em celular, tablet e desktop sem dados de produção`, async ({
    page,
  }, testInfo) => {
    // Only fixture data. No authenticated session and no action may leave this page.
    await page.route("**/__isolated-action/**", (route) => route.abort());
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(fixtures[scenario], { waitUntil: "networkidle" });
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        `${scenario} em ${width}px`,
      ).toBeLessThanOrEqual(1);
      if (scenario !== "publico") {
        await expect(page.locator(".app-sidebar")).toBeVisible({
          visible: width >= 1024,
        });
        await expect(
          page.getByRole("navigation", {
            name: "Navegação no celular",
            exact: true,
          }),
        ).toBeVisible({ visible: width < 1024 });
        if (width < 1024) {
          const more = page.locator(".app-more > summary");
          await more.focus();
          await page.keyboard.press("Enter");
          await expect(page.locator(".app-more-panel")).toBeVisible();
          const rect = await page.locator(".app-more-panel").boundingBox();
          expect(rect!.x).toBeGreaterThanOrEqual(0);
          expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
          expect(rect!.y).toBeGreaterThanOrEqual(0);
          await more.click();
          await expect(page.locator(".app-more-panel")).toBeHidden();
        }
      }
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: testInfo.outputPath(`${scenario}-${width}.png`),
          fullPage: true,
        });
    }
  });
}

test("lista compacta preserva status, mensagens e ações por tipo de usuário", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.setContent(fixtures.agendamentos, { waitUntil: "networkidle" });
  await expect(page.locator(".appointment-row")).toHaveCount(4);
  await expect(page.locator(".status-confirmed")).toHaveText("Confirmado");
  await expect(page.locator(".status-pending")).toHaveText("Pendente");
  const first = page.locator(".appointment-row").first();
  await first.locator("summary").click();
  await expect(
    first.getByRole("link", { name: "Reagendar", exact: true }),
  ).toBeVisible();
  await expect(
    first.getByRole("button", { name: "Cancelar", exact: true }),
  ).toBeVisible();
  await expect(
    first.getByRole("button", { name: "Confirmar", exact: true }),
  ).toHaveCount(0);
  expect(
    (await first.locator("summary").boundingBox())!.width,
  ).toBeGreaterThanOrEqual(44);
  await page.setContent(fixtures.empresa, { waitUntil: "networkidle" });
  const pending = page.locator(".appointment-row").nth(1);
  await pending.locator("summary").click();
  await expect(
    pending.getByRole("button", { name: "Confirmar", exact: true }),
  ).toBeVisible();
  await expect(pending.getByLabel("Mensagem visível ao cliente")).toBeVisible();
  await expect(pending).toContainText("Mensagem de teste de layout");
});

test("perfil e agendamento mantêm formulários e seleção acessíveis por teclado", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.setContent(fixtures.empresa, { waitUntil: "networkidle" });
  await page.locator(".business-report-details > summary").click();
  await expect(page.getByRole("table")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.setContent(fixtures.perfil, { waitUntil: "networkidle" });
  await expect(
    page.getByLabel("Nome da empresa", { exact: true }),
  ).toBeVisible();
  const location = page.locator(".company-form-section").nth(1);
  await location.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Endereço", { exact: true })).toBeVisible();
  await page.setContent(fixtures.publico, { waitUntil: "networkidle" });
  const radio = page.getByRole("radio").first();
  await radio.focus();
  await page.keyboard.press("Space");
  await expect(radio).toBeChecked();
  await expect(
    page.getByRole("img", { name: /Avatar de Cliente/ }),
  ).toBeVisible();
  await expect(
    page.getByText("Ainda não há fotos", { exact: true }),
  ).toBeVisible();
});

test("páginas públicas mantêm busca e formulários em todas as larguras", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/entrar?form=signup",
      "/empresas",
      "/planos",
      "/privacidade",
      "/agendar/agenda-indisponivel",
      "/pagina-inexistente",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        `${path} em ${width}px`,
      ).toBeLessThanOrEqual(1);
    }
  }
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Nome da empresa" })
    .fill("Empresa de consulta");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(page).toHaveURL(/\/empresas\?q=Empresa\+de\+consulta$/);
  await expect(
    page.getByRole("searchbox", { name: "Nome da empresa" }),
  ).toHaveValue("Empresa de consulta");
});
