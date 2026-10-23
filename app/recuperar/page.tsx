import type { Metadata } from "next";
export const metadata: Metadata = { title: "Recuperar senha" };
import { redirect } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { resetPassword } from "@/lib/actions";
import { hasRecoveryGrantForAuthenticatedUser } from "@/lib/auth-recovery";
import { Notices } from "@/components/notices";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { FormSubmit } from "@/components/form-submit";
import { LockKeyhole } from "lucide-react";
export default async function Recover({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar");
  if (!(await hasRecoveryGrantForAuthenticatedUser(db, user.id)))
    redirect(
      "/entrar?form=recovery&next=%2Frecuperar&error=Solicite+um+novo+link+de+recupera%C3%A7%C3%A3o+para+definir+outra+senha.",
    );
  return (
    <main id="main" className="auth-page auth-page--single">
      <div className="auth-panel stack">
        <Link className="brand-link" href="/" aria-label="NuvLink, início">
          <BrandLogo />
        </Link>
        <div className="page-intro">
          <span className="entry-icon">
            <LockKeyhole size={22} aria-hidden="true" />
          </span>
          <h1>Defina uma nova senha</h1>
          <p className="muted">Use uma senha exclusiva para o NuvLink.</p>
        </div>
        <Notices params={await searchParams} />
        <form className="stack" action={resetPassword}>
          <label className="field">
            Nova senha
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              aria-describedby="recovery-password-help"
              required
            />
            <small id="recovery-password-help">Pelo menos 12 caracteres.</small>
          </label>
          <FormSubmit pendingLabel="Salvando nova senha…">
            Salvar nova senha
          </FormSubmit>
        </form>
      </div>
    </main>
  );
}
