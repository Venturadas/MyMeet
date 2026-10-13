import { NextResponse } from "next/server";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";

const confirmation = z.object({
  token_hash: z
    .string()
    .min(20)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
  type: z.enum(["signup", "recovery"]),
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
  const proposed = url.searchParams.get("next") || "/cliente";
  const safeDestination =
    proposed === "/cliente" || /^\/agendar\/[a-z0-9-]+$/.test(proposed);

  if (
    !input.success ||
    !isConfigured() ||
    !safeDestination ||
    ["token_hash", "type", "next"].some(
      (parameter) => url.searchParams.getAll(parameter).length > 1,
    )
  ) {
    return redirect(failure);
  }

  try {
    const db = await supabase();
    const { data, error } = await db.auth.verifyOtp(input.data);
    if (!error && data.session) {
      const next = input.data.type === "recovery" ? "/recuperar" : proposed;
      return redirect(new URL(next, url.origin));
    }
  } catch {
    // Invalid links and temporary service failures share the same public error.
  }
  return redirect(failure);
}
