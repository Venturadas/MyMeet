"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { hasBusinessSubscription } from "@/lib/subscription";
import { removeUnusedImage } from "@/lib/media-server";

const states = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;
const phone = z
  .string()
  .trim()
  .max(32)
  .transform((value) => value.replace(/[\s()+.-]/g, ""))
  .refine((value) => value === "" || /^\d{10,15}$/.test(value));
const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500),
  category: z.string().trim().max(80),
  city: z.string().trim().max(100),
  state: z.union([z.literal(""), z.enum(states)]),
  address: z.string().trim().max(240),
  phone,
  whatsapp: phone,
  instagram: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ""))
    .refine((value) => value === "" || /^[A-Za-z0-9._]{1,30}$/.test(value)),
});

function feedback(message: string, error = false): never {
  revalidatePath("/empresa");
  revalidatePath("/empresas");
  redirect(
    `/empresa?tab=perfil&${error ? "error" : "notice"}=${encodeURIComponent(message)}&notice_id=${crypto.randomUUID()}`,
  );
}

async function companyOwner() {
  if (!isConfigured()) redirect("/entrar?next=/empresa");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar?next=/empresa");
  if (!(await hasBusinessSubscription(db))) redirect("/planos");
  const { data: business, error } = await db
    .from("businesses")
    .select("id,slug")
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error || !business)
    feedback("Não foi possível verificar sua empresa. Tente novamente.", true);
  return { db, user, business };
}

export async function saveCompanyProfile(form: FormData) {
  const { db, user, business } = await companyOwner();
  const input = profileSchema.safeParse(Object.fromEntries(form));
  if (!input.success)
    feedback(
      "Confira o nome, link, telefone e Instagram. Os campos de contato são opcionais.",
      true,
    );
  const { data, error } = await db
    .from("businesses")
    .update(input.data)
    .eq("id", business.id)
    .eq("owner_id", user.id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    feedback("Não foi possível salvar. O link pode já estar em uso.", true);
  revalidatePath(`/agendar/${business.slug}`);
  revalidatePath(`/agendar/${input.data.slug}`);
  feedback("Perfil da empresa atualizado.");
}

export async function saveProfessional(form: FormData) {
  const { db, business } = await companyOwner();
  const input = z
    .object({
      name: z.string().trim().min(2).max(100),
      title: z.string().trim().max(120),
      professional_id: z.union([z.literal(""), z.uuid()]),
    })
    .safeParse({
      name: form.get("name"),
      title: form.get("title") ?? "",
      professional_id: form.get("professional_id") ?? "",
    });
  if (!input.success)
    feedback("Confira o nome e a função do profissional.", true);
  const values = {
    name: input.data.name,
    title: input.data.title,
    active: form.get("active") === "on",
  };
  const query = input.data.professional_id
    ? db
        .from("business_professionals")
        .update(values)
        .eq("id", input.data.professional_id)
        .eq("business_id", business.id)
    : db
        .from("business_professionals")
        .insert({ ...values, business_id: business.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) feedback("Não foi possível salvar o profissional.", true);
  revalidatePath(`/agendar/${business.slug}`);
  feedback("Profissional salvo.");
}

export async function deleteProfessional(form: FormData) {
  const { db, user, business } = await companyOwner();
  const id = z.uuid().safeParse(form.get("professional_id"));
  if (!id.success) feedback("Profissional inválido.", true);
  const { data: professional, error: lookupError } = await db
    .from("business_professionals")
    .select("photo_path")
    .eq("id", id.data)
    .eq("business_id", business.id)
    .maybeSingle();
  if (lookupError || !professional)
    feedback("Não foi possível verificar o profissional.", true);
  const { data, error } = await db
    .from("business_professionals")
    .delete()
    .eq("id", id.data)
    .eq("business_id", business.id)
    .select("id")
    .maybeSingle();
  if (error || !data)
    feedback("Não foi possível remover o profissional.", true);
  if (professional.photo_path)
    await removeUnusedImage(
      { db, user, businessId: business.id },
      "professional",
      professional.photo_path,
    );
  revalidatePath(`/agendar/${business.slug}`);
  feedback("Profissional removido.");
}
