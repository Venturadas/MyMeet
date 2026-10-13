import type { Metadata } from "next";
export const metadata: Metadata = { title: "Painel da empresa" };
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
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { Appointments } from "@/components/appointments";
import { BusinessShare } from "@/components/business-share";
import { publicBusinessLink } from "@/lib/public-business-link";
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
    <form className="stack" action={saveService}>
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
      <label className="field">
        Descrição
        <textarea
          name="description"
          maxLength={500}
          defaultValue={service?.description}
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
            placeholder="80,00"
            defaultValue={service ? (service.price_cents / 100).toFixed(2) : ""}
            pattern="[0-9]{1,6}([.,][0-9]{1,2})?"
            required
          />
        </label>
      </div>
      <label className="inline">
        <input
          type="checkbox"
          name="active"
          defaultChecked={service?.active ?? true}
        />{" "}
        Disponível para novos agendamentos
      </label>
      <button className="button">
        {service ? "Salvar serviço" : "Adicionar serviço"}
      </button>
    </form>
  );
}
export default async function Company({
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
  let loadError = Boolean(error);
  if (business) {
    const [s, h, a] = await Promise.all([
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
    ]);
    services = (s.data || []) as Service[];
    hours = (h.data || []) as BusinessHours[];
    appointments = (a.data || []) as Appointment[];
    loadError ||= Boolean(s.error || h.error || a.error);
  }
  return (
    <AppShell active="empresa">
      <div className="page-intro">
        <span className="eyebrow">Painel da empresa</span>
        <h1>{business ? business.name : "Sua empresa. Sua agenda."}</h1>
        <p className="muted">
          {business
            ? "Aqui você gerencia os atendimentos da sua empresa. Configure serviços e horários e compartilhe o link da agenda com seus clientes."
            : "Este é o painel para atender seus clientes. Comece cadastrando sua empresa no formulário abaixo."}
        </p>
      </div>
      <Notices params={await searchParams} />
      {loadError && (
        <p className="notice error">
          Não foi possível carregar todos os dados. Verifique a conexão e a
          migração.
        </p>
      )}
      {!business && (
        <section className="card stack" aria-label="Como preparar sua agenda">
          <h2>Do cadastro ao primeiro agendamento</h2>
          <div className="inline">
            <span className="chip">1. Cadastre a empresa</span>
            <span className="chip">2. Adicione um serviço</span>
            <span className="chip">3. Defina os horários</span>
            <span className="chip">4. Compartilhe seu link</span>
          </div>
          <p className="muted">
            Depois de salvar sua empresa, os campos de serviços e horários
            aparecerão aqui. Se você quer agendar um serviço em outra empresa,{" "}
            <Link href="/empresas">encontre uma empresa</Link>.
          </p>
        </section>
      )}
      {business && sharing && (
        <BusinessShare
          key={sharing.url}
          name={business.name}
          url={sharing.url}
          qrDataUrl={sharing.qrDataUrl}
        />
      )}
      {business && !sharing && (
        <p className="notice">
          Não foi possível exibir seu link de agendamento agora. Tente novamente
          mais tarde.
        </p>
      )}
      <section className="grid-2">
        <div className="card stack">
          <h2>Informações da empresa</h2>
          <form className="stack" action={saveBusiness}>
            <label className="field">
              Nome
              <input
                name="name"
                maxLength={100}
                minLength={2}
                defaultValue={business?.name}
                required
              />
            </label>
            <label className="field">
              Link personalizado
              <input
                name="slug"
                maxLength={60}
                minLength={3}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                defaultValue={business?.slug}
                placeholder="meu-estudio"
                required
              />
              <small>Letras minúsculas, números e hífens.</small>
            </label>
            <label className="field">
              Sobre a empresa
              <textarea
                name="description"
                maxLength={500}
                defaultValue={business?.description}
              />
            </label>
            <p className="muted">
              Horários de Brasília · uma empresa por conta no MVP.
            </p>
            <small>
              O nome e a descrição da empresa ficam públicos em Encontrar
              empresas e no link da sua agenda.
            </small>
            <button className="button">Salvar empresa</button>
          </form>
        </div>
        {business && (
          <div className="card stack">
            <h2>Novo serviço</h2>
            <ServiceForm />
          </div>
        )}
      </section>
      {business && (
        <>
          <section className="card stack">
            <h2>Quando você atende?</h2>
            <p className="muted">
              Um período por dia. Os horários são oferecidos a cada 15 minutos,
              considerando a duração do serviço e os agendamentos existentes.
            </p>
            <form className="stack" action={saveHours}>
              {weekdays.map((day, i) => {
                const h = hours.find((x) => x.weekday === i);
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
              <button className="button">Salvar disponibilidade</button>
            </form>
          </section>
          <section className="stack">
            <h2>Seus serviços</h2>
            <div className="grid-2">
              {services.map((s) => (
                <article className="card stack" key={s.id}>
                  <h3>
                    {s.name} · {money(s.price_cents)}
                  </h3>
                  <details>
                    <summary>Editar serviço</summary>
                    <ServiceForm service={s} />
                  </details>
                </article>
              ))}
            </div>
            {!services.length && (
              <p className="muted">
                Adicione seu primeiro serviço no formulário acima.
              </p>
            )}
          </section>
          <section className="stack">
            <h2>Agendamentos da empresa</h2>
            <p className="muted">
              Últimos 100 registros. Você vê o nome e os detalhes da reserva,
              sem acessar o perfil ou o e-mail do cliente.
            </p>
            <Appointments
              items={appointments}
              host
              timezone={business.timezone}
            />
          </section>
        </>
      )}
    </AppShell>
  );
}
