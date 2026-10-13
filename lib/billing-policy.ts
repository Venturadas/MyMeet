import { createHmac, timingSafeEqual } from "node:crypto";
import { BUSINESS_PRICE_CENTS, BUSINESS_CURRENCY } from "./billing-plan";

export const PIX_PAYMENT_STATUSES = [
  "pending",
  "in_process",
  "approved",
  "rejected",
  "cancelled",
  "refunded",
  "charged_back",
] as const;
export type PixPaymentStatus = (typeof PIX_PAYMENT_STATUSES)[number];

export function validPaymentId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}

export function validCheckoutId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

export function trustedBillingOrigin(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

// Mercado Pago signs the URL's data.id, never an unsigned JSON body ID.
// Ref: Mercado Pago Developers / Notifications / Webhooks (HMAC SHA-256).
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
    !validPaymentId(ids[0]) ||
    !requestId ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(requestId) ||
    !signature ||
    signature.length > 300 ||
    !secret
  )
    return null;
  const pieces = signature.split(",").map((part) => part.trim().split("="));
  if (pieces.length !== 2 || pieces.some((part) => part.length !== 2))
    return null;
  const timestamps = pieces.filter(([key]) => key === "ts");
  const digests = pieces.filter(([key]) => key === "v1");
  if (timestamps.length !== 1 || digests.length !== 1) return null;
  const ts = timestamps[0][1],
    digest = digests[0][1];
  if (!/^\d{10,13}$/.test(ts) || !/^[a-fA-F0-9]{64}$/.test(digest)) return null;
  const milliseconds = ts.length === 13 ? Number(ts) : Number(ts) * 1000;
  if (
    !Number.isSafeInteger(milliseconds) ||
    Math.abs(now - milliseconds) > 300_000
  )
    return null;
  const manifest = `id:${ids[0]};request-id:${requestId};ts:${ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(digest, "hex")) ? ids[0] : null;
}

export function providerDate(value: unknown): Date | null {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate()
  )
    return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const amount = value * 100;
  return Math.abs(amount - Math.round(amount)) < 1e-8
    ? Math.round(amount)
    : null;
}

export type ProviderPayment = {
  id?: number | string;
  status?: string;
  external_reference?: string;
  collector_id?: number;
  payment_method_id?: string;
  currency_id?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  date_approved?: string | null;
  date_last_updated?: string;
  date_of_expiration?: string;
  live_mode?: boolean;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
};

export type VerifiedPixPayment = {
  id: string;
  status: PixPaymentStatus;
  reference: string;
  merchantId: string;
  eventAt: string;
  paidAt: string | null;
  expiresAt: string | null;
};

// Only an authoritative GET /v1/payments/{id} may be used to grant access.
// A pending QR, signed notification or success query string alone never grants it.
export function verifiedPixPayment(
  payment: ProviderPayment,
  reference: string,
  merchantId: number,
  now = Date.now(),
): VerifiedPixPayment | null {
  const id =
    typeof payment.id === "number" && Number.isSafeInteger(payment.id)
      ? String(payment.id)
      : payment.id;
  const refund = cents(payment.transaction_amount_refunded ?? 0);
  if (
    !validCheckoutId(reference) ||
    !validPaymentId(id) ||
    !Number.isSafeInteger(merchantId) ||
    merchantId <= 0 ||
    payment.external_reference !== reference ||
    payment.collector_id !== merchantId ||
    payment.payment_method_id !== "pix" ||
    payment.currency_id !== BUSINESS_CURRENCY ||
    cents(payment.transaction_amount) !== BUSINESS_PRICE_CENTS ||
    payment.live_mode !== true ||
    refund === null ||
    refund < 0 ||
    refund > BUSINESS_PRICE_CENTS ||
    !PIX_PAYMENT_STATUSES.includes(payment.status as PixPaymentStatus)
  )
    return null;
  const eventAt = providerDate(payment.date_last_updated);
  const paidAt =
    payment.date_approved == null ? null : providerDate(payment.date_approved);
  const expiresAt =
    payment.date_of_expiration == null
      ? null
      : providerDate(payment.date_of_expiration);
  if (
    !eventAt ||
    eventAt.getTime() > now + 300_000 ||
    (payment.date_approved != null && !paidAt) ||
    (payment.date_of_expiration != null && !expiresAt) ||
    (paidAt &&
      (paidAt.getTime() > now + 300_000 ||
        paidAt.getTime() > eventAt.getTime() + 300_000)) ||
    (payment.status === "approved" && !paidAt)
  )
    return null;
  return {
    id,
    reference,
    merchantId: String(merchantId),
    status:
      refund > 0
        ? "refunded"
        : payment.status === "in_process"
          ? "pending"
          : (payment.status as PixPaymentStatus),
    eventAt: eventAt.toISOString(),
    paidAt: paidAt?.toISOString() || null,
    expiresAt: expiresAt?.toISOString() || null,
  };
}

export function safePixTicketUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "www.mercadopago.com.br" &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname.startsWith("/payments/")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Accept a small PNG only. SVG/HTML/data URLs and huge image dimensions are rejected.
export function safePixQrBase64(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 300_000 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  )
    return null;
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length < 33 ||
    bytes.length > 225_000 ||
    bytes.toString("base64") !== value ||
    !bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
    bytes.readUInt32BE(8) !== 13 ||
    bytes.toString("ascii", 12, 16) !== "IHDR"
  )
    return null;
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20);
  return width > 0 && height > 0 && width <= 2048 && height <= 2048
    ? value
    : null;
}

export function safePixCode(value: unknown): string | null {
  return typeof value === "string" && /^000201[\x20-\x7e]{30,4090}$/.test(value)
    ? value
    : null;
}
