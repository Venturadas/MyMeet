import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";
import { billingIsConfigured, startBusinessSubscription } from "@/lib/billing";

export const runtime = "nodejs";

function go(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), {
    status: 303,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: Request) {
  const expectedOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  let trustedOrigin: string;
  try {
    trustedOrigin = new URL(expectedOrigin || "").origin;
  } catch {
    return go(request, "/planos?error=Pagamento+indispon%C3%ADvel+no+momento.");
  }
  if (
    request.headers.get("origin") !== trustedOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return new NextResponse(null, {
      status: 403,
      headers: { "Cache-Control": "no-store" },
    });
  if (Number(request.headers.get("content-length") || 0) > 4096)
    return new NextResponse(null, { status: 413 });
  if (!isConfigured())
    return go(request, "/planos?error=Pagamento+indispon%C3%ADvel+no+momento.");
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return go(request, "/entrar?next=%2Fplanos");
  if (!user.email || !user.email_confirmed_at)
    return go(request, "/planos?error=Confirme+seu+e-mail+antes+de+assinar.");
  if (!billingIsConfigured())
    return go(request, "/planos?error=Pagamento+indispon%C3%ADvel+no+momento.");
  try {
    const url = await startBusinessSubscription({
      id: user.id,
      email: user.email,
    });
    return NextResponse.redirect(url, {
      status: 303,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return go(
      request,
      "/planos?error=N%C3%A3o+foi+poss%C3%ADvel+abrir+o+pagamento.+Tente+mais+tarde+ou+fale+com+o+suporte.",
    );
  }
}
