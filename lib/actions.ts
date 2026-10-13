"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabase, isConfigured, isRegistrationOpen } from "./supabase";
import { hasBusinessSubscription } from "./subscription";

function feedback(path: string, message: string, error = false): never {
  revalidatePath(path.split("?")[0]);
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}${error ? "error" : "notice"}=${encodeURIComponent(message)}`,
  );
}
function destination(value: FormDataEntryValue | null) {
  const path = String(value || "/cliente");
  return path === "/empresa" ||
    path === "/planos" ||
    /^\/agendar\/[a-z0-9-]+$/.test(path)
    ? path
    : "/cliente";
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
async function subscribed() {
  const result = await authenticated();
  if (!(await hasBusinessSubscription(result.db))) redirect("/planos");
  return result;
}
export async function signIn(form: FormData) {
  if (!isConfigured())
    feedback("/entrar", "Configure a conexão com Supabase para entrar.", true);
  const email = z.email().safeParse(form.get("email"));
  if (!email.success) feedback("/entrar", "Informe um e-mail válido.", true);
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword({
    email: email.data,
    password: String(form.get("password") || ""),
  });
  if (error)
    feedback(
      "/entrar",
      "Não foi possível entrar. Confira os dados e a confirmação do e-mail.",
      true,
    );
  redirect(destination(form.get("next")));
}
export async function signUp(form: FormData) {
  if (!isRegistrationOpen())
    feedback(
      "/entrar",
      "O cadastro está temporariamente indisponível. Tente novamente em breve.",
      true,
    );
  if (!isConfigured())
    feedback(
      "/entrar",
      "Configure a conexão com Supabase para criar sua conta.",
      true,
    );
  const input = z
    .object({
      name: z.string().trim().min(2).max(80),
      email: z.email().max(254),
      password: z.string().min(12).max(128),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success || form.get("privacy") !== "on")
    feedback(
      "/entrar",
      "Informe nome, e-mail, senha com 12 caracteres e confirme a leitura da privacidade.",
      true,
    );
  const db = await supabase();
  const next = destination(form.get("next"));
  const origin = process.env.NEXT_PUBLIC_SITE_URL;
  if (!origin)
    feedback(
      "/entrar",
      "A URL de confirmação precisa ser configurada pelo responsável.",
      true,
    );
  const { error, data } = await db.auth.signUp({
    email: input.data.email,
    password: input.data.password,
    options: {
      data: { display_name: input.data.name },
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error)
    feedback(
      "/entrar",
      "Não foi possível criar a conta. Tente novamente mais tarde ou recupere seu acesso.",
      true,
    );
  if (data.session) redirect(next);
  feedback(
    "/entrar",
    "Confira seu e-mail para confirmar a conta. Depois, entre para continuar.",
  );
}
export async function signOut() {
  if (isConfigured()) {
    const db = await supabase();
    await db.auth.signOut();
  }
  redirect("/");
}
export async function sendReset(form: FormData) {
  const email = z.email().safeParse(form.get("email"));
  if (!isConfigured() || !email.success || !process.env.NEXT_PUBLIC_SITE_URL)
    feedback("/entrar", "Confira o e-mail e a configuração de acesso.", true);
  const db = await supabase();
  await db.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/recuperar`,
  });
  feedback(
    "/entrar",
    "Se houver uma conta com esse e-mail, você receberá as instruções de recuperação.",
  );
}
export async function resetPassword(form: FormData) {
  const { db } = await authenticated();
  const password = z.string().min(12).max(128).safeParse(form.get("password"));
  if (!password.success)
    feedback("/recuperar", "Use uma senha com pelo menos 12 caracteres.", true);
  const { error } = await db.auth.updateUser({ password: password.data });
  if (error)
    feedback(
      "/recuperar",
      "Não foi possível atualizar sua senha. Solicite um novo link.",
      true,
    );
  feedback("/cliente", "Senha atualizada.");
}
export async function saveBusiness(form: FormData) {
  const { db, user } = await subscribed();
  const { data: existing, error: existingError } = await db
    .from("businesses")
    .select("id,slug,description")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (existingError)
    feedback(
      "/empresa",
      "Não foi possível verificar sua empresa. Tente novamente.",
      true,
    );
  const name = String(form.get("name") || "").trim();
  const base =
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 47)
      .replace(/-+$/g, "") || "empresa";
  const slug = String(
    form.get("slug") ||
      existing?.slug ||
      `${base}-${crypto.randomUUID().slice(0, 8)}`,
  );
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      slug: z
        .string()
        .min(3)
        .max(60)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      description: z.string().trim().max(500),
    })
    .safeParse({
      name,
      slug,
      description: form.get("description") ?? existing?.description ?? "",
    });
  if (!input.success)
    feedback(
      "/empresa",
      "Confira o nome e o link da empresa (letras minúsculas, números e hífens).",
      true,
    );
  const payload = { ...input.data, timezone: "America/Sao_Paulo" };
  const result = existing
    ? await db.from("businesses").update(payload).eq("id", existing.id)
    : await db.from("businesses").insert({ ...payload, owner_id: user.id });
  if (result.error)
    feedback(
      "/empresa",
      "Não foi possível salvar. O link pode já estar em uso.",
      true,
    );
  feedback("/empresa", "Informações da empresa salvas.");
}

export async function saveProfile(form: FormData) {
  const { db, user } = await authenticated();
  const name = z
    .string()
    .trim()
    .min(2)
    .max(80)
    .safeParse(form.get("display_name"));
  if (!name.success)
    feedback("/cliente", "Informe um nome entre 2 e 80 caracteres.", true);
  const { error } = await db
    .from("profiles")
    .update({ display_name: name.data })
    .eq("id", user.id);
  if (error) feedback("/cliente", "Não foi possível atualizar seu nome.", true);
  feedback("/cliente", "Nome atualizado para seus próximos agendamentos.");
}
export async function saveService(form: FormData) {
  const { db, user } = await subscribed();
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      description: z.string().trim().max(500).default(""),
      duration_minutes: z.coerce.number().int().min(15).max(480).multipleOf(15),
      price: z.string().regex(/^\d{1,6}([.,]\d{1,2})?$/),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    feedback(
      "/empresa",
      "Confira serviço, duração (múltiplo de 15 minutos) e preço.",
      true,
    );
  const { data: business } = await db
    .from("businesses")
    .select("id")
    .eq("owner_id", user.id)
    .single();
  if (!business) feedback("/empresa", "Cadastre sua empresa primeiro.", true);
  const { price, ...values } = input.data;
  const payload = {
    ...values,
    price_cents: Math.round(Number(price.replace(",", ".")) * 100),
    active: form.get("active") === "on",
  };
  const id = form.get("service_id");
  const result = id
    ? await db
        .from("services")
        .update(payload)
        .eq("id", String(id))
        .eq("business_id", business.id)
    : await db
        .from("services")
        .insert({ ...payload, business_id: business.id });
  if (result.error)
    feedback("/empresa", "Não foi possível salvar o serviço.", true);
  feedback("/empresa", "Serviço salvo.");
}
export async function saveHours(form: FormData) {
  const { db } = await subscribed();
  const rows = [];
  for (let day = 0; day < 7; day++) {
    if (form.get(`day_${day}`) !== "on") {
      continue;
    }
    const start = String(form.get(`start_${day}`));
    const end = String(form.get(`end_${day}`));
    if (
      !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(start) ||
      !/^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(end) ||
      start >= end
    )
      feedback(
        "/empresa",
        "Use horários em intervalos de 15 minutos, com início anterior ao fim.",
        true,
      );
    rows.push({
      weekday: day,
      start_time: start,
      end_time: end,
    });
  }
  const { error } = await db.rpc("save_business_hours", { p_hours: rows });
  if (error)
    feedback(
      "/empresa",
      "Não foi possível salvar a disponibilidade. Nenhuma alteração parcial foi aplicada.",
      true,
    );
  feedback(
    "/empresa",
    "Disponibilidade atualizada. Agendamentos existentes foram preservados.",
  );
}
export async function bookAppointment(form: FormData) {
  const { db } = await authenticated();
  const input = z
    .object({
      business_id: z.uuid(),
      service_id: z.uuid(),
      starts_at: z.iso.datetime({ offset: true }),
    })
    .safeParse(Object.fromEntries(form));
  const path = destination(form.get("next"));
  if (!input.success)
    feedback(path, "Selecione um serviço e um horário válido.", true);
  const { error } = await db.rpc("book_appointment", {
    p_business_id: input.data.business_id,
    p_service_id: input.data.service_id,
    p_starts_at: input.data.starts_at,
  });
  if (error)
    feedback(
      path,
      "Esse horário não pôde ser reservado. Atualize a disponibilidade e tente novamente.",
      true,
    );
  feedback("/cliente", "Agendamento enviado. Acompanhe a confirmação aqui.");
}
export async function changeAppointment(form: FormData) {
  const { db } = await authenticated();
  const path = form.get("return_to") === "/empresa" ? "/empresa" : "/cliente";
  const input = z
    .object({
      appointment_id: z.uuid(),
      action: z.enum([
        "confirm",
        "cancel",
        "reschedule",
        "complete",
        "comment",
      ]),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) feedback(path, "Ação inválida.", true);
  const starts = String(form.get("starts_at") || "");
  if (
    input.data.action === "reschedule" &&
    !z.iso.datetime({ offset: true }).safeParse(starts).success
  )
    feedback(path, "Escolha um novo horário disponível.", true);
  const comment = String(form.get("comment") || "").trim();
  if (comment.length > 500)
    feedback(path, "O comentário deve ter até 500 caracteres.", true);
  const { error } = await db.rpc("update_appointment", {
    p_appointment_id: input.data.appointment_id,
    p_action: input.data.action,
    p_starts_at: starts || null,
    p_comment: input.data.action === "comment" ? comment : null,
  });
  if (error)
    feedback(
      path,
      "Não foi possível alterar. Verifique o status e a disponibilidade.",
      true,
    );
  feedback(path, "Agendamento atualizado.");
}
export async function requestErasure() {
  const { db } = await authenticated();
  const { error } = await db.rpc("request_data_erasure");
  if (error)
    feedback("/cliente", "Não foi possível registrar. Tente novamente.", true);
  feedback(
    "/cliente",
    "Solicitação de exclusão registrada. O responsável analisará retenções legais e responderá pelo seu e-mail de cadastro.",
  );
}
