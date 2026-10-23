import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  providerDate, safePixCode, safePixQrBase64, safePixTicketUrl, trustedBillingOrigin,
  validPaymentId, verifiedPixPayment, verifyMercadoPagoSignature, type ProviderPayment,
} from "../lib/billing-policy";

const now = Date.parse("2026-01-31T12:00:00Z");
const reference = "b2c81375-a41d-4d7d-b145-3b26d8b718cb";
const payment: ProviderPayment = {
  id: 789, status: "approved", collector_id: 123, payment_method_id: "pix", live_mode: true,
  external_reference: reference, currency_id: "BRL", transaction_amount: 14.99,
  transaction_amount_refunded: 0, date_approved: "2026-01-31T12:00:00Z",
  date_last_updated: "2026-01-31T12:00:00Z", date_of_expiration: "2026-01-31T12:30:00Z",
};

test("Pix aprovado exige referência, recebedor, método, valor e produção corretos", () => {
  expect(verifiedPixPayment(payment, reference, 123, now)).toEqual({
    id: "789", status: "approved", reference, merchantId: "123",
    paidAt: "2026-01-31T12:00:00.000Z", eventAt: "2026-01-31T12:00:00.000Z",
    expiresAt: "2026-01-31T12:30:00.000Z",
  });
  for (const change of [
    { external_reference: "another-user-reference" }, { collector_id: 999 },
    { payment_method_id: "visa" }, { currency_id: "USD" }, { transaction_amount: 0.99 },
    { transaction_amount: 14.991 }, { transaction_amount: Number.NaN }, { live_mode: false },
    { date_approved: undefined }, { date_last_updated: "2027-01-31T12:00:00Z" },
    { date_approved: "2027-01-31T12:00:00Z" }, { date_approved: "2026-01-31T12:00:00" },
    { date_of_expiration: "invalid" }, { transaction_amount_refunded: -0.01 },
    { transaction_amount_refunded: 15 }, { transaction_amount_refunded: Number.NaN },
    { id: "../users/me" }, { id: "0" }, { id: Number.MAX_SAFE_INTEGER + 1 }, { status: "authorized" },
  ]) expect(verifiedPixPayment({ ...payment, ...change }, reference, 123, now)).toBeNull();
  expect(verifiedPixPayment(payment, reference, 999, now)).toBeNull();
  expect(verifiedPixPayment(payment, "bbbbb", 123, now)).toBeNull();
});

test("estados pendentes e cancelados não são convertidos em aprovação", () => {
  for (const status of ["pending", "in_process", "rejected", "cancelled"]) {
    const result = verifiedPixPayment({ ...payment, status, date_approved: null }, reference, 123, now);
    expect(result?.status).toBe(status === "in_process" ? "pending" : status);
    expect(result?.paidAt).toBeNull();
  }
  for (const status of ["refunded", "charged_back"]) {
    expect(verifiedPixPayment({ ...payment, status }, reference, 123, now)?.status).toBe(status);
  }
  // Any amount refunded blocks access, including an otherwise still-approved resource.
  expect(verifiedPixPayment({ ...payment, transaction_amount_refunded: 0.01 }, reference, 123, now)?.status).toBe("refunded");
});

test("data de pagamento original permanece original quando webhook chega atrasado", () => {
  const delayedNow = now + 60 * 86400_000;
  expect(verifiedPixPayment(payment, reference, 123, delayedNow)?.paidAt).toBe("2026-01-31T12:00:00.000Z");
  expect(providerDate("2026-01-31T09:00:00-03:00")?.toISOString()).toBe("2026-01-31T12:00:00.000Z");
  for (const value of [undefined, "invalid", "2026-01-31T12:00:00", "2026-01-31", "2026-02-30T12:00:00Z", "2026-13-01T12:00:00Z", 123]) expect(providerDate(value)).toBeNull();
});

test("webhook autentica o ID assinado, rejeita adulteração e replay fora de cinco minutos", () => {
  const secret = "test-secret-without-live-credentials";
  const ts = String(now / 1000);
  const digest = createHmac("sha256", secret).update(`id:789;request-id:request_123;ts:${ts};`).digest("hex");
  const headers = new Headers({ "x-request-id": "request_123", "x-signature": `ts=${ts},v1=${digest}` });
  const url = new URL("https://nuvlink.example/api/billing/webhook?data.id=789&type=payment");
  expect(verifyMercadoPagoSignature(url, headers, secret, now)).toBe("789");
  expect(verifyMercadoPagoSignature(url, headers, secret, now + 300_001)).toBeNull();
  expect(verifyMercadoPagoSignature(url, headers, secret, now - 300_001)).toBeNull();
  expect(verifyMercadoPagoSignature(url, headers, "wrong-secret", now)).toBeNull();
  expect(verifyMercadoPagoSignature(url, headers, "", now)).toBeNull();
  for (const query of ["data.id=790", "data.id=789&data.id=789", "data.id=789&data.id=790", "data.id=../users/me", "data.id=789a", "id=789", "data.id=0"]) {
    expect(verifyMercadoPagoSignature(new URL(`https://nuvlink.example/?${query}`), headers, secret, now)).toBeNull();
  }
  for (const signature of [`ts=${ts},v1=${digest},v1=${digest}`, `ts=${ts},v1=not-hex`, `ts=${ts}`, `v1=${digest}`, `ts=${ts},ts=${ts},v1=${digest}`]) {
    const tampered = new Headers(headers); tampered.set("x-signature", signature);
    expect(verifyMercadoPagoSignature(url, tampered, secret, now)).toBeNull();
  }
  const missingRequest = new Headers(headers); missingRequest.delete("x-request-id");
  expect(verifyMercadoPagoSignature(url, missingRequest, secret, now)).toBeNull();
  const tsMillis = String(now);
  const digestMillis = createHmac("sha256", secret).update(`id:789;request-id:request_123;ts:${tsMillis};`).digest("hex");
  const millisHeaders = new Headers({ "x-request-id": "request_123", "x-signature": `ts=${tsMillis},v1=${digestMillis}` });
  expect(verifyMercadoPagoSignature(url, millisHeaders, secret, now)).toBe("789");
});

test("origem e ticket de pagamento rejeitam protocolos, usuários e domínios indevidos", () => {
  expect(trustedBillingOrigin("https://nuvlink.example/")).toBe("https://nuvlink.example");
  for (const value of ["http://nuvlink.example", "https://user@nuvlink.example", "https://nuvlink.example:444", "https://nuvlink.example/path", "https://nuvlink.example/?query=1", "https://nuvlink.example/#hash", undefined]) expect(trustedBillingOrigin(value)).toBeNull();
  expect(safePixTicketUrl("https://www.mercadopago.com.br/payments/789/ticket")).toBe("https://www.mercadopago.com.br/payments/789/ticket");
  for (const value of ["https://www.mercadopago.com.br.evil.example/payments/789/ticket", "javascript:alert(1)", "https://user@www.mercadopago.com.br/payments/789/ticket", "https://www.mercadopago.com.br/subscriptions/checkout", "http://www.mercadopago.com.br/payments/789/ticket", "/planos"]) expect(safePixTicketUrl(value)).toBeNull();
  for (const value of ["01", "0", "789a", "../payments/789", "1".repeat(21), 789]) expect(validPaymentId(value)).toBe(false);
});

test("código Pix e imagem só aceitam conteúdo limitado e PNG", () => {
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6I4UAAAAASUVORK5CYII=";
  expect(safePixQrBase64(png)).toBe(png);
  for (const value of ["data:image/png;base64," + png, Buffer.from("<svg onload='alert(1)'/>").toString("base64"), "A".repeat(300004), "bad-base64", ""]) expect(safePixQrBase64(value)).toBeNull();
  const oversizedDimensions = Buffer.from(png, "base64"); oversizedDimensions.writeUInt32BE(999999, 16);
  expect(safePixQrBase64(oversizedDimensions.toString("base64"))).toBeNull();
  expect(safePixCode("000201" + "0".repeat(300))).toBe("000201" + "0".repeat(300));
  for (const value of ["javascript:alert(1)", "000201\n" + "0".repeat(100), "000201" + "0".repeat(4091), "000201"]) expect(safePixCode(value)).toBeNull();
});

test("endpoints fecham cobranças e dados quando o ambiente de teste não tem configuração", async ({ request }) => {
  const forbidden = await request.post("/api/billing/checkout", { headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" }, data: { amount: 0.01, user_id: reference } });
  expect(forbidden.status()).toBe(403);
  expect(forbidden.headers()["cache-control"]).toBe("private, no-store");
  const status = await request.get("/api/billing/status");
  expect(status.status()).toBe(503);
  expect(status.headers()["cache-control"]).toBe("private, no-store");
  expect(await status.json()).toEqual({ error: "Pagamento indisponível no momento." });
  expect((await request.post("/api/billing/webhook?data.id=789", { data: { type: "payment", data: { id: 789 }, status: "approved" } })).status()).toBe(503);
  expect((await request.get("/api/billing/checkout")).status()).toBe(405);
});
