import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  Settings2,
  Share2,
} from "lucide-react";
import { ErrorState, PageHeader } from "@/components/ui";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { hasBusinessSubscription } from "@/lib/subscription";
import { companyAccessRedirect } from "@/lib/company-access";
import type {
  Appointment,
  Business,
  BusinessHours,
  Service,
} from "@/lib/types";
import {
  analyticsRange,
  analyticsRangeLabels,
  analyticsRanges,
  parseBusinessAnalytics,
} from "@/lib/business-analytics";
import { publicBusinessLink } from "@/lib/public-business-link";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import { Appointments } from "@/components/appointments";
import { BusinessShare } from "@/components/business-share";
import { BusinessAnalytics } from "@/components/business-analytics";
import {
  CompanyCreationForm,
  CompanyHoursForm,
  CompanyProfileForm,
  CompanyProfessionals,
  CompanyServices,
  type CompanyProfessional,
} from "@/components/company-forms";
import {
  CompanyClients,
  CompanyReviewSummary,
  CompanyReviews,
  parseCompanyClients,
  parseCompanyReviewSummary,
  parseCompanyReviews,
} from "@/components/company-sections";
import { GalleryManager } from "@/components/media-gallery";
import { MediaUploader } from "@/components/media-uploader";

export const metadata: Metadata = { title: "Minha empresa" };
const tabs = [
  "dashboard",
  "agenda",
  "servicos",
  "clientes",
  "avaliacoes",
  "perfil",
  "galeria",
  "configuracoes",
] as const;
type CompanyTab = (typeof tabs)[number];
const tabLabels: Record<CompanyTab, string> = {
  dashboard: "Dashboard",
  agenda: "Agenda",
  servicos: "Serviços",
  clientes: "Clientes",
  avaliacoes: "Avaliações",
  perfil: "Perfil da empresa",
  galeria: "Galeria",
  configuracoes: "Configurações",
};
const tabDescriptions: Record<CompanyTab, string> = {
  dashboard: "Sua agenda e os resultados do negócio, em um só lugar.",
  agenda: "Acompanhe seus horários e gerencie cada atendimento.",
  servicos: "Organize o que seus clientes podem agendar.",
  clientes: "Consulte o histórico de quem já agendou com você.",
  avaliacoes: "Veja a experiência dos seus clientes após os atendimentos.",
  perfil: "Apresente sua empresa e compartilhe sua agenda.",
  galeria: "Mostre seu espaço, seus trabalhos e sua equipe.",
  configuracoes: "Defina o expediente e gerencie seu acesso.",
};
const appointmentColumns =
  "id,business_id,service_id,service_name,customer_id,customer_name,starts_at,ends_at,status,price_cents,comment";
const pageSize = 25;
const gallerySchema = z
  .array(
    z.object({
      id: z.uuid(),
      storage_path: z.string(),
      position: z.number().int().min(0).max(11),
    }),
  )
  .max(12);
const professionalsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      name: z.string().min(2).max(100),
      title: z.string().max(120),
      active: z.boolean(),
      photo_path: z.string().nullable(),
    }),
  )
  .max(20);

function LoadError({ label = "os dados" }: { label?: string }) {
  return (
    <ErrorState
      description={`Não foi possível carregar ${label}. Tente novamente em instantes.`}
    />
  );
}
function Pagination({
  tab,
  page,
  hasNext,
  extras = "",
}: {
  tab: CompanyTab;
  page: number;
  hasNext: boolean;
  extras?: string;
}) {
  if (page === 1 && !hasNext) return null;
  return (
    <nav className="inline between report-pagination" aria-label="Paginação">
      {page > 1 ? (
        <Link
          className="button button-secondary"
          href={`/empresa?tab=${tab}&page=${page - 1}${extras}`}
          prefetch={false}
        >
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <small>Página {page}</small>
      {hasNext && (
        <Link
          className="button button-secondary"
          href={`/empresa?tab=${tab}&page=${page + 1}${extras}`}
          prefetch={false}
        >
          Próxima
        </Link>
      )}
    </nav>
  );
}

export default async function Company({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    range?: string | string[];
    tab?: string;
    page?: string;
    status?: string;
    date?: string;
  }>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const params = await searchParams;
  const tab: CompanyTab =
    tabs.find((value) => value === params.tab) || "dashboard";
  const range = analyticsRange(params.range);
  const parsedPage = z.coerce
    .number()
    .int()
    .min(1)
    .max(4001)
    .safeParse(params.page || "1");
  const page = parsedPage.success ? parsedPage.data : 1;
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    redirect(`/entrar?next=${encodeURIComponent(`/empresa?tab=${tab}`)}`);
  const activeSubscription = await hasBusinessSubscription(db);
  const accessRedirect = companyAccessRedirect(activeSubscription, tab);
  if (accessRedirect) redirect(accessRedirect);
  const businessColumns =
    "id,owner_id,name,slug,description,timezone" +
    (tab === "perfil"
      ? ",category,city,state,address,phone,whatsapp,instagram,logo_path,cover_path"
      : "");
  const [{ data, error }, profile] = await Promise.all([
    activeSubscription ? db
      .from("businesses")
      .select(businessColumns)
      .eq("owner_id", user.id)
      .maybeSingle() : db.rpc("get_my_business_agenda_context"),
    db
      .from("profiles")
      .select("display_name,avatar_path")
      .eq("id", user.id)
      .single(),
  ]);
  if (!activeSubscription && !data && !error) redirect("/planos");
  const business = data as Business | null;
  let content: React.ReactNode = null;
  if (business && !error) {
    if (tab === "dashboard") {
      const [analytics, upcoming] = await Promise.all([
        db.rpc("business_analytics", { p_range: range }),
        db
          .from("appointments")
          .select(appointmentColumns)
          .eq("business_id", business.id)
          .in("status", ["pending", "confirmed"])
          .gte("starts_at", new Date().toISOString())
          .order("starts_at")
          .limit(3),
      ]);
      const report = analytics.error
        ? null
        : parseBusinessAnalytics(analytics.data, range);
      content = (
        <div className="stack">
          <section
            className="dashboard business-dashboard stack"
            aria-labelledby="analytics-heading"
          >
            <div className="report-heading">
              <h2 id="analytics-heading">Visão da agenda</h2>
              <nav className="period-filter" aria-label="Período da análise">
                {analyticsRanges.map((value) => (
                  <Link
                    key={value}
                    href={`/empresa?range=${value}`}
                    prefetch={false}
                    aria-current={value === range ? "page" : undefined}
                    scroll={false}
                  >
                    {analyticsRangeLabels[value]}
                  </Link>
                ))}
              </nav>
            </div>
            {report ? (
              <>
                <p className="company-today">
                  <CalendarDays size={17} aria-hidden="true" />
                  <strong>{report.days.at(-1)!.appointments}</strong>{" "}
                  {report.days.at(-1)!.appointments === 1
                    ? "agendamento hoje"
                    : "agendamentos hoje"}
                </p>
                <BusinessAnalytics key={range} report={report} />
              </>
            ) : (
              <LoadError label="a análise" />
            )}
          </section>
          <section className="stack" aria-labelledby="upcoming-heading">
            <div className="inline between">
              <h2 id="upcoming-heading">Próximos agendamentos</h2>
              <Link
                className="business-section-link"
                href="/empresa?tab=agenda"
                prefetch={false}
              >
                Ver agenda <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
            </div>
            {upcoming.error ? (
              <LoadError label="os próximos agendamentos" />
            ) : (
              <Appointments
                items={(upcoming.data || []) as Appointment[]}
                host
                timezone={business.timezone}
                returnTo="/empresa?tab=agenda"
              />
            )}
          </section>
          <div className="company-setup-links inline">
            <Link href="/empresa?tab=servicos" prefetch={false}>
              <Settings2 size={18} aria-hidden="true" /> Configurar serviços
            </Link>
            <Link href="/empresa?tab=configuracoes" prefetch={false}>
              <Clock3 size={18} aria-hidden="true" /> Horários de atendimento
            </Link>
            <Link href="/empresa?tab=perfil#company-share" prefetch={false}>
              <Share2 size={18} aria-hidden="true" /> Compartilhar agenda
            </Link>
          </div>
        </div>
      );
    } else if (tab === "agenda") {
      const status =
        ["pending", "confirmed", "completed", "cancelled"].find(
          (value) => value === params.status,
        ) || "";
      const dateResult = z.iso.date().safeParse(params.date);
      const date = dateResult.success ? dateResult.data : "";
      let query = db
        .from("appointments")
        .select(appointmentColumns, { count: "exact" })
        .eq("business_id", business.id);
      if (status) query = query.eq("status", status);
      if (date) {
        const start = new Date(`${date}T00:00:00-03:00`);
        query = query
          .gte("starts_at", start.toISOString())
          .lt("starts_at", new Date(start.getTime() + 86400000).toISOString());
      }
      const appointments = await query
        .order("starts_at", { ascending: false })
        .order("id")
        .range((page - 1) * pageSize, page * pageSize - 1);
      const extras = `${status ? `&status=${status}` : ""}${date ? `&date=${date}` : ""}`;
      content = (
        <div className="stack">
          <form
            className="company-agenda-filter inline"
            action="/empresa"
            method="get"
          >
            <input type="hidden" name="tab" value="agenda" />
            <label className="field">
              Status
              <select name="status" defaultValue={status}>
                <option value="">Todos</option>
                <option value="pending">Aguardando confirmação</option>
                <option value="confirmed">Confirmados</option>
                <option value="completed">Concluídos</option>
                <option value="cancelled">Cancelados</option>
              </select>
            </label>
            <label className="field">
              Data
              <input name="date" type="date" defaultValue={date} />
            </label>
            <button className="button button-secondary">Filtrar</button>
            {(status || date) && (
              <Link href="/empresa?tab=agenda" prefetch={false}>
                Limpar
              </Link>
            )}
          </form>
          {appointments.error ? (
            <LoadError label="os agendamentos" />
          ) : (
            <>
              <small className="muted">
                {appointments.count || 0}{" "}
                {(appointments.count || 0) === 1
                  ? "agendamento"
                  : "agendamentos"}
              </small>
              <Appointments
                items={(appointments.data || []) as Appointment[]}
                host
                allowReschedule={activeSubscription}
                timezone={business.timezone}
                returnTo="/empresa?tab=agenda"
              />
              <Pagination
                tab={tab}
                page={page}
                hasNext={page * pageSize < (appointments.count || 0)}
                extras={extras}
              />
            </>
          )}
        </div>
      );
    } else if (tab === "servicos") {
      const services = await db
        .from("services")
        .select(
          "id,business_id,name,description,duration_minutes,price_cents,active",
        )
        .eq("business_id", business.id)
        .order("name");
      content = services.error ? (
        <LoadError label="os serviços" />
      ) : (
        <CompanyServices services={(services.data || []) as Service[]} />
      );
    } else if (tab === "clientes") {
      const result = await db.rpc("business_client_summary", {
        p_limit: pageSize + 1,
        p_offset: (page - 1) * pageSize,
      });
      const clients = result.error ? null : parseCompanyClients(result.data);
      content = clients ? (
        <div className="stack">
          <small className="muted">Somente dados dos seus agendamentos.</small>
          <CompanyClients
            clients={clients.slice(0, pageSize)}
            timezone={business.timezone}
          />
          <Pagination
            tab={tab}
            page={page}
            hasNext={clients.length > pageSize}
          />
        </div>
      ) : (
        <LoadError label="os clientes" />
      );
    } else if (tab === "avaliacoes") {
      const [summaryResult, reviewsResult] = await Promise.all([
        db.rpc("business_review_summary"),
        db
          .from("business_reviews_public")
          .select("id,rating,comment,reviewer_name,created_at")
          .eq("business_id", business.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range((page - 1) * 20, page * 20 - 1),
      ]);
      const summary = summaryResult.error
        ? null
        : parseCompanyReviewSummary(summaryResult.data);
      const reviews = reviewsResult.error
        ? null
        : parseCompanyReviews(reviewsResult.data);
      content = (
        <div className="stack">
          {summary ? (
            <CompanyReviewSummary summary={summary} />
          ) : (
            <LoadError label="a média das avaliações" />
          )}
          {reviews ? (
            <CompanyReviews reviews={reviews} timezone={business.timezone} />
          ) : (
            <LoadError label="as avaliações" />
          )}
          {summary && reviews && (
            <Pagination
              tab={tab}
              page={page}
              hasNext={page * 20 < summary.count}
            />
          )}
        </div>
      );
    } else if (tab === "perfil") {
      const [professionalsResult, sharing] = await Promise.all([
        db
          .from("business_professionals")
          .select("id,name,title,active,photo_path")
          .eq("business_id", business.id)
          .order("name")
          .limit(20),
        publicBusinessLink(business.slug),
      ]);
      const professionals = professionalsResult.error
        ? null
        : professionalsSchema.safeParse(professionalsResult.data);
      content = (
        <div className="stack">
          <nav
            className="business-profile-nav"
            aria-label="Seções do perfil da empresa"
          >
            <a href="#company-images">Imagens</a>
            <a href="#company-profile">Dados e contatos</a>
            <a href="#company-professionals">Profissionais</a>
            <a href="#company-share">Compartilhar</a>
          </nav>
          <section
            className="business-panel stack"
            id="company-images"
            aria-labelledby="company-images-heading"
          >
            <div className="section-heading">
              <h2 id="company-images-heading">Imagens da empresa</h2>
            </div>
            <p className="muted">
              Uma logo e uma capa ajudam seus clientes a reconhecer seu negócio.
            </p>
            <div className="company-profile-media">
              <MediaUploader
                kind="logo"
                label="Logo da empresa"
                currentPath={business.logo_path}
              />
              <MediaUploader
                kind="cover"
                label="Foto de capa"
                currentPath={business.cover_path}
              />
            </div>
          </section>
          <CompanyProfileForm business={business} />
          {professionals?.success ? (
            <CompanyProfessionals
              professionals={professionals.data as CompanyProfessional[]}
            />
          ) : (
            <LoadError label="os profissionais" />
          )}
          {sharing ? (
            <BusinessShare
              key={sharing.url}
              name={business.name}
              url={sharing.url}
              qrDataUrl={sharing.qrDataUrl}
            />
          ) : (
            <p className="notice">
              Seu link está indisponível no momento. Tente novamente.
            </p>
          )}
        </div>
      );
    } else if (tab === "galeria") {
      const result = await db
        .from("business_gallery")
        .select("id,storage_path,position")
        .eq("business_id", business.id)
        .order("position")
        .limit(12);
      const gallery = result.error
        ? null
        : gallerySchema.safeParse(result.data);
      content = gallery?.success ? (
        <GalleryManager images={gallery.data} />
      ) : (
        <LoadError label="a galeria" />
      );
    } else if (tab === "configuracoes") {
      const result = await db
        .from("business_hours")
        .select("business_id,weekday,start_time,end_time")
        .eq("business_id", business.id)
        .order("weekday");
      content = (
        <div className="stack">
          <section className="business-panel stack">
            <h2>Horários de atendimento</h2>
            {result.error ? (
              <LoadError label="os horários" />
            ) : (
              <CompanyHoursForm
                hours={(result.data || []) as BusinessHours[]}
              />
            )}
          </section>
          <section className="business-panel stack">
            <h2>Empresa e acesso</h2>
            <div className="inline">
              <Link
                className="button button-secondary"
                href="/empresa?tab=perfil"
                prefetch={false}
              >
                Editar perfil da empresa
              </Link>
              <Link
                className="button button-secondary"
                href="/planos"
                prefetch={false}
              >
                Plano e assinatura
              </Link>
              <Link href="/cliente?tab=configuracoes" prefetch={false}>
                Segurança da minha conta
              </Link>
            </div>
          </section>
        </div>
      );
    }
  }
  return (
    <AppShell
      active="empresa"
      workspace="empresa"
      activeTab={tab}
      account={{
        name: profile.data?.display_name,
        avatarPath: profile.data?.avatar_path,
      }}
    >
      <div className="business-workspace stack">
        <PageHeader
          eyebrow={business?.name || "Minha empresa"}
          title={business ? tabLabels[tab] : "Crie sua empresa"}
          description={
            business
              ? tabDescriptions[tab]
              : "Comece pelo nome. Você pode completar o perfil depois."
          }
          action={
            business && activeSubscription ? (
              <Link
                className="button button-secondary"
                href={`/agendar/${business.slug}`}
                prefetch={false}
              >
                Ver perfil público <ExternalLink size={16} aria-hidden="true" />
              </Link>
            ) : undefined
          }
        />
        <Notices params={params} />
        {!activeSubscription && <p className="notice">Seu plano venceu. Os compromissos existentes continuam disponíveis para consulta, confirmação, cancelamento e conclusão. <Link href="/planos">Renovar plano</Link></p>}
        {error ? (
          <LoadError label="sua empresa" />
        ) : business ? (
          content
        ) : (
          <CompanyCreationForm />
        )}
      </div>
    </AppShell>
  );
}
