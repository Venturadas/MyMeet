"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { safeAuthDestination } from "@/lib/auth-navigation";

function destination(value: FormDataEntryValue | null) {
  const path = safeAuthDestination(value, "");
  return path.startsWith("/agendar/") || /^\/cliente(?:\?|$)/.test(path)
    ? path
    : "/cliente";
}

function feedback(path: string, message: string, error = false): never {
  redirect(
    `${path}${path.includes("?") ? "&" : "?"}${error ? "error" : "notice"}=${encodeURIComponent(message)}&notice_id=${crypto.randomUUID()}`,
  );
}

async function authenticated(path: string) {
  if (!isConfigured())
    feedback(path, "Esta ação está temporariamente indisponível.", true);
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) redirect(`/entrar?next=${encodeURIComponent(path)}`);
  return db;
}

function refreshEngagement(path: string) {
  revalidatePath(path.split("?")[0]);
  revalidatePath("/cliente");
  revalidatePath("/empresas");
  revalidatePath("/agendar/[slug]", "page");
  revalidatePath("/empresa");
}

export async function toggleFavorite(form: FormData) {
  const path = destination(form.get("return_to"));
  const input = z
    .object({ business_id: z.uuid(), favorite: z.enum(["true", "false"]) })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    feedback(path, "Não foi possível atualizar seus favoritos.", true);
  const db = await authenticated(path);
  const { error } = await db.rpc("toggle_favorite", {
    p_business_id: input.data.business_id,
    p_favorite: input.data.favorite === "true",
  });
  if (error)
    feedback(
      path,
      "Não foi possível atualizar seus favoritos. Tente novamente.",
      true,
    );
  refreshEngagement(path);
  feedback(
    path,
    input.data.favorite === "true"
      ? "Empresa adicionada aos favoritos."
      : "Empresa removida dos favoritos.",
  );
}

export async function saveReview(form: FormData) {
  const path = destination(form.get("return_to"));
  const input = z
    .object({
      appointment_id: z.uuid(),
      rating: z.coerce.number().int().min(1).max(5),
      comment: z.string().trim().max(1000),
    })
    .safeParse({
      appointment_id: form.get("appointment_id"),
      rating: form.get("rating"),
      comment: form.get("comment") ?? "",
    });
  if (!input.success)
    feedback(
      path,
      "Escolha uma nota de 1 a 5 e um comentário de até 1.000 caracteres.",
      true,
    );
  const db = await authenticated(path);
  // Identity and company are derived from the customer's completed appointment.
  const { error } = await db.rpc("save_review", {
    p_appointment_id: input.data.appointment_id,
    p_rating: input.data.rating,
    p_comment: input.data.comment,
  });
  if (error)
    feedback(
      path,
      error.code === "42501"
        ? "Você só pode avaliar um atendimento concluído da sua conta em outra empresa."
        : "Não foi possível salvar sua avaliação. Tente novamente em instantes.",
      true,
    );
  refreshEngagement(path);
  feedback(path, "Avaliação salva. Obrigado pelo seu comentário!");
}

export async function deleteReview(form: FormData) {
  const path = destination(form.get("return_to"));
  const review = z.uuid().safeParse(form.get("review_id"));
  if (!review.success)
    feedback(path, "Não foi possível excluir esta avaliação.", true);
  const db = await authenticated(path);
  const { error } = await db.rpc("delete_review", { p_review_id: review.data });
  if (error)
    feedback(
      path,
      "Não foi possível excluir esta avaliação. Tente novamente.",
      true,
    );
  refreshEngagement(path);
  feedback(path, "Avaliação excluída.");
}
