import { expect, test } from "@playwright/test";
import { safeAuthDestination, safeEmailRedirectDestination } from "../lib/auth-navigation";
import { signInInput, signUpInput } from "../lib/auth-input";
import { createRecoveryProof, RECOVERY_GRANT_SECONDS, sessionIdentityFromVerifiedAccessToken, verifyRecoveryProof } from "../lib/auth-recovery-proof";

test("recuperação exige prova assinada recente e vinculada ao usuário e à sessão", () => {
  const now = Date.parse("2026-10-15T12:00:00Z"), key = "isolated-test-key-".repeat(4);
  const identity = { userId: "00000000-0000-4000-8000-000000000001", sessionId: "00000000-0000-4000-8000-000000000002" };
  const proof = createRecoveryProof(identity, key, now);
  expect(proof).toBeTruthy();
  expect(verifyRecoveryProof(proof!, identity, key, now)).toBe(true);
  expect(verifyRecoveryProof(proof!, identity, key, now + (RECOVERY_GRANT_SECONDS - 1) * 1000)).toBe(true);
  expect(verifyRecoveryProof(proof!, identity, key, now + RECOVERY_GRANT_SECONDS * 1000)).toBe(false);
  expect(verifyRecoveryProof(proof!, identity, key, now - 1000)).toBe(false);
  expect(verifyRecoveryProof(proof!, { ...identity, userId: "00000000-0000-4000-8000-000000000003" }, key, now)).toBe(false);
  expect(verifyRecoveryProof(proof!, { ...identity, sessionId: "00000000-0000-4000-8000-000000000004" }, key, now)).toBe(false);
  const [payload, mac] = proof!.split(".");
  const changed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  changed.exp += RECOVERY_GRANT_SECONDS;
  expect(verifyRecoveryProof(`${Buffer.from(JSON.stringify(changed)).toString("base64url")}.${mac}`, identity, key, now)).toBe(false);
  expect(verifyRecoveryProof(`${payload}.${mac[0] === "A" ? "B" : "A"}${mac.slice(1)}`, identity, key, now)).toBe(false);
  for (const invalid of [undefined, "", "recovery=1", `${proof}.extra`, "a".repeat(600)]) expect(verifyRecoveryProof(invalid, identity, key, now)).toBe(false);
  expect(verifyRecoveryProof(proof!, identity, "another-isolated-key-".repeat(4), now)).toBe(false);
  expect(verifyRecoveryProof(proof!, identity, undefined, now)).toBe(false);
  expect(createRecoveryProof(identity, undefined, now)).toBeNull();
  expect(createRecoveryProof(identity, "short", now)).toBeNull();
});

test("vínculo da recuperação usa o session_id de um token previamente verificado", () => {
  const userId = "00000000-0000-4000-8000-000000000001", sessionId = "00000000-0000-4000-8000-000000000002";
  const token = (claims: object) => `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`;
  expect(sessionIdentityFromVerifiedAccessToken(token({ sub: userId, session_id: sessionId }), userId)).toEqual({ userId, sessionId });
  expect(sessionIdentityFromVerifiedAccessToken(token({ sub: userId, session_id: sessionId }), "00000000-0000-4000-8000-000000000003")).toBeNull();
  expect(sessionIdentityFromVerifiedAccessToken(token({ sub: userId }), userId)).toBeNull();
  expect(sessionIdentityFromVerifiedAccessToken("invalid", userId)).toBeNull();
});

test("retorno de autenticação preserva apenas destinos e seleções permitidos", () => {
  const booking = "/agendar/clinica?service=00000000-0000-4000-8000-000000000001&date=2026-10-14";
  expect(safeAuthDestination(booking)).toBe(booking);
  expect(safeAuthDestination("/planos")).toBe("/planos");
  expect(safeAuthDestination("/empresa?tab=agenda")).toBe("/empresa?tab=agenda");
  expect(safeAuthDestination("/cliente?tab=configuracoes")).toBe("/cliente?tab=configuracoes");
  for (const attack of ["https://example.invalid", "//example.invalid", "/\\example.invalid", "/cliente?tab=perfil&tab=configuracoes", "/planos?active=true", "/agendar/clinica?date=2026-02-30", "/agendar/clinica?service=invalid", "/agendar/clinica#token", "/cliente\n", ["/planos", "/cliente"]]) {
    expect(safeAuthDestination(attack, "")).toBe("");
  }
});

test("RedirectTo do e-mail exige origem exata e callback sem parâmetros ambíguos", () => {
  const site = "https://nuvemmeet.vercel.app";
  expect(safeEmailRedirectDestination(`${site}/auth/callback?next=%2Fplanos`, site)).toBe("/planos");
  for (const url of ["https://example.invalid/auth/callback?next=/planos", `${site}.example.invalid/auth/callback?next=/planos`, `${site}/auth/callback?next=//example.invalid`, `${site}/auth/callback?next=/planos&next=/cliente`, `${site}/other?next=/planos`, `${site}/auth/callback?next=/planos&code=arbitrary`, `${site}/auth/callback?next=/planos#token`]) {
    expect(safeEmailRedirectDestination(url, site)).toBe("");
  }
});

test("cadastro normaliza e-mail sem alterar senha e distingue campo inválido", () => {
  const form = new FormData();
  form.set("name", "  Pessoa de teste  ");
  form.set("email", "  teste@example.invalid  ");
  form.set("password", "  senha-exclusiva  ");
  form.set("privacy", "on");
  form.set("$ACTION_ID_ignored", "");
  const parsed = signUpInput(form);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toEqual({ name: "Pessoa de teste", email: "teste@example.invalid", password: "  senha-exclusiva  " });
  expect(signInInput(form).success).toBe(true);
  form.append("password", "another-password");
  expect(signInInput(form).success).toBe(false);
  form.set("password", "  senha-exclusiva  ");
  form.delete("privacy");
  expect(signUpInput(form)).toMatchObject({ success: false, message: expect.stringMatching(/privacidade/) });
  form.set("privacy", "on"); form.set("password", "curta");
  expect(signUpInput(form)).toMatchObject({ success: false, message: expect.stringMatching(/senha/) });
  form.set("password", "senha-exclusiva"); form.append("email", "outro@example.invalid");
  expect(signUpInput(form).success).toBe(false);
  expect(signInInput(form).success).toBe(false);
});

test("notificação móvel é segura, acessível e preserva o destino ao limpar feedback", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const params = new URLSearchParams({ notice: "<img src=x onerror=alert(1)>", notice_title: "Cadastro recebido", notice_type: "success", next: "/planos" });
  await page.goto(`/entrar?${params}`);
  const toast = page.locator(".nm-toast-success");
  await expect(toast).toBeVisible();
  await expect(toast.getByRole("status")).toContainText("<img src=x onerror=alert(1)>");
  await expect(toast.locator("img")).toHaveCount(0);
  await expect(page).toHaveURL(/next=%2Fplanos$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const close = toast.getByRole("button", { name: "Fechar notificação" });
  expect((await close.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await close.click();
  await expect(toast).toHaveCount(0);
});

test("toast respeita foco, expira e oferece modos de aviso e erro sem bloquear", async ({ page }) => {
  await page.clock.install();
  await page.goto("/entrar?notice=Confira+seu+e-mail&notice_type=info");
  const toast = page.locator(".nm-toast-info");
  await expect(toast).toBeVisible();
  const close = toast.getByRole("button", { name: "Fechar notificação" });
  await close.focus();
  await page.clock.fastForward(15000);
  await expect(toast).toBeVisible();
  await page.getByRole("button", { name: "Entrar", exact: true }).evaluate((button) => (button as HTMLElement).blur());
  await page.locator('input[autocomplete="current-password"]').focus();
  await page.clock.fastForward(8000);
  await page.clock.fastForward(200);
  await expect(toast).toHaveCount(0);
  await page.goto("/entrar?notice=Aten%C3%A7%C3%A3o&notice_type=warning");
  await expect(page.locator(".nm-toast-warning [role=status]")).toContainText("Atenção");
  await page.goto("/entrar?error=N%C3%A3o+foi+poss%C3%ADvel+entrar");
  await expect(page.locator(".nm-toast-error [role=alert]")).toContainText("Não foi possível entrar");
});
