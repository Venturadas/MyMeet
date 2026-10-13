import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  mercadoPagoCheckoutUrl,
  paidPeriodEnd,
  verifyMercadoPagoSignature,
  verifiedPaidPeriod,
  type ProviderSubscription,
  type ProviderInvoice,
  type ProviderPayment,
} from "../lib/billing-policy";

const now = Date.parse("2026-01-31T12:00:00Z");
const reference = "b2c81375-a41d-4d7d-b145-3b26d8b718cb";
const subscription: ProviderSubscription = {
  id: "subscription_123",
  status: "authorized",
  collector_id: 123,
  payer_id: 456,
  external_reference: reference,
  auto_recurring: {
    frequency: 1,
    frequency_type: "months",
    transaction_amount: 14.99,
    currency_id: "BRL",
  },
};
const invoice: ProviderInvoice = {
  id: "invoice_123",
  preapproval_id: "subscription_123",
  payer_id: 456,
  currency_id: "BRL",
  transaction_amount: 14.99,
  debit_date: "2026-01-31T12:00:00Z",
  payment: { id: 789, status: "approved" },
};
const payment: ProviderPayment = {
  id: 789,
  status: "approved",
  collector_id: 123,
  live_mode: true,
  currency_id: "BRL",
  transaction_amount: 14.99,
  transaction_amount_refunded: 0,
  date_approved: "2026-01-31T12:00:00Z",
  date_last_updated: "2026-01-31T12:00:00Z",
};

test("assinatura exige cobrança real aprovada da empresa e plano correto", () => {
  expect(
    verifiedPaidPeriod(subscription, invoice, payment, reference, 123, now)
      ?.end,
  ).toBe("2026-02-28T12:00:00.000Z");
  for (const change of [
    { status: "pending" },
    { status: "paused" },
    { status: "cancelled" },
    { external_reference: "another-checkout" },
    { collector_id: 999 },
    { auto_recurring: { ...subscription.auto_recurring, frequency: 12 } },
    {
      auto_recurring: {
        ...subscription.auto_recurring,
        transaction_amount: 0.99,
      },
    },
    {
      auto_recurring: { ...subscription.auto_recurring, free_trial: "1 month" },
    },
  ])
    expect(
      verifiedPaidPeriod(
        { ...subscription, ...change },
        invoice,
        payment,
        reference,
        123,
        now,
      ),
    ).toBeNull();
  for (const change of [
    { status: "pending" },
    { status: "refunded" },
    { status: "charged_back" },
    { collector_id: 999 },
    { id: 999 },
    { currency_id: "ARS" },
    { transaction_amount: 0.99 },
    { transaction_amount_refunded: 0.01 },
    { live_mode: false },
    { date_approved: undefined },
    { date_last_updated: "2027-01-31T12:00:00Z" },
  ])
    expect(
      verifiedPaidPeriod(
        subscription,
        invoice,
        { ...payment, ...change },
        reference,
        123,
        now,
      ),
    ).toBeNull();
  for (const change of [
    { preapproval_id: "other_subscription" },
    { payer_id: 999 },
    { currency_id: "USD" },
    { transaction_amount: 0.99 },
    { payment: { id: 999, status: "approved" } },
    { payment: { id: 789, status: "pending" } },
    { debit_date: undefined },
  ])
    expect(
      verifiedPaidPeriod(
        subscription,
        { ...invoice, ...change },
        payment,
        reference,
        123,
        now,
      ),
    ).toBeNull();
});

test("período mensal usa UTC e respeita meses curtos e ano bissexto", () => {
  expect(paidPeriodEnd("2024-01-31T23:30:00Z")).toBe(
    "2024-02-29T23:30:00.000Z",
  );
  expect(paidPeriodEnd("2026-12-31T23:30:00Z")).toBe(
    "2027-01-31T23:30:00.000Z",
  );
  expect(paidPeriodEnd("2026-03-31T23:30:00-03:00")).toBe(
    "2026-05-01T02:30:00.000Z",
  );
  expect(() => paidPeriodEnd("invalid")).toThrow();
});

test("webhook autentica data.id e rejeita adulteração, replay antigo e duplicatas", () => {
  const secret = "test-secret-without-live-credentials";
  const ts = String(now / 1000);
  const manifest = `id:invoice_123;request-id:request_123;ts:${ts};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");
  const headers = new Headers({
    "x-request-id": "request_123",
    "x-signature": `ts=${ts},v1=${digest}`,
  });
  const url = new URL(
    "https://mymeet.example/api/billing/webhook?data.id=INVOICE_123",
  );
  expect(verifyMercadoPagoSignature(url, headers, secret, now)).toBe(
    "INVOICE_123",
  );
  expect(
    verifyMercadoPagoSignature(url, headers, secret, now + 300_001),
  ).toBeNull();
  expect(
    verifyMercadoPagoSignature(url, headers, "wrong-secret", now),
  ).toBeNull();
  expect(
    verifyMercadoPagoSignature(
      new URL(url + "&data.id=other"),
      headers,
      secret,
      now,
    ),
  ).toBeNull();
  expect(
    verifyMercadoPagoSignature(
      new URL("https://mymeet.example/?data.id=other"),
      headers,
      secret,
      now,
    ),
  ).toBeNull();
  for (const signature of [
    `ts=${ts},v1=${digest},v1=${digest}`,
    `ts=${ts},v1=not-hex`,
    `ts=${ts}`,
    `v1=${digest}`,
  ]) {
    const tampered = new Headers(headers);
    tampered.set("x-signature", signature);
    expect(verifyMercadoPagoSignature(url, tampered, secret, now)).toBeNull();
  }
});

test("checkout só redireciona para HTTPS do Mercado Pago brasileiro", () => {
  expect(
    mercadoPagoCheckoutUrl(
      "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=123",
    ),
  ).toBe(
    "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id=123",
  );
  for (const url of [
    "http://www.mercadopago.com.br/subscriptions/checkout",
    "https://evil.example/",
    "https://www.mercadopago.com.br.evil.example/subscriptions/checkout",
    "https://user@www.mercadopago.com.br/subscriptions/checkout",
    "https://www.mercadopago.com.br:444/subscriptions/checkout",
    "/planos",
  ])
    expect(mercadoPagoCheckoutUrl(url)).toBeNull();
});
