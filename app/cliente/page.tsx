import type { Metadata } from "next";
export const metadata: Metadata = { title: "Meus agendamentos" };
import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { Appointment, money } from "@/lib/types";
import { requestErasure, saveProfile } from "@/lib/actions";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { Appointments } from "@/components/appointments";

export default async function Customer({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar");
  const [appointments, catalog, profile, spending, privacy] = await Promise.all(
    [
      db
        .from("appointments")
        .select("*")
        .eq("customer_id", user.id)
        .order("starts_at", { ascending: false })
        .limit(100),
      db
        .from("business_catalog")
        .select("id,name,slug,description")
        .order("name")
        .limit(50),
      db.from("profiles").select("display_name").eq("id", user.id).single(),
      db.rpc("get_my_spending"),
      db
        .from("privacy_requests")
        .select("id,requested_at,status")
        .eq("user_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ],
  );
  const items = (appointments.data || []) as Appointment[];
  const hasError = [appointments, catalog, profile, spending, privacy].some(
    (x) => x.error,
  );
  return (
    <AppShell active="cliente">
      <div className="page-intro">
        <span className="eyebrow">Seu espaço</span>
        <h1>Olá, {profile.data?.display_name || "que bom ter você aqui"}.</h1>
        <p className="muted">
          Seus encontros, seus horários e seus dados em um só lugar.
        </p>
      </div>
      <Notices params={await searchParams} />
      {hasError && (
        <p className="notice error" role="alert">
          Não foi possível carregar todos os dados. Verifique a conexão e a
          migração do banco.
        </p>
      )}
      <section className="grid-2" aria-label="Resumo">
        <div className="card metric">
          <span className="muted">Gasto em serviços concluídos</span>
          <strong>
            {spending.error
              ? "Indisponível"
              : money(Number(spending.data || 0))}
          </strong>
          <small>
            Valor dos serviços marcados como concluídos; não representa
            pagamento processado pelo MyMeet.
          </small>
        </div>
        <div className="card metric">
          <span className="muted">Próximos agendamentos</span>
          <strong>
            {
              items.filter(
                (x) =>
                  ["pending", "confirmed"].includes(x.status) &&
                  new Date(x.starts_at) > new Date(),
              ).length
            }
          </strong>
          <small>Nos últimos 100 registros da sua agenda.</small>
        </div>
      </section>
      <section className="stack">
        <h2>Meus agendamentos</h2>
        <p className="muted">Últimos 100 registros · horários de Brasília.</p>
        <Appointments items={items} />
      </section>
      <section className="stack">
        <h2>Encontre seu próximo horário</h2>
        <div className="grid-3">
          {catalog.data?.map((b) => (
            <article className="card stack" key={b.id}>
              <h3>{b.name}</h3>
              <p className="muted">{b.description}</p>
              <Link
                className="button button-secondary"
                href={`/agendar/${b.slug}`}
              >
                Ver horários
              </Link>
            </article>
          ))}
        </div>
        {!catalog.data?.length && (
          <p className="muted">
            As empresas aparecerão aqui quando criarem suas agendas. Você também
            pode usar o link enviado pela empresa.
          </p>
        )}
      </section>
      <section className="card stack">
        <h2>Você tem controle sobre seus dados</h2>
        <details>
          <summary>Atualizar meu nome</summary>
          <form className="stack" action={saveProfile}>
            <label className="field">
              Seu nome
              <input
                name="display_name"
                autoComplete="name"
                minLength={2}
                maxLength={80}
                defaultValue={profile.data?.display_name || ""}
                required
              />
            </label>
            <small>
              O novo nome vale para os próximos agendamentos. Para corrigir
              informações de reservas anteriores, fale com o contato de
              privacidade.
            </small>
            <button className="button button-secondary">Salvar meu nome</button>
          </form>
        </details>
        <p className="muted">
          Seu e-mail não é mostrado às empresas. Elas acessam somente o nome e
          os detalhes dos agendamentos feitos com elas.
        </p>
        <div className="inline">
          <a className="button button-secondary" href="/api/me/export">
            Baixar meus dados
          </a>
          <Link href="/privacidade">Entender a privacidade</Link>
        </div>
        <details>
          <summary>Solicitar exclusão da conta e dos dados</summary>
          <p>
            Esta ação registra uma solicitação para o responsável. Não exclui
            imediatamente seus dados. Obrigações legais de retenção serão
            avaliadas.
          </p>
          {privacy.data && (
            <p className="notice" role="status">
              Solicitação registrada em{" "}
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "medium",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(privacy.data.requested_at))}
              . Status:{" "}
              {
                {
                  pending: "Recebida",
                  processing: "Em análise",
                  completed: "Concluída",
                }[privacy.data.status as "pending" | "processing" | "completed"]
              }
              .
            </p>
          )}
          <form action={requestErasure}>
            <button className="button button-secondary">
              Registrar solicitação de exclusão
            </button>
          </form>
        </details>
      </section>
    </AppShell>
  );
}
