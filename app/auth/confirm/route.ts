import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { safeAuthDestination, safeEmailRedirectDestination } from "@/lib/auth-navigation";
import { grantVerifiedRecovery, recoveryGrantIsConfigured } from "@/lib/auth-recovery";

const confirmation = z.object({
  token_hash: z
    .string()
    .min(20)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["signup", "recovery", "email_change"]),
});

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
  const failure = new URL("/entrar", url.origin);
  failure.searchParams.set(
    "error",
    "Link inválido ou expirado. Solicite um novo link.",
  );
  const input = confirmation.safeParse({
    token_hash: url.searchParams.get("token_hash"),
    type: url.searchParams.get("type"),
  });
  const proposed = url.searchParams.has("redirect_to")
    ? safeEmailRedirectDestination(url.searchParams.get("redirect_to"), process.env.NEXT_PUBLIC_SITE_URL)
    : safeAuthDestination(url.searchParams.get("next") || "/cliente", "");

  if (
    !input.success ||
    !isConfigured() ||
    !proposed ||
    (url.searchParams.has("next") && url.searchParams.has("redirect_to")) ||
    ["token_hash", "type", "next", "redirect_to"].some(
      (parameter) => url.searchParams.getAll(parameter).length > 1,
    )
  ) {
    return redirect(failure);
  }
  if (input.data.type === "recovery" && !recoveryGrantIsConfigured()) {
    failure.searchParams.set("error", "A recuperação está temporariamente indisponível. Tente novamente mais tarde.");
    return redirect(failure);
  }

  try {
    const db = await supabase();
    const { data, error } = await db.auth.verifyOtp(input.data);
    if (!error && data.session) {
      if (input.data.type === "recovery") await grantVerifiedRecovery(data.session);
      const next = input.data.type === "recovery" ? "/recuperar" : proposed;
      const success = new URL(next, url.origin);
      if (input.data.type === "signup") {
        success.searchParams.set("notice", "Seu e-mail foi confirmado. Agora você pode usar sua conta.");
        success.searchParams.set("notice_title", "Conta confirmada");
      } else if (input.data.type === "email_change") {
        success.searchParams.set("notice", "Seu e-mail de acesso foi atualizado.");
        success.searchParams.set("notice_title", "E-mail atualizado");
      }
      return redirect(success);
    }
    if (!error && input.data.type === "email_change") {
      const pending = new URL("/entrar", url.origin);
      pending.searchParams.set("next", proposed);
      pending.searchParams.set("notice", "Confirme também o link enviado ao outro endereço para concluir a alteração de e-mail.");
      pending.searchParams.set("notice_type", "info");
      return redirect(pending);
    }
  } catch {
    // Invalid links and temporary service failures share the same public error.
  }
  return redirect(failure);
}
