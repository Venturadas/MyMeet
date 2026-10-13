import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function isRegistrationOpen() {
  return process.env.NUVEMMEET_REGISTRATION_OPEN === "true";
}

export async function supabase() {
  if (!isConfigured())
    throw new Error("Supabase não configurado. Consulte o README.");
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookieOptions: {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (items) => {
          try {
            items.forEach(({ name, value, options }) =>
              store.set(name, value, options),
            );
          } catch {
            /* Em componentes, o proxy atualiza a sessão. */
          }
        },
      },
    },
  );
}
