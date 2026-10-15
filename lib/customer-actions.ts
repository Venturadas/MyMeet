"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";

type Tab = "perfil" | "configuracoes";
function feedback(tab: Tab, message: string, error = false): never {
  revalidatePath("/cliente");
  redirect(
    `/cliente?tab=${tab}&${error ? "error" : "notice"}=${encodeURIComponent(message)}&notice_id=${crypto.randomUUID()}`,
  );
}
async function authenticated() {
  if (!isConfigured()) redirect("/entrar");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar");
  return { db, user };
}

export async function updateCustomerProfile(form: FormData) {
  const { db } = await authenticated();
  const input = z
    .object({
      display_name: z.string().trim().min(2).max(80),
      username: z.union([z.literal(""), z.string().regex(/^[a-z0-9_]{3,30}$/)]),
      phone: z.union([z.literal(""), z.string().regex(/^\+?[0-9]{8,15}$/)]),
    })
    .safeParse({
      display_name: form.get("display_name"),
      username: String(form.get("username") || "")
        .trim()
        .toLowerCase(),
      phone: String(form.get("phone") || "")
        .trim()
        .replace(/[ ()-]/g, ""),
    });
  if (!input.success)
    feedback("perfil", "Confira seu nome, usuário e telefone.", true);
  // Avatar changes have their own RPC; text edits cannot overwrite an upload.
  const { error } = await db.rpc("save_profile", {
    p_display_name: input.data.display_name,
    p_username: input.data.username || null,
    p_phone: input.data.phone || null,
  });
  if (error)
    feedback(
      "perfil",
      "Não foi possível salvar. O nome de usuário pode estar em uso.",
      true,
    );
  feedback("perfil", "Perfil atualizado.");
}

async function reauthenticate(password: unknown) {
  const { db, user } = await authenticated();
  const parsed = z.string().min(1).max(128).safeParse(password);
  if (!user.email || !user.email_confirmed_at || !parsed.success)
    feedback(
      "configuracoes",
      "Informe sua senha atual para confirmar a alteração.",
      true,
    );
  const { data, error } = await db.auth.signInWithPassword({
    email: user.email,
    password: parsed.data,
  });
  if (error || data.user?.id !== user.id)
    feedback(
      "configuracoes",
      "Não foi possível confirmar sua senha atual.",
      true,
    );
  return { db, user };
}

export async function changeCustomerEmail(form: FormData) {
  const email = z
    .email()
    .max(254)
    .safeParse(String(form.get("email") || "").trim());
  if (!email.success)
    feedback("configuracoes", "Informe um e-mail válido.", true);
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  let emailRedirectTo: string;
  try {
    const callback = new URL("/auth/callback", site);
    if (
      callback.protocol !== "https:" ||
      callback.username ||
      callback.password
    )
      throw new Error("Invalid site URL");
    callback.searchParams.set("next", "/cliente?tab=configuracoes");
    emailRedirectTo = callback.toString();
  } catch {
    feedback(
      "configuracoes",
      "A alteração de e-mail está temporariamente indisponível.",
      true,
    );
  }
  const { db, user } = await reauthenticate(form.get("current_password"));
  if (email.data.toLowerCase() === user.email?.toLowerCase())
    feedback("configuracoes", "Esse já é seu e-mail de acesso.", true);
  const { error } = await db.auth.updateUser(
    { email: email.data },
    {
      emailRedirectTo,
    },
  );
  if (error)
    feedback(
      "configuracoes",
      "Não foi possível solicitar a alteração. Tente novamente mais tarde.",
      true,
    );
  feedback(
    "configuracoes",
    "Pedido enviado. Confirme a mudança nos e-mails recebidos antes de usar o novo endereço.",
  );
}

export async function changeCustomerPassword(form: FormData) {
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (!password.success || password.data !== form.get("password_confirmation"))
    feedback(
      "configuracoes",
      "Use uma senha com pelo menos 12 caracteres e repita a mesma senha.",
      true,
    );
  const { db } = await reauthenticate(form.get("current_password"));
  const { error } = await db.auth.updateUser({ password: password.data });
  if (error)
    feedback(
      "configuracoes",
      "Não foi possível alterar a senha. Tente novamente.",
      true,
    );
  feedback("configuracoes", "Senha atualizada.");
}

export async function requestCustomerErasure() {
  const { db } = await authenticated();
  const { error } = await db.rpc("request_data_erasure");
  if (error)
    feedback(
      "configuracoes",
      "Não foi possível registrar a solicitação. Tente novamente.",
      true,
    );
  feedback("configuracoes", "Solicitação de exclusão registrada para análise.");
}
