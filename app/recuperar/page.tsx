import type { Metadata } from "next";
export const metadata: Metadata = { title: "Recuperar senha" };
import { redirect } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { resetPassword } from "@/lib/actions";
import { hasRecoveryGrantForAuthenticatedUser } from "@/lib/auth-recovery";
import { Notices } from "@/components/notices";
import Link from "next/link";
import { Logo } from "@/components/ui";
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
    redirect("/entrar?form=recovery&next=%2Frecuperar&error=Solicite+um+novo+link+de+recupera%C3%A7%C3%A3o+para+definir+outra+senha.");
  return (
    <main id="main" className="container auth-shell stack">
      <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
        <Logo />
      </Link>
      <div className="page-intro">
        <h1>Defina uma nova senha</h1>
        <p className="muted">Use uma senha exclusiva para o NuvemMeet.</p>
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
            required
          />
          <small>Pelo menos 12 caracteres.</small>
        </label>
        <button className="button">Salvar nova senha</button>
      </form>
    </main>
  );
}
