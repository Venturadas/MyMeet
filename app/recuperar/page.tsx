import { redirect } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { resetPassword } from "@/lib/actions";
import { Notices } from "@/components/notices";
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
  return (
    <main id="main" className="container workspace stack">
      <h1>Defina uma nova senha</h1>
      <Notices params={await searchParams} />
      <form className="card stack" action={resetPassword}>
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
        </label>
        <button className="button">Salvar nova senha</button>
      </form>
    </main>
  );
}
