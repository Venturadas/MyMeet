import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { billingIsConfigured } from "@/lib/billing";
import { BUSINESS_PRICE_CENTS } from "@/lib/billing-plan";
import { hasBusinessSubscription } from "@/lib/subscription";
import { isConfigured, supabase } from "@/lib/supabase";
import { money, dateTime } from "@/lib/types";

export const metadata: Metadata = { title: "Planos" };

export default async function Plans({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string; checkout?: string }>;
}) {
  const params = await searchParams;
  const db = isConfigured() ? await supabase() : null;
  const user = db ? (await db.auth.getUser()).data.user : null;
  const active = db && user ? await hasBusinessSubscription(db) : false;
  const subscription = db && user ? await db.from("business_subscriptions").select("status,current_period_end").eq("user_id", user.id).maybeSingle() : null;
  const canPay = billingIsConfigured();

  return (
    <AppShell active="planos" authenticated={Boolean(user)}>
      <div className="page-intro">
        <span className="eyebrow">Um plano simples para sua empresa</span>
        <h1>Agende grátis. Assine para atender.</h1>
        <p className="muted">Clientes criam uma conta gratuita para reservar serviços. Para cadastrar e administrar uma empresa, é necessária uma assinatura ativa.</p>
      </div>
      <Notices params={params} />
      {active && (
        <section className="notice stack" role="status">
          <strong>Sua assinatura está ativa.</strong>
          {subscription?.data?.current_period_end && <span>Acesso até {dateTime(subscription.data.current_period_end)} · horários de Brasília.</span>}
          <Link className="button" href="/empresa">Ir para minha empresa</Link>
        </section>
      )}
      {!active && user && subscription?.data && (
        <p className="notice" role="status">{subscription.data.status === "pending" ? "Sua assinatura aguarda a confirmação do pagamento." : "Sua assinatura está suspensa ou vencida. Ative uma assinatura para voltar a receber reservas."}</p>
      )}
      {params.checkout === "return" && !active && (
        <p className="notice">Se você concluiu o pagamento, aguarde a confirmação e atualize esta página para consultar sua assinatura.</p>
      )}
      <div className="grid-2">
        <section className="card stack">
          <span className="eyebrow">Para clientes</span>
          <h2>Conta gratuita</h2>
          <p className="muted">Encontre empresas, escolha um horário e acompanhe seus agendamentos. Nenhuma assinatura é necessária para reservar.</p>
          <Link className="button button-secondary" href={user ? "/empresas" : "/entrar"}>{user ? "Encontrar empresas" : "Criar conta grátis ou entrar"}</Link>
        </section>
        <section className="card stack">
          <span className="eyebrow">Para empresas</span>
          <h2>{money(BUSINESS_PRICE_CENTS)} <small>/ mês</small></h2>
          <p className="muted">Uma empresa com serviços personalizados, agenda online, painel de atendimentos e link público para compartilhar.</p>
          <ul>
            <li>Cadastro da empresa, serviços e horários.</li>
            <li>Confirmação, cancelamento e gestão dos agendamentos.</li>
            <li>Link, WhatsApp e QR Code da sua agenda.</li>
          </ul>
          <p className="muted">Cobrança mensal recorrente pelo Mercado Pago. O acesso depende da confirmação da cobrança, não apenas do retorno ao site.</p>
          {active ? (
            <Link className="button" href="/empresa">Abrir painel da empresa</Link>
          ) : !user ? (
            <Link className="button" href="/entrar?next=/planos">Entrar para assinar</Link>
          ) : (
            <form action="/api/billing/checkout" method="post">
              <button className="button full-width" disabled={!canPay}>Assinar por {money(BUSINESS_PRICE_CENTS)}/mês</button>
            </form>
          )}
          {!canPay && !active && <p className="notice">As assinaturas estão em preparação. O pagamento será liberado em breve; nenhuma cobrança é feita nesta etapa.</p>}
        </section>
      </div>
      <section className="card stack">
        <h2>O que acontece se a assinatura vencer?</h2>
        <p className="muted">O painel da empresa e as novas reservas ficam suspensos. Os agendamentos já registrados permanecem guardados, e os clientes continuam acessando seus dados e reservas.</p>
        <div className="inline"><Link href="/cliente">Meus agendamentos</Link><Link href="/privacidade">Privacidade</Link></div>
      </section>
    </AppShell>
  );
}
