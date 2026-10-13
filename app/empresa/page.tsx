import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isConfigured, supabase } from "@/lib/supabase";
import { hasBusinessSubscription } from "@/lib/subscription";
import { saveBusiness, saveService, saveHours } from "@/lib/actions";
import {
  Appointment,
  Business,
  BusinessHours,
  Service,
  money,
} from "@/lib/types";
import {
  analyticsRange,
  analyticsRangeLabels,
  analyticsRanges,
  parseBusinessAnalytics,
} from "@/lib/business-analytics";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { Appointments } from "@/components/appointments";
import { BusinessShare } from "@/components/business-share";
import { BusinessAnalytics } from "@/components/business-analytics";
import { publicBusinessLink } from "@/lib/public-business-link";

export const metadata: Metadata = { title: "Minha empresa" };
const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function ServiceForm({ service }: { service?: Service }) {
  return (
    <form className="stack service-form" action={saveService}>
      {service && <input type="hidden" name="service_id" value={service.id} />}
      <label className="field">
        Nome do serviço
        <input
          name="name"
          minLength={2}
          maxLength={100}
          defaultValue={service?.name}
          required
        />
      </label>
      <div className="grid-2">
        <label className="field">
          Duração (minutos)
          <input
            type="number"
            name="duration_minutes"
            min={15}
            max={480}
            step={15}
            defaultValue={service?.duration_minutes || 30}
            required
          />
        </label>
        <label className="field">
          Preço (R$)
          <input
            name="price"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={service ? (service.price_cents / 100).toFixed(2) : ""}
            pattern="[0-9]{1,6}([.,][0-9]{1,2})?"
            required
          />
        </label>
      </div>
      <details>
        <summary>Descrição opcional</summary>
        <label className="field">
          <span className="sr-only">Descrição do serviço</span>
          <textarea
            name="description"
            maxLength={500}
            defaultValue={service?.description}
          />
        </label>
      </details>
      {service ? (
        <label className="inline">
          <input
            type="checkbox"
            name="active"
            defaultChecked={service.active}
          />
          Disponível para agendar
        </label>
      ) : (
        <input type="hidden" name="active" value="on" />
      )}
      <button className="button">
        {service ? "Salvar serviço" : "Adicionar serviço"}
      </button>
    </form>
  );
}

function BusinessForm({ business }: { business?: Business }) {
  return (
    <form className="stack" action={saveBusiness}>
      <label className="field">
        Nome da empresa
        <input
          name="name"
          maxLength={100}
          minLength={2}
          defaultValue={business?.name}
          autoComplete="organization"
          required
        />
      </label>
      {business && (
        <>
          <label className="field">
            Link da agenda
            <input
              name="slug"
              maxLength={60}
              minLength={3}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              defaultValue={business.slug}
              required
            />
            <small>Letras minúsculas, números e hífens.</small>
          </label>
          <details>
            <summary>Descrição opcional</summary>
            <label className="field">
              <span className="sr-only">Sobre a empresa</span>
              <textarea
                name="description"
                maxLength={500}
                defaultValue={business.description}
              />
            </label>
          </details>
        </>
      )}
      <small className="muted">
        {business
          ? "Nome, link e descrição são públicos."
          : "Seu nome ficará público. O link da agenda será criado automaticamente."}
      </small>
      <button className="button">
        {business ? "Salvar empresa" : "Criar empresa"}
      </button>
    </form>
  );
}

export default async function Company({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    range?: string | string[];
  }>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const params = await searchParams;
  const range = analyticsRange(params.range);
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/entrar?next=/empresa");
  if (!(await hasBusinessSubscription(db))) redirect("/planos");
  const { data, error } = await db
    .from("businesses")
    .select("*")
    .eq("owner_id", user.id)
    .maybeSingle();
  const business = data as Business | null;
  const sharing = business ? await publicBusinessLink(business.slug) : null;
  let services: Service[] = [];
  let hours: BusinessHours[] = [];
  let appointments: Appointment[] = [];
  let report = null;
  let loadError = Boolean(error);
  let appointmentsError = false;
  let settingsError = false;
  if (business) {
    const [s, h, a, analytics] = await Promise.all([
      db
        .from("services")
        .select("*")
        .eq("business_id", business.id)
        .order("name"),
      db.from("business_hours").select("*").eq("business_id", business.id),
      db
        .from("appointments")
        .select("*")
        .eq("business_id", business.id)
        .order("starts_at", { ascending: false })
        .limit(100),
      db.rpc("business_analytics", { p_range: range }),
    ]);
    services = (s.data || []) as Service[];
    hours = (h.data || []) as BusinessHours[];
    appointments = (a.data || []) as Appointment[];
    report = analytics.error
      ? null
      : parseBusinessAnalytics(analytics.data, range);
    loadError ||= Boolean(s.error || h.error || a.error);
    appointmentsError = Boolean(a.error);
    settingsError = Boolean(s.error || h.error);
  }
  const needsSetup = !services.length || !hours.length;
  const settings =
    business && !settingsError ? (
      <section className="stack" aria-labelledby="settings-heading">
        <h2 id="settings-heading">Configurar agenda</h2>
        <details className="settings-section" open={!services.length}>
          <summary>
            Serviços
            {services.length
              ? ` (${services.length})`
              : " · adicione o primeiro"}
          </summary>
          <div className="stack">
            <ServiceForm />
            {services.length > 0 && (
              <div className="service-list">
                {services.map((service) => (
                  <details className="service-row" key={service.id}>
                    <summary>
                      <span>{service.name}</span>
                      <small>
                        {service.duration_minutes} min ·{" "}
                        {money(service.price_cents)}
                        {!service.active ? " · indisponível" : ""}
                      </small>
                    </summary>
                    <ServiceForm service={service} />
                  </details>
                ))}
              </div>
            )}
          </div>
        </details>
        <details className="settings-section" open={!hours.length}>
          <summary>Horários de atendimento</summary>
          <form className="stack" action={saveHours}>
            <small className="muted">
              Horário de Brasília · um período por dia, em intervalos de 15
              minutos.
            </small>
            {weekdays.map((day, i) => {
              const h = hours.find((hour) => hour.weekday === i);
              return (
                <div className="hours-row" key={day}>
                  <label className="inline">
                    <input
                      name={`day_${i}`}
                      type="checkbox"
                      defaultChecked={Boolean(h)}
                    />
                    {day}
                  </label>
                  <label className="field">
                    Início
                    <input
                      name={`start_${i}`}
                      type="time"
                      step={900}
                      defaultValue={h?.start_time.slice(0, 5) || "09:00"}
                      required
                    />
                  </label>
                  <label className="field">
                    Fim
                    <input
                      name={`end_${i}`}
                      type="time"
                      step={900}
                      defaultValue={h?.end_time.slice(0, 5) || "18:00"}
                      required
                    />
                  </label>
                </div>
              );
            })}
            <button className="button">Salvar horários</button>
          </form>
        </details>
        <details className="settings-section">
          <summary>Informações da empresa</summary>
          <BusinessForm business={business} />
        </details>
      </section>
    ) : null;
  return (
    <AppShell active="empresa">
      <div className="page-intro">
        <span className="eyebrow">Minha empresa</span>
        <h1>{business ? business.name : "Crie sua empresa"}</h1>
        {!business && (
          <p className="muted">
            Comece pelo nome. Depois, adicione um serviço e seus horários.
          </p>
        )}
      </div>
      <Notices params={params} />
      {loadError && (
        <p className="notice error" role="alert">
          Não foi possível carregar os dados da empresa. Atualize a página e
          tente novamente.
        </p>
      )}
      {!business && !loadError && (
        <section className="setup-form" aria-label="Criar empresa">
          <BusinessForm />
        </section>
      )}
      {business && (
        <>
          {needsSetup && settings}
          <section
            className="dashboard stack"
            aria-labelledby="analytics-heading"
          >
            <div className="report-heading">
              <h2 id="analytics-heading">Visão da agenda</h2>
              <nav className="period-filter" aria-label="Período da análise">
                {analyticsRanges.map((value) => (
                  <Link
                    key={value}
                    href={`/empresa?range=${value}`}
                    aria-current={value === range ? "page" : undefined}
                    scroll={false}
                  >
                    {analyticsRangeLabels[value]}
                  </Link>
                ))}
              </nav>
            </div>
            {report ? (
              <BusinessAnalytics key={range} report={report} />
            ) : (
              <p className="notice error" role="alert">
                Não foi possível carregar a análise. Atualize a página para
                tentar novamente.
              </p>
            )}
          </section>
          <section
            className="stack agenda-section"
            aria-labelledby="appointments-heading"
          >
            <div className="inline between">
              <h2 id="appointments-heading">Agendamentos</h2>
              <small className="muted">Últimos 100 registros</small>
            </div>
            {appointmentsError ? (
              <p className="notice error" role="alert">
                Não foi possível carregar os agendamentos.
              </p>
            ) : (
              <Appointments
                items={appointments}
                host
                timezone={business.timezone}
              />
            )}
          </section>
          {sharing ? (
            <BusinessShare
              key={sharing.url}
              name={business.name}
              url={sharing.url}
              qrDataUrl={sharing.qrDataUrl}
            />
          ) : (
            <p className="notice">
              Seu link de agendamento está indisponível no momento. Tente
              novamente.
            </p>
          )}
          {!needsSetup && settings}
        </>
      )}
    </AppShell>
  );
}
