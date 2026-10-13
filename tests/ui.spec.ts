import { test, expect } from "@playwright/test";

const publicPaths = ["/", "/entrar", "/empresas", "/planos", "/privacidade"];

test("links de acesso inválidos ficam no site e não podem ser armazenados", async ({
  request,
}) => {
  const paths = [
    "/auth/callback",
    "/auth/callback?code=invalid&next=https%3A%2F%2Fexample.invalid",
    "/auth/confirm",
    "/auth/confirm?token_hash=" +
      "a".repeat(64) +
      "&type=signup&next=https%3A%2F%2Fexample.invalid",
    "/auth/confirm?token_hash=" + "a".repeat(64) + "&type=recovery&type=signup",
  ];
  for (const path of paths) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const destination = new URL(response.headers().location);
    expect(destination.origin).toBe(new URL(response.url()).origin);
    expect(destination.pathname).toBe("/entrar");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["referrer-policy"]).toBe("no-referrer");
  }
});

test("páginas públicas usam NuvemMeet e não oferecem demonstração", async ({
  page,
}) => {
  for (const path of publicPaths) {
    await page.goto(path);
    await expect(page).toHaveTitle(/NuvemMeet/);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.locator("body")).not.toContainText(
      /MyMeet|demonstração|dados fictícios/i,
    );
    await expect(page.locator('a[href^="/demo"]')).toHaveCount(0);
  }
  const response = await page.goto("/demo");
  expect(response?.status()).toBe(404);
});

test("início dá acesso direto à busca, ao plano e ao login", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('a[href="/empresas"]').first().click();
  await expect(page).toHaveURL(/\/empresas$/);
  await expect(
    page.getByRole("searchbox", { name: "Nome da empresa" }),
  ).toBeVisible();
  await page.goto("/");
  await page.locator('a[href="/planos"]').first().click();
  await expect(page).toHaveURL(/\/planos$/);
  await page.goto("/");
  await page.locator('a[href="/entrar"]').first().click();
  await expect(page).toHaveURL(/\/entrar$/);
});

test("login, conta gratuita e recuperação explicam a configuração pendente", async ({
  page,
}) => {
  await page.goto("/entrar");
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.locator('input[autocomplete="current-password"]'),
  ).toBeVisible();
  await page.getByText("Esqueci minha senha", { exact: true }).click();
  await expect(
    page.getByLabel("E-mail da conta", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar recuperação", exact: true }),
  ).toBeDisabled();
  await page.getByText("Crie sua conta grátis", { exact: true }).click();
  await expect(
    page.locator('input[autocomplete="new-password"]'),
  ).toBeVisible();
  await expect(page.locator('input[name="privacy"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Criar conta grátis", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("main")).toContainText(/grátis|gratuita/i);
});

test("envio manual de cadastro não contorna a configuração do backend", async ({
  page,
}) => {
  await page.goto("/entrar");
  await page.getByText("Crie sua conta grátis", { exact: true }).click();
  const form = page
    .locator("form")
    .filter({
      has: page.getByRole("button", {
        name: "Criar conta grátis",
        exact: true,
      }),
    });
  const actionName = await form
    .locator('input[name^="$ACTION_ID_"]')
    .first()
    .getAttribute("name");
  expect(actionName).toBeTruthy();
  const response = await page.request.post("/entrar", {
    multipart: {
      [actionName!]: "",
      name: "Verificação de acesso",
      email: "verificacao@example.invalid",
      password: crypto.randomUUID(),
      privacy: "on",
      next: "https://example.invalid",
    },
    headers: { Origin: new URL(page.url()).origin },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  const destination = new URL(response.headers().location, page.url());
  expect(destination.origin).toBe(new URL(page.url()).origin);
  expect(destination.pathname).toBe("/entrar");
  expect(destination.searchParams.get("error")).toBeTruthy();
  expect(destination.searchParams.get("error")).not.toMatch(
    /demo|demonstração/i,
  );
});

test("busca é pública, preserva o termo e rejeita parâmetros repetidos", async ({
  page,
}) => {
  await page.goto("/empresas");
  await expect(
    page.getByRole("heading", { name: "Encontrar empresas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sair", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Nome da empresa" })
    .fill("Empresa 100%_* (nome)");
  await page
    .getByRole("button", { name: "Buscar empresas", exact: true })
    .click();
  expect(new URL(page.url()).searchParams.get("q")).toBe(
    "Empresa 100%_* (nome)",
  );
  await expect(page.getByRole("searchbox")).toHaveValue(
    "Empresa 100%_* (nome)",
  );
  await expect(page.locator("main")).toContainText(
    /conexão|configurad|indisponível/i,
  );
  await expect(
    page.getByRole("heading", { name: "Ainda não há empresas cadastradas" }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Limpar busca", exact: true }).click();
  await expect(page).toHaveURL(/\/empresas$/);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.goto("/empresas?q=um&q=dois");
  await expect(page.locator(".notice.error[role=alert]")).toContainText(
    /nome|80 caracteres/,
  );
});

test("plano diferencia clientes gratuitos de empresa paga sem cobrar sem configuração", async ({
  page,
}) => {
  await page.goto("/planos");
  await expect(page.locator("main")).toContainText(/14,99/);
  await expect(page.locator("main")).toContainText(/gratuit|grátis/i);
  await expect(page.locator("main")).toContainText(/Pix/i);
  await expect(page.locator("main")).not.toContainText(
    /cobrança automática|recorrente pelo Mercado Pago/i,
  );
  await expect(
    page.locator('form[action="/api/billing/checkout"] button:enabled'),
  ).toHaveCount(0);
  const loginLink = page
    .locator('a[href^="/entrar?next="]')
    .filter({ hasText: /entrar|assinar/i })
    .first();
  await expect(loginLink).toBeVisible();
  expect(
    new URL(
      (await loginLink.getAttribute("href")) || "",
      page.url(),
    ).searchParams.get("next"),
  ).toBe("/planos");
});

test("painéis, recuperação e reagendamento exigem uma sessão real", async ({
  page,
  request,
}) => {
  for (const path of [
    "/cliente",
    "/empresa",
    "/recuperar",
    "/reagendar/00000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar(?:\?|$)/);
  }
  const exported = await request.get("/api/me/export");
  expect(exported.status()).toBe(503);
  expect(exported.headers()["cache-control"]).toContain("no-store");
  await page.goto("/agendar/empresa-sem-conexao");
  await expect(page.locator("h1")).toBeVisible();
  await expect(page.locator('input[name="starts_at"]')).toHaveCount(0);
  await expect(page.locator('a[href^="/demo"]')).toHaveCount(0);
});

test("privacidade continua acessível e o ícone corresponde à marca", async ({
  page,
  request,
}) => {
  await page.goto("/privacidade");
  await expect(page.locator("main")).toContainText(/Contato de privacidade/i);
  await expect(page.locator("main")).toContainText(/exclusão|apagamento/i);
  await expect(page.locator("main")).toContainText(/acesso|export/i);
  const response = await request.get("/icon");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect((await response.body()).byteLength).toBeLessThan(5000);
});

test("rotas públicas e estados vazios cabem em celulares de 320 e 390px", async ({
  page,
}) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of [
      ...publicPaths,
      "/agendar/empresa-sem-conexao",
      "/demo",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      if (path === "/entrar") {
        await page.getByText("Esqueci minha senha", { exact: true }).click();
        await page.getByText("Crie sua conta grátis", { exact: true }).click();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
        `Transbordamento em ${path}, ${width}px`,
      ).toBeLessThanOrEqual(1);
      await expect(page.locator('a[href^="/demo"]')).toHaveCount(0);
    }
  }
});
