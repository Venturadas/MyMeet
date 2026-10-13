import { test, expect } from "@playwright/test";

test("links de confirmação inválidos não redirecionam para fora do site", async ({
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

test("cadastro fechado também rejeita envio manual à Server Action", async ({
  page,
}) => {
  await page.goto("/entrar");
  await expect(
    page.getByText("Novas contas estarão disponíveis em breve.", {
      exact: false,
    }),
  ).toBeVisible();
  const button = page.getByRole("button", {
    name: "Criar minha conta",
    exact: true,
  });
  await expect(button).toBeDisabled();
  const actionName = await button
    .locator("..")
    .locator('input[name^="$ACTION_ID_"]')
    .first()
    .getAttribute("name");
  expect(actionName).toBeTruthy();
  const response = await page.request.post("/entrar", {
    multipart: {
      [actionName!]: "",
      name: "Cliente fictício",
      email: "ficticio@example.invalid",
      password: crypto.randomUUID(),
      privacy: "on",
    },
    headers: { Origin: new URL(page.url()).origin },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(303);
  expect(decodeURIComponent(response.headers().location)).toContain(
    "Novas contas estarão disponíveis em breve",
  );
});

test("cliente agenda e empresa confirma, comenta, reagenda e cancela", async ({
  page,
}) => {
  await page.goto("/demo");
  await expect(
    page.getByText("Demonstração · dados fictícios, nada é enviado"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "09:00 indisponível", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "10:00 disponível", exact: true })
    .click();
  await page.getByRole("button", { name: "Agendar às 10:00" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Seu agendamento de exemplo está aguardando confirmação",
  );
  const booked = page
    .locator(".appointment-card")
    .filter({ hasText: "14 de outubro · 10:00" });
  await expect(booked).toHaveCount(1);
  await expect(booked.locator(".status")).toHaveText("A confirmar");
  await page.getByRole("button", { name: "Sou empresa" }).click();
  await booked.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(booked.locator(".status")).toHaveText("Confirmado");
  await booked.getByRole("button", { name: "Comentário", exact: true }).click();
  await booked
    .getByRole("textbox")
    .fill("Comentário fictício para o próximo encontro.");
  await booked.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(booked).toContainText(
    "Comentário fictício para o próximo encontro.",
  );
  await booked.getByRole("button", { name: "Reagendar", exact: true }).click();
  await booked.getByLabel("Dia", { exact: true }).selectOption("15 de outubro");
  await booked.getByLabel("Horário", { exact: true }).selectOption("10:00");
  await booked.getByRole("button", { name: "Salvar alteração" }).click();
  const rescheduled = page
    .locator(".appointment-card")
    .filter({ hasText: "15 de outubro · 10:00" });
  await expect(rescheduled).toHaveCount(1);
  await expect(rescheduled.locator(".status")).toHaveText("A confirmar");
  await rescheduled
    .getByRole("button", { name: "Cancelar", exact: true })
    .click();
  await expect(rescheduled.locator(".status")).toHaveText("Cancelado");
  await page.getByRole("button", { name: "Sou cliente" }).click();
  await expect(
    page.locator(".metric").filter({ hasText: "Quanto já gastei" }),
  ).toContainText(/R\$\s*120,00/);
  await page.getByRole("button", { name: "15 Outubro", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "10:00 disponível", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.locator(".appointment-card")).toHaveCount(3);
  await expect(
    page.getByText("Comentário fictício para o próximo encontro.", {
      exact: true,
    }),
  ).toHaveCount(0);
});

test("total gasto soma somente serviços concluídos", async ({ page }) => {
  await page.goto("/demo");
  const spending = page
    .locator(".metric")
    .filter({ hasText: "Quanto já gastei" });
  await expect(spending).toContainText(/R\$\s*120,00/);
  await page.getByRole("button", { name: "Sou empresa" }).click();
  const appointment = page
    .locator(".appointment-card")
    .filter({ hasText: "14 de outubro · 09:00" });
  await appointment
    .getByRole("button", { name: "Concluir serviço", exact: true })
    .click();
  await expect(appointment.locator(".status")).toHaveText("Concluído");
  await page.getByRole("button", { name: "Sou cliente" }).click();
  await expect(spending).toContainText(/R\$\s*240,00/);
});

test("página inicial leva à demo, ao acesso e à privacidade", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Seu tempo,bem agendado.",
  );
  await page.getByRole("link", { name: "Explorar a demo" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Começar agora" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(
    page.getByText("O acesso real aguarda a conexão com Supabase.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Entrar", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Criar minha conta", exact: true }),
  ).toBeDisabled();
  await page.goto("/");
  await page.getByRole("link", { name: "Como cuidamos dos dados" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(
    page.getByRole("heading", { name: "Seus dados têm um propósito." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Quem pode acessar" }),
  ).toBeVisible();
});

test("painéis protegidos pedem acesso e agenda real informa conexão pendente", async ({
  page,
}) => {
  for (const path of [
    "/cliente",
    "/empresa",
    "/reagendar/00000000-0000-4000-8000-000000000001",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/entrar(?:\?|$)/);
  }
  await page.goto("/agendar/estudio-exemplo");
  await expect(
    page.getByRole("heading", { name: "A agenda está sendo preparada." }),
  ).toBeVisible();
  await expect(
    page.getByText("O acesso real aguarda a conexão com Supabase."),
  ).toBeVisible();
});

test("conteúdo cabe em celular de 320px e a demo mantém aviso ao rolar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  for (const path of [
    "/",
    "/demo",
    "/entrar",
    "/privacidade",
    "/agendar/exemplo",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
      `Transbordamento em ${path}`,
    ).toBeLessThanOrEqual(0);
  }
  await page.goto("/demo");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(
    page.getByText("Demonstração · dados fictícios, nada é enviado"),
  ).toBeVisible();
  expect(
    await page
      .locator(".demo-banner")
      .evaluate((element) => element.getBoundingClientRect().top),
  ).toBe(0);
});
