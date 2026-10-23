import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BUSINESS_PRICE_CENTS, BUSINESS_CURRENCY } from "./billing-plan";
import { withRequestTimeout } from "./server-fetch";
import {
  trustedBillingOrigin,
  providerDate,
  validCheckoutId,
  validPaymentId,
  verifiedPixPayment,
  safePixCode,
  safePixQrBase64,
  safePixTicketUrl,
  type ProviderPayment,
  type VerifiedPixPayment,
} from "./billing-policy";

const API = "https://api.mercadopago.com";

export function billingHasCredentials() {
  return Boolean(
    process.env.MERCADO_PAGO_ACCESS_TOKEN &&
    process.env.MERCADO_PAGO_WEBHOOK_SECRET &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    trustedBillingOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  );
}

export function billingIsConfigured() {
  return (
    process.env.MERCADO_PAGO_BILLING_ENABLED === "true" &&
    billingHasCredentials()
  );
}

function admin() {
  if (!billingHasCredentials()) throw new Error("billing_disabled");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { fetch: withRequestTimeout() },
      db: { retry: false },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}

async function provider<T>(
  path: string,
  body?: object,
  idempotencyKey?: string,
): Promise<T> {
  const response = await fetch(API + path, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error("provider_unavailable");
  return response.json() as Promise<T>;
}

async function merchant() {
  const account = await provider<{ id?: number }>("/users/me");
  if (!Number.isSafeInteger(account.id) || Number(account.id) <= 0)
    throw new Error("invalid_merchant");
  return account.id!;
}

type Checkout = {
  id: string;
  checkout_id: string;
  user_id: string;
  business_id: string | null;
  payment_id: string | null;
  status: string;
  expires_at: string | null;
  merchant_id: string | null;
  event_at: string | null;
  paid_at: string | null;
};
export type BusinessBillingStatus = {
  payment: {
    id: string;
    status: string;
    qrCode: string | null;
    qrCodeBase64: string | null;
    ticketUrl: string | null;
    expiresAt: string | null;
  } | null;
  subscription: { active: boolean; expiresAt: string | null };
};

async function checkoutById(id: string): Promise<Checkout | null> {
  const { data, error } = await admin().rpc("get_pix_checkout", {
    p_checkout_id: id,
  });
  if (error) throw new Error("billing_storage_unavailable");
  return data;
}

async function subscriptionFor(
  userId: string,
): Promise<BusinessBillingStatus["subscription"]> {
  const { data, error } = await admin()
    .from("business_subscriptions")
    .select("status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("billing_storage_unavailable");
  const expiry = providerDate(data?.current_period_end);
  return {
    active:
      data?.status === "active" &&
      Boolean(expiry && expiry.getTime() > Date.now()),
    expiresAt: expiry?.toISOString() || null,
  };
}

async function reconcile(
  payment: ProviderPayment,
  merchantId: number,
  intendedCheckout?: Checkout,
) {
  if (!validCheckoutId(payment.external_reference))
    throw new Error("invalid_payment");
  const checkout =
    intendedCheckout || (await checkoutById(payment.external_reference));
  if (!checkout) return null;
  const verified = verifiedPixPayment(payment, checkout.id, merchantId);
  if (
    !verified ||
    (checkout.payment_id && checkout.payment_id !== verified.id) ||
    (checkout.merchant_id && checkout.merchant_id !== verified.merchantId)
  )
    throw new Error("invalid_payment");
  // Terminal provider responses can omit the QR expiration. Preserve the
  // durable expiration already set before payment creation in that case.
  const expiresAt = verified.expiresAt || checkout.expires_at;
  if (!providerDate(expiresAt)) throw new Error("invalid_payment");
  const db = admin();
  const { error: bindError } = await db.rpc("bind_pix_checkout", {
    p_checkout_id: checkout.id,
    p_payment_id: verified.id,
    p_status: verified.status,
    p_event_at: verified.eventAt,
    p_expires_at: expiresAt,
    p_merchant_id: verified.merchantId,
  });
  if (bindError) throw new Error("billing_storage_unavailable");
  const { error } = await db.rpc("apply_pix_payment", {
    p_checkout_id: checkout.id,
    p_payment_id: verified.id,
    p_status: verified.status,
    p_paid_at: verified.paidAt,
    p_event_at: verified.eventAt,
    p_expires_at: expiresAt,
    p_merchant_id: verified.merchantId,
    p_amount_cents: BUSINESS_PRICE_CENTS,
    p_currency: BUSINESS_CURRENCY,
  });
  if (error) throw new Error("billing_storage_unavailable");
  return verified;
}

function presentPayment(
  payment: ProviderPayment,
  verified: VerifiedPixPayment,
): BusinessBillingStatus["payment"] {
  const payable =
    verified.status === "pending" &&
    Boolean(
      verified.expiresAt && new Date(verified.expiresAt).getTime() > Date.now(),
    );
  const details = payment.point_of_interaction?.transaction_data;
  return {
    id: verified.id,
    status: verified.status,
    expiresAt: verified.expiresAt,
    qrCode: payable ? safePixCode(details?.qr_code) : null,
    qrCodeBase64: payable ? safePixQrBase64(details?.qr_code_base64) : null,
    ticketUrl: payable ? safePixTicketUrl(details?.ticket_url) : null,
  };
}

async function ownPaymentStatus(
  userId: string,
  checkout: Checkout | null,
  merchantId?: number,
): Promise<BusinessBillingStatus> {
  if (checkout && checkout.user_id !== userId)
    throw new Error("invalid_checkout");
  let output: BusinessBillingStatus["payment"] = null;
  if (checkout?.payment_id && validPaymentId(checkout.payment_id)) {
    const payment = await provider<ProviderPayment>(
      `/v1/payments/${checkout.payment_id}`,
    );
    const verified = await reconcile(
      payment,
      merchantId || (await merchant()),
      checkout,
    );
    if (!verified || verified.id !== checkout.payment_id)
      throw new Error("invalid_payment");
    output = presentPayment(payment, verified);
  }
  return { payment: output, subscription: await subscriptionFor(userId) };
}

export async function getBusinessBillingStatus(
  userId: string,
  merchantId?: number,
): Promise<BusinessBillingStatus> {
  const verifiedMerchant = merchantId || (await merchant());
  const { data, error } = await admin().rpc("get_latest_pix_checkout", {
    p_user_id: userId,
  });
  if (error) throw new Error("billing_storage_unavailable");
  return ownPaymentStatus(userId, data, verifiedMerchant);
}

export async function startBusinessPix(user: {
  id: string;
  email: string;
}): Promise<BusinessBillingStatus> {
  // Reconcile the previous payment before creating a renewal, including when
  // the buyer retries directly and its approval notification was delayed.
  const merchantId = await merchant();
  const current = await getBusinessBillingStatus(user.id, merchantId);
  if (current.subscription.active) return current;
  const db = admin();
  const { data: claim, error } = await db.rpc("claim_pix_checkout", {
    p_user_id: user.id,
  });
  if (error || !claim) throw new Error("checkout_unavailable");
  if (claim.status === "active")
    return { payment: null, subscription: await subscriptionFor(user.id) };
  if (!validCheckoutId(claim.checkout_id))
    throw new Error("checkout_unavailable");
  const checkout = await checkoutById(claim.checkout_id);
  if (!checkout || checkout.user_id !== user.id)
    throw new Error("invalid_checkout");
  if (checkout.payment_id)
    return ownPaymentStatus(user.id, checkout, merchantId);
  const expiry = providerDate(checkout.expires_at);
  if (!expiry || expiry.getTime() <= Date.now())
    throw new Error("checkout_expired");
  // The durable intent, expiration and idempotency key exist BEFORE this request.
  // Lost responses retry this exact UUID, never create a second charge blindly.
  const created = await provider<ProviderPayment>(
    "/v1/payments",
    {
      transaction_amount: BUSINESS_PRICE_CENTS / 100,
      description: "NuvLink — plano empresa por 30 dias",
      payment_method_id: "pix",
      payer: { email: user.email },
      external_reference: checkout.id,
      date_of_expiration: expiry.toISOString().replace("Z", "+00:00"),
      notification_url: `${trustedBillingOrigin(process.env.NEXT_PUBLIC_SITE_URL)}/api/billing/webhook?source_news=webhooks`,
    },
    checkout.id,
  );
  const createdVerified = verifiedPixPayment(created, checkout.id, merchantId);
  if (!createdVerified) throw new Error("invalid_payment");
  // Read the authoritative resource again before granting any paid access.
  const payment = await provider<ProviderPayment>(
    `/v1/payments/${createdVerified.id}`,
  );
  const verified = await reconcile(payment, merchantId, checkout);
  if (!verified || verified.id !== createdVerified.id)
    throw new Error("invalid_payment");
  return {
    payment: presentPayment(payment, verified),
    subscription: await subscriptionFor(user.id),
  };
}

export async function processMercadoPagoNotification(id: string) {
  if (!validPaymentId(id)) throw new Error("invalid_payment");
  const merchantId = await merchant();
  const payment = await provider<ProviderPayment>(`/v1/payments/${id}`);
  const actualId =
    typeof payment.id === "number" && Number.isSafeInteger(payment.id)
      ? String(payment.id)
      : payment.id;
  if (actualId !== id) throw new Error("invalid_payment");
  // The merchant may receive notifications from other integrations too.
  // A payment without our durable UUID cannot activate a NuvLink plan.
  if (!validCheckoutId(payment.external_reference)) return;
  await reconcile(payment, merchantId);
}
