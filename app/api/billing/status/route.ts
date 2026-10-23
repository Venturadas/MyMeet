import { NextResponse } from "next/server";
import { billingHasCredentials, getBusinessBillingStatus } from "@/lib/billing";
import { trustedBillingOrigin } from "@/lib/billing-policy";
import { isConfigured, supabase } from "@/lib/supabase";
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

export async function GET(request: Request) {
  const origin = trustedBillingOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  const requestedOrigin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (requestedOrigin && requestedOrigin !== origin)
  )
    return reply({ error: "Solicitação inválida." }, 403);
  if (!isConfigured())
    return reply({ error: "Pagamento indisponível no momento." }, 503);
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    return reply(
      { error: "Entre na sua conta para consultar o pagamento." },
      401,
    );
  if (!billingHasCredentials())
    return reply({ error: "Pagamento indisponível no momento." }, 503);
  try {
    // The caller cannot supply a payment ID or another user's reference.
    return reply(await getBusinessBillingStatus(user.id));
  } catch (error) {
    return reply(
      {
        error:
          "Não foi possível consultar o pagamento. Tente novamente em instantes.",
      },
      503,
      operationalFailure("billing.status_failed", error),
    );
  }
}
