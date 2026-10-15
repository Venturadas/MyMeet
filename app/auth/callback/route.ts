import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";
import { safeAuthDestination } from "@/lib/auth-navigation";

function redirect(destination: URL) {
  return NextResponse.redirect(destination, {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const proposed = url.searchParams.get("next") || "/cliente";
  const next = safeAuthDestination(proposed, "");
  // A PKCE code alone does not attest which email action generated it. Password
  // recovery uses the token-hash endpoint, which issues a session-bound grant.
  if (next === "/recuperar") return redirect(new URL("/entrar?form=recovery&next=%2Frecuperar&error=Solicite+um+novo+link+de+recupera%C3%A7%C3%A3o+para+definir+outra+senha.", url.origin));
  if (code && code.length <= 2048 && /^[A-Za-z0-9._-]+$/.test(code) && next && isConfigured() && url.searchParams.getAll("code").length === 1 && url.searchParams.getAll("next").length <= 1) {
    try {
      const db = await supabase();
      const { error } = await db.auth.exchangeCodeForSession(code);
      if (!error) return redirect(new URL(next, url.origin));
    } catch {
      // Invalid links and temporary service failures share the same public error.
    }
  }
  return redirect(
    new URL(
      "/entrar?error=Link+inválido+ou+expirado.+Solicite+um+novo+link.",
      url.origin,
    ),
  );
}
