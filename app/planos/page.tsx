import type { Metadata } from "next";
import Link from "next/link";
import { Check, Clock3, ShieldCheck, Store } from "lucide-react";
import { z } from "zod";
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
  const supportContact = z
    .string()
    .trim()
    .max(254)
    .pipe(z.email())
    .safeParse(process.env.NEXT_PUBLIC_PRIVACY_CONTACT);
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
      <div className="entry-plan-grid">
        <section
          className="card stack plan-card entry-plan-card"
          aria-labelledby="plan-title"
        >
          <span className="entry-icon">
            <Store size={23} aria-hidden="true" />
          </span>
          <h2 id="plan-title">NuvLink para empresas</h2>
          <p className="plan-price">
            <strong>{money(BUSINESS_PRICE_CENTS)}</strong>{" "}
            <span>por 30 dias</span>
          </p>
          <ul className="entry-plan-features">
            <li>
              <Check size={18} aria-hidden="true" />
              <span>Uma empresa com serviços e horários personalizados.</span>
            </li>
            <li>
              <Check size={18} aria-hidden="true" />
              <span>Agenda, atendimentos e análises em um só painel.</span>
            </li>
            <li>
              <Check size={18} aria-hidden="true" />
              <span>Link público para seus clientes agendarem.</span>
            </li>
          </ul>
          <p className="muted">
            Pague por Pix. O acesso começa após a confirmação do pagamento.
            Renove quando quiser; não há débito automático.
          </p>
          {user ? (
            <PixCheckout
              configured={billingIsConfigured()}
              initialSubscription={{
                active,
                expiresAt: subscription?.current_period_end ?? null,
              }}
              supportEmail={supportContact.success ? supportContact.data : null}
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
        <aside
          className="entry-plan-aside stack"
          aria-label="Como funciona o plano"
        >
          <div className="entry-plan-explainer">
            <ShieldCheck size={22} aria-hidden="true" />
            <div>
              <h2>Você escolhe quando renovar</h2>
              <p className="muted">
                O pagamento é manual por Pix. Você confirma cada renovação, sem
                débito automático.
              </p>
            </div>
          </div>
          <div className="entry-plan-explainer">
            <Clock3 size={22} aria-hidden="true" />
            <div>
              <h2>30 dias para organizar sua agenda</h2>
              <p className="muted">
                Seu acesso começa após a confirmação do pagamento. Acompanhe o
                prazo na sua conta.
              </p>
            </div>
          </div>
          <Link className="button button-secondary" href="/empresas">
            Quero agendar um serviço
          </Link>
          <p className="muted">
            Para clientes, criar uma conta e agendar é gratuito.
          </p>
        </aside>
      </div>
      <p className="muted">
        Quer apenas agendar? Sua conta é gratuita.{" "}
        <Link href="/empresas">Encontrar empresas</Link>
      </p>
    </AppShell>
  );
}
