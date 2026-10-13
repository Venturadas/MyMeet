import { NextResponse } from "next/server";
import { billingIsConfigured, getBusinessBillingStatus } from "@/lib/billing";
import { trustedBillingOrigin } from "@/lib/billing-policy";
import { isConfigured, supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function reply(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
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
  if (!billingIsConfigured())
    return reply({ error: "Pagamento indisponível no momento." }, 503);
  try {
    // The caller cannot supply a payment ID or another user's reference.
    return reply(await getBusinessBillingStatus(user.id));
  } catch {
    return reply(
      {
        error:
          "Não foi possível consultar o pagamento. Tente novamente em instantes.",
      },
      503,
    );
  }
}
