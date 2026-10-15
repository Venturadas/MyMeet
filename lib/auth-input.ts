import { z } from "zod";
const email = z.string().trim().max(254).pipe(z.email());
export function signInInput(form: FormData) {
  if (["email", "password"].some((field) => form.getAll(field).length !== 1)) return { success: false as const };
  return z.object({ email, password: z.string().min(1).max(128) }).safeParse({ email: form.get("email"), password: form.get("password") });
}
export function signUpInput(form: FormData) {
  const parsed = z.object({ name: z.string().trim().min(2).max(80), email, password: z.string().min(12).max(128) }).safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (["name", "email", "password", "privacy"].some((field) => form.getAll(field).length > 1)) return { success: false as const, message: "Não foi possível ler o formulário. Atualize a página e tente novamente." };
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { success: false as const, message: field === "name" ? "Informe seu nome, entre 2 e 80 caracteres." : field === "email" ? "Informe um e-mail válido." : "Use uma senha com 12 a 128 caracteres." };
  }
  if (form.get("privacy") !== "on") return { success: false as const, message: "Confirme a leitura da política de privacidade para criar a conta." };
  return { success: true as const, data: parsed.data };
}
