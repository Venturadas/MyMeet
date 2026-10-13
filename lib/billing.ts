import "server-only";
import { createClient } from "@supabase/supabase-js";
import { BUSINESS_PRICE_CENTS, BUSINESS_CURRENCY } from "./billing-plan";
import {
  mercadoPagoCheckoutUrl,
  providerDate,
  subscriptionMatches,
  validProviderId,
  verifiedPaidPeriod,
  type ProviderInvoice,
  type ProviderPayment,
  type ProviderSubscription,
} from "./billing-policy";

const API = "https://api.mercadopago.com";

function siteUrl() {
  try {
    const site = new URL(process.env.NEXT_PUBLIC_SITE_URL || "");
    return site.protocol === "https:" &&
      !site.username &&
      !site.password &&
      !site.port &&
      site.pathname === "/" &&
      !site.search &&
      !site.hash
      ? site.origin
      : null;
  } catch {
    return null;
  }
}

export function billingIsConfigured() {
  return (
    process.env.MERCADO_PAGO_BILLING_ENABLED === "true" &&
    Boolean(
      process.env.MERCADO_PAGO_ACCESS_TOKEN &&
        process.env.MERCADO_PAGO_WEBHOOK_SECRET &&
        process.env.SUPABASE_SERVICE_ROLE_KEY &&
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        siteUrl(),
    )
  );
}

function admin() {
  if (!billingIsConfigured()) throw new Error("billing_disabled");
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
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
  user_id: string;
  provider_subscription_id: string | null;
  status: string;
};

export async function startBusinessSubscription(user: {
  id: string;
  email: string;
}): Promise<string> {
  const db = admin();
  const merchantId = await merchant();
  const { data: claim, error } = await db.rpc("claim_subscription_checkout", {
    p_user_id: user.id,
  });
  if (error || !claim) throw new Error("checkout_unavailable");
  if (claim.status === "active") throw new Error("already_subscribed");
  if (typeof claim.checkout_id !== "string")
    throw new Error("checkout_unavailable");
  let subscription: ProviderSubscription;
  if (
    claim.provider_subscription_id &&
    validProviderId(claim.provider_subscription_id)
  ) {
    subscription = await provider<ProviderSubscription>(
      `/preapproval/${encodeURIComponent(claim.provider_subscription_id)}`,
    );
  } else if (claim.claimed === true) {
    // A durable claim comes BEFORE the external request. If a response is lost,
    // another request never creates a second subscription; reconcile it first.
    subscription = await provider<ProviderSubscription>(
      "/preapproval",
      {
        reason: "MyMeet — assinatura mensal para empresa",
        external_reference: claim.checkout_id,
        payer_email: user.email,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: BUSINESS_PRICE_CENTS / 100,
          currency_id: BUSINESS_CURRENCY,
        },
        back_url: `${siteUrl()}/planos?checkout=return`,
        status: "pending",
      },
      claim.checkout_id,
    );
  } else throw new Error("checkout_needs_reconciliation");
  if (
    !subscriptionMatches(subscription, claim.checkout_id, merchantId) ||
    !["pending", "authorized"].includes(subscription.status || "")
  )
    throw new Error("invalid_subscription");
  const eventAt = providerDate(subscription.last_modified);
  const checkoutUrl = mercadoPagoCheckoutUrl(subscription.init_point);
  if (!eventAt || !checkoutUrl) throw new Error("invalid_checkout");
  const { error: bindError } = await db.rpc("bind_subscription_checkout", {
    p_checkout_id: claim.checkout_id,
    p_provider_subscription_id: subscription.id,
    p_event_at: eventAt.toISOString(),
  });
  if (bindError) throw new Error("checkout_unavailable");
  return checkoutUrl;
}

async function linkedCheckout(
  subscription: ProviderSubscription,
  merchantId: number,
): Promise<Checkout | null> {
  const reference = subscription.external_reference;
  if (
    typeof reference !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      reference,
    ) ||
    !subscriptionMatches(subscription, reference, merchantId)
  )
    return null;
  const db = admin();
  const { data, error } = await db
    .from("business_subscription_checkouts")
    .select("id,user_id,provider_subscription_id,status")
    .eq("id", reference)
    .maybeSingle();
  if (error) throw new Error("billing_storage_unavailable");
  if (
    !data ||
    (data.provider_subscription_id &&
      data.provider_subscription_id !== subscription.id)
  )
    return null;
  const eventAt = providerDate(subscription.last_modified);
  if (!eventAt || eventAt.getTime() > Date.now() + 300_000)
    throw new Error("invalid_provider_timestamp");
  const { error: bindError } = await db.rpc("bind_subscription_checkout", {
    p_checkout_id: data.id,
    p_provider_subscription_id: subscription.id,
    p_event_at: eventAt.toISOString(),
  });
  if (bindError) throw new Error("billing_storage_unavailable");
  return data;
}

async function apply(
  checkout: Checkout,
  subscription: ProviderSubscription,
  state: "active" | "paused" | "cancelled" | "expired",
  eventId: string,
  payment?: ProviderPayment,
  end?: string,
) {
  const { error } = await admin().rpc("apply_business_subscription_event", {
    p_checkout_id: checkout.id,
    p_provider_subscription_id: subscription.id,
    p_status: state,
    p_event_at: providerDate(subscription.last_modified)!.toISOString(),
    p_period_end: end || null,
    p_payment_id: payment ? String(payment.id) : null,
    p_event_id: eventId,
    p_payment_event_at: payment
      ? providerDate(payment.date_last_updated)?.toISOString() || null
      : null,
  });
  if (error) throw new Error("billing_storage_unavailable");
}

async function handleInvoice(invoice: ProviderInvoice, merchantId: number) {
  if (!validProviderId(invoice.preapproval_id)) return;
  const subscription = await provider<ProviderSubscription>(
    `/preapproval/${encodeURIComponent(invoice.preapproval_id)}`,
  );
  const checkout = await linkedCheckout(subscription, merchantId);
  if (!checkout) return;
  if (["paused", "cancelled"].includes(subscription.status || "")) {
    await apply(
      checkout,
      subscription,
      subscription.status as "paused" | "cancelled",
      `subscription:${subscription.id}:${subscription.last_modified}:${subscription.status}`,
    );
    return;
  }
  const paymentId = String(invoice.payment?.id || "");
  if (!validProviderId(paymentId) || !/^\d+$/.test(paymentId)) return;
  const payment = await provider<ProviderPayment>(
    `/v1/payments/${encodeURIComponent(paymentId)}`,
  );
  if (
    String(payment.id) !== paymentId ||
    payment.collector_id !== merchantId ||
    payment.live_mode !== true
  )
    return;
  const paymentDate = providerDate(payment.date_last_updated);
  if (!paymentDate || paymentDate.getTime() > Date.now() + 300_000) return;
  const eventId = `payment:${payment.id}:${payment.date_last_updated}:${payment.status}`;
  const paid = verifiedPaidPeriod(
    subscription,
    invoice,
    payment,
    checkout.id,
    merchantId,
  );
  if (paid && new Date(paid.end).getTime() > Date.now()) {
    await apply(checkout, subscription, "active", eventId, payment, paid.end);
  } else if (
    ["refunded", "charged_back"].includes(payment.status || "") ||
    Number(payment.transaction_amount_refunded || 0) > 0
  ) {
    // SQL revokes only if this payment still backs the latest paid period.
    await apply(checkout, subscription, "expired", eventId, payment);
  }
}

export async function processMercadoPagoNotification(type: string, id: string) {
  const merchantId = await merchant();
  if (type === "subscription_preapproval") {
    const subscription = await provider<ProviderSubscription>(
      `/preapproval/${encodeURIComponent(id)}`,
    );
    if (subscription.id !== id) return;
    const checkout = await linkedCheckout(subscription, merchantId);
    if (!checkout) return;
    if (
      subscription.status === "paused" ||
      subscription.status === "cancelled"
    ) {
      await apply(
        checkout,
        subscription,
        subscription.status,
        `subscription:${subscription.id}:${subscription.last_modified}:${subscription.status}`,
      );
    }
    // "authorized" only means the recurring mandate exists. No paid access.
  } else if (type === "subscription_authorized_payment") {
    const invoice = await provider<ProviderInvoice>(
      `/authorized_payments/${encodeURIComponent(id)}`,
    );
    if (String(invoice.id) !== id) return;
    await handleInvoice(invoice, merchantId);
  } else if (type === "payment" && /^\d+$/.test(id)) {
    const result = await provider<{ results?: ProviderInvoice[] }>(
      `/authorized_payments/search?payment_id=${encodeURIComponent(id)}&limit=2`,
    );
    if (
      !Array.isArray(result.results) ||
      result.results.length !== 1 ||
      String(result.results[0].payment?.id) !== id
    )
      return;
    await handleInvoice(result.results[0], merchantId);
  }
}
