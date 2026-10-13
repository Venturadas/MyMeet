import { NextResponse } from "next/server";
import { isConfigured, supabase } from "@/lib/supabase";

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
  const next =
    proposed === "/recuperar" || /^\/agendar\/[a-z0-9-]+$/.test(proposed)
      ? proposed
      : "/cliente";
  if (code && isConfigured()) {
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
