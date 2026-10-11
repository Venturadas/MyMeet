import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const proposed = url.searchParams.get("next") || "/cliente";
  const next =
    proposed === "/recuperar" || /^\/agendar\/[a-z0-9-]+$/.test(proposed)
      ? proposed
      : "/cliente";
  if (code) {
    const db = await supabase();
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(
    new URL(
      "/entrar?error=Link+inválido+ou+expirado.+Solicite+um+novo+link.",
      url.origin,
    ),
  );
}
