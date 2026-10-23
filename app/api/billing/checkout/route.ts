import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";
import { billingIsConfigured, startBusinessPix } from "@/lib/billing";
import { trustedBillingOrigin } from "@/lib/billing-policy";
import { operationalFailure } from "@/lib/operations";

export const runtime = "nodejs";

function reply(value: unknown, status = 200, requestId?: string) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      ...(requestId ? { "X-Request-ID": requestId } : {}),
    },
  });
}

async function containsBody(request: Request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 0))
    return true;
  if (!request.body) return false;
  // Next's Node adapter exposes a stream even for an empty POST. Inspect the
  // stream, never its presence, and refuse the first data chunk without buffering.
  const reader = request.body.getReader();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 2_000);
  try {
    const { done, value } = await reader.read();
    return timedOut || !done || Boolean(value?.byteLength);
  } catch {
    return true;
  } finally {
    clearTimeout(timeout);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function POST(request: Request) {
  const origin = trustedBillingOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (
    !origin ||
    request.headers.get("origin") !== origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return reply({ error: "Solicitação inválida." }, 403);
  // Checkout has no client-supplied price, account, company or reference fields.
  // Reject bodies without buffering them; all charge data comes from the server.
  if (await containsBody(request))
    return reply({ error: "Solicitação inválida." }, 400);
  if (!isConfigured())
    return reply({ error: "Pagamento indisponível no momento." }, 503);
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    return reply({ error: "Entre na sua conta para pagar." }, 401);
  if (!user.email || !user.email_confirmed_at)
    return reply({ error: "Confirme seu e-mail antes de pagar." }, 403);
  if (!billingIsConfigured())
    return reply({ error: "Pagamento indisponível no momento." }, 503);
  try {
    return reply(await startBusinessPix({ id: user.id, email: user.email }));
  } catch (error) {
    // No raw provider responses, credentials, payment links or personal data in logs.
    return reply(
      {
        error:
          "Não foi possível consultar o pagamento. Tente novamente em instantes.",
      },
      503,
      operationalFailure("billing.checkout_failed", error),
    );
  }
}
