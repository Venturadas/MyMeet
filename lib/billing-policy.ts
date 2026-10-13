import { createHmac, timingSafeEqual } from "node:crypto";
import { BUSINESS_PRICE_CENTS, BUSINESS_CURRENCY } from "./billing-plan";

export function validProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
}

export function mercadoPagoCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "www.mercadopago.com.br" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/subscriptions/checkout")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// The signed manifest uses the URL's data.id, never an unsigned body ID.
// Mercado Pago normalizes alphanumeric IDs to lowercase in this manifest.
export function verifyMercadoPagoSignature(
  url: URL,
  headers: Headers,
  secret: string,
  now = Date.now(),
): string | null {
  const ids = url.searchParams.getAll("data.id");
  const requestId = headers.get("x-request-id");
  const signature = headers.get("x-signature");
  if (
    ids.length !== 1 ||
    !validProviderId(ids[0]) ||
    !requestId ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(requestId) ||
    !signature ||
    signature.length > 300
  )
    return null;
  const pieces = signature.split(",").map((part) => part.trim().split("="));
  if (pieces.length !== 2 || pieces.some((part) => part.length !== 2))
    return null;
  const timestamps = pieces.filter(([key]) => key === "ts");
  const digests = pieces.filter(([key]) => key === "v1");
  if (timestamps.length !== 1 || digests.length !== 1) return null;
  const ts = timestamps[0][1];
  const digest = digests[0][1];
  if (!/^\d{10,13}$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(digest)) return null;
  const milliseconds = ts.length === 13 ? Number(ts) : Number(ts) * 1000;
  if (
    !Number.isSafeInteger(milliseconds) ||
    Math.abs(now - milliseconds) > 300_000
  )
    return null;
  const manifest = `id:${ids[0].toLowerCase()};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex")) ? ids[0] : null;
}

function cents(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const amount = value * 100;
  return Math.abs(amount - Math.round(amount)) < 1e-8
    ? Math.round(amount)
    : null;
}

export function providerDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

// UTC calendar month, clamped to the last day (Jan 31 -> Feb 28/29).
export function paidPeriodEnd(debitDate: string): string {
  const start = providerDate(debitDate);
  if (!start) throw new Error("invalid_period");
  const end = new Date(start);
  const day = end.getUTCDate();
  end.setUTCDate(1);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0),
  ).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.toISOString();
}

export type ProviderSubscription = {
  id?: string;
  status?: string;
  external_reference?: string;
  collector_id?: number;
  payer_id?: number;
  last_modified?: string;
  init_point?: string;
  auto_recurring?: {
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
    currency_id?: string;
    free_trial?: unknown;
  };
};
export type ProviderInvoice = {
  id?: string | number;
  preapproval_id?: string;
  external_reference?: string;
  payer_id?: number;
  transaction_amount?: number;
  currency_id?: string;
  debit_date?: string;
  last_modified?: string;
  payment?: { id?: string | number; status?: string };
};
export type ProviderPayment = {
  id?: string | number;
  status?: string;
  collector_id?: number;
  currency_id?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  date_approved?: string;
  date_last_updated?: string;
  live_mode?: boolean;
};

export function subscriptionMatches(
  subscription: ProviderSubscription,
  reference: string,
  merchantId: number,
) {
  return (
    validProviderId(subscription.id) &&
    subscription.external_reference === reference &&
    subscription.collector_id === merchantId &&
    subscription.auto_recurring?.frequency === 1 &&
    subscription.auto_recurring.frequency_type === "months" &&
    subscription.auto_recurring.currency_id === BUSINESS_CURRENCY &&
    cents(subscription.auto_recurring.transaction_amount) ===
      BUSINESS_PRICE_CENTS &&
    !subscription.auto_recurring.free_trial
  );
}

export function verifiedPaidPeriod(
  subscription: ProviderSubscription,
  invoice: ProviderInvoice,
  payment: ProviderPayment,
  reference: string,
  merchantId: number,
  now = Date.now(),
): { end: string; eventAt: string } | null {
  if (
    !subscriptionMatches(subscription, reference, merchantId) ||
    subscription.status !== "authorized" ||
    invoice.preapproval_id !== subscription.id ||
    (invoice.external_reference != null &&
      invoice.external_reference !== reference) ||
    !Number.isSafeInteger(subscription.payer_id) ||
    Number(subscription.payer_id) <= 0 ||
    invoice.payer_id !== subscription.payer_id ||
    !/^\d+$/.test(String(payment.id || "")) ||
    invoice.payment?.status !== "approved" ||
    String(invoice.payment.id) !== String(payment.id) ||
    payment.status !== "approved" ||
    payment.live_mode !== true ||
    payment.collector_id !== merchantId ||
    invoice.currency_id !== BUSINESS_CURRENCY ||
    payment.currency_id !== BUSINESS_CURRENCY ||
    cents(invoice.transaction_amount) !== BUSINESS_PRICE_CENTS ||
    cents(payment.transaction_amount) !== BUSINESS_PRICE_CENTS ||
    (payment.transaction_amount_refunded ?? 0) !== 0
  )
    return null;
  const debit = providerDate(invoice.debit_date);
  const approved = providerDate(payment.date_approved);
  const modified = providerDate(payment.date_last_updated);
  if (
    !debit ||
    !approved ||
    !modified ||
    debit.getTime() > now + 300_000 ||
    approved.getTime() > now + 300_000 ||
    modified.getTime() > now + 300_000
  )
    return null;
  return {
    end: paidPeriodEnd(invoice.debit_date!),
    eventAt: modified.toISOString(),
  };
}
