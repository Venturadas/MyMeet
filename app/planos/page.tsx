import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { PixCheckout } from "@/components/pix-checkout";
import { billingIsConfigured } from "@/lib/billing";
import { BUSINESS_PRICE_CENTS } from "@/lib/billing-plan";
import { hasBusinessSubscription } from "@/lib/subscription";
import { isConfigured, supabase } from "@/lib/supabase";
import { money } from "@/lib/types";

export const metadata: Metadata = { title: "Plano para empresas" };

export default async function Plans({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const db = isConfigured() ? await supabase() : null;
  const user = db ? (await db.auth.getUser()).data.user : null;
  const active = db && user ? await hasBusinessSubscription(db) : false;
  const { data: subscription } =
    db && user
      ? await db
          .from("business_subscriptions")
          .select("current_period_end")
          .eq("user_id", user.id)
          .maybeSingle()
      : { data: null };

  return (
    <AppShell active="planos" authenticated={Boolean(user)}>
      <div className="page-intro">
        <h1>Plano para empresas</h1>
        <p className="muted">Sua agenda online, sem complicação.</p>
      </div>
      <Notices params={params} />
      <section className="card stack plan-card" aria-labelledby="plan-title">
        <h2 id="plan-title">NuvemMeet para empresas</h2>
        <p className="plan-price">
          <strong>{money(BUSINESS_PRICE_CENTS)}</strong>{" "}
          <span>por 30 dias</span>
        </p>
        <ul className="plan-details">
          <li>Uma empresa com serviços e horários personalizados.</li>
          <li>Agenda, atendimentos e análises em um só painel.</li>
          <li>Link público para seus clientes agendarem.</li>
        </ul>
        <p className="muted">
          Pague por Pix. O acesso começa após a confirmação do pagamento. Renove
          quando quiser; não há débito automático.
        </p>
        {user ? (
          <PixCheckout
            configured={billingIsConfigured()}
            initialSubscription={{
              active,
              expiresAt: subscription?.current_period_end ?? null,
            }}
          />
        ) : (
          <Link className="button" href="/entrar?next=/planos">
            Criar conta grátis ou entrar
          </Link>
        )}
        <p className="muted">
          Ao vencer, o painel e novas reservas ficam suspensos. Seus
          agendamentos permanecem guardados.
        </p>
      </section>
      <p className="muted">
        Quer apenas agendar? Sua conta é gratuita.{" "}
        <Link href="/empresas">Encontrar empresas</Link>
      </p>
    </AppShell>
  );
}
