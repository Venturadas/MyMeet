import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Search,
  Star,
} from "lucide-react";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { Appointment, dateTime, localDate, money } from "@/lib/types";
import { signOut } from "@/lib/actions";
import {
  changeCustomerEmail,
  changeCustomerPassword,
  requestCustomerErasure,
  updateCustomerProfile,
} from "@/lib/customer-actions";
import { deleteReview, toggleFavorite } from "@/lib/engagement-actions";
import { AppShell } from "@/components/app-shell";
import { Notices } from "@/components/notices";
import {
  Appointments,
  type AppointmentBusiness,
} from "@/components/appointments";
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import { CustomerReviewForm } from "@/components/customer-review-form";
import { MediaImage } from "@/components/media-image";
import { MediaUploader } from "@/components/media-uploader";
import { FormSubmit } from "@/components/form-submit";

export const metadata: Metadata = { title: "Área do cliente" };
const tabs = [
  "inicio",
  "agendamentos",
  "favoritos",
  "avaliacoes",
  "perfil",
  "configuracoes",
] as const;
type Tab = (typeof tabs)[number];
type Params = {
  tab?: string;
  list?: string;
  page?: string;
  notice?: string;
  error?: string;
};
type Db = Awaited<ReturnType<typeof supabase>>;
type Review = {
  id: string;
  appointment_id: string;
  rating: number;
  comment: string | null;
  reviewer_name: string;
  created_at: string;
};
type Favorite = {
  business_id: string;
  slug: string;
  name: string;
  category: string | null;
  city: string | null;
  state: string | null;
  logo_path: string | null;
  rating_average: number | null;
  rating_count: number;
};
const appointmentFields =
  "id,business_id,service_id,service_name,customer_id,customer_name,starts_at,ends_at,status,price_cents,comment";
const reviewFields =
  "id,appointment_id,rating,comment,reviewer_name,created_at";
const pageSize = 15;
const overviewSchema = z.object({
  upcoming: z.number().int().nonnegative(),
  completed: z.number().int().nonnegative(),
  spending_cents: z.number().int().nonnegative(),
  favorites: z.number().int().nonnegative(),
});
const calendarDate = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
function currentTab(value?: string): Tab {
  return tabs.includes(value as Tab) ? (value as Tab) : "inicio";
}
function pageNumber(value?: string) {
  return value && /^\d{1,4}$/.test(value)
    ? Math.max(1, Math.min(Number(value), 1000))
    : 1;
}
function Failure({
  message = "Não foi possível carregar estes dados. Tente novamente em instantes.",
}: {
  message?: string;
}) {
  return <ErrorState description={message} />;
}
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState
      title={title}
      icon={<CalendarDays size={24} />}
      action={children}
    />
  );
}

function Pagination({
  tab,
  page,
  total,
  list,
}: {
  tab: Tab;
  page: number;
  total: number;
  list?: string;
}) {
  if (total <= pageSize && page === 1) return null;
  const base = `/cliente?tab=${tab}${list ? `&list=${list}` : ""}`;
  return (
    <nav className="inline between pagination" aria-label="Paginação">
      {page > 1 ? (
        <Link
          className="button button-secondary"
          href={`${base}&page=${page - 1}`}
          prefetch={false}
        >
          Anterior
        </Link>
      ) : (
        <span />
      )}
      <small className="muted">
        Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
      </small>
      {page * pageSize < total && page < 1000 ? (
        <Link
          className="button button-secondary"
          href={`${base}&page=${page + 1}`}
          prefetch={false}
        >
          Próxima
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

async function appointmentBusinesses(db: Db, items: Appointment[]) {
  const ids = [...new Set(items.map((item) => item.business_id))];
  if (!ids.length) return {};
  const result = await db
    .from("business_catalog")
    .select("id,name,logo_path")
    .in("id", ids);
  return Object.fromEntries(
    (result.data || []).map((business) => [
      business.id,
      {
        name: business.name as string,
        logo_path: business.logo_path as string | null,
      },
    ]),
  ) as Record<string, AppointmentBusiness>;
}

async function Home({
  db,
  userId,
  name,
}: {
  db: Db;
  userId: string;
  name?: string | null;
}) {
  const now = new Date().toISOString();
  const today = localDate();
  // Brasília currently has a fixed UTC−03 offset; bound both ends explicitly so
  // the server's timezone never decides what belongs to today's agenda.
  const todayStart = new Date(`${today}T00:00:00-03:00`);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const [overview, appointments, todaysAppointments] = await Promise.all([
    db.rpc("customer_overview"),
    db
      .from("appointments")
      .select(appointmentFields)
      .eq("customer_id", userId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", now)
      .order("starts_at")
      .order("id")
      .limit(3),
    db
      .from("appointments")
      .select(appointmentFields)
      .eq("customer_id", userId)
      .neq("status", "cancelled")
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", tomorrowStart.toISOString())
      .order("starts_at")
      .order("id")
      .limit(3),
  ]);
  const upcomingItems = (appointments.data || []) as Appointment[];
  const todayItems = (todaysAppointments.data || []) as Appointment[];
  const businesses = await appointmentBusinesses(db, [
    ...upcomingItems,
    ...todayItems,
  ]);
  const nextAppointment = upcomingItems[0];
  const nextBusiness =
    nextAppointment && businesses[nextAppointment.business_id];
  const summary = overview.error
    ? null
    : overviewSchema.safeParse(overview.data);
  return (
    <>
      <section
        className="customer-hero"
        aria-labelledby="customer-welcome-title"
      >
        <div className="customer-hero-copy">
          <p>Bem-vindo de volta,</p>
          <h1 id="customer-welcome-title">
            {name?.trim().split(/\s+/)[0] || "vamos agendar?"}
            {name && <span aria-hidden="true"> 👋</span>}
          </h1>
          <p className="customer-hero-description">
            Encontre e agende seus serviços preferidos.
          </p>
        </div>
        <Image
          src="/brand/logo-icon.png"
          width={256}
          height={256}
          sizes="(max-width: 600px) 136px, 220px"
          alt=""
          className="customer-hero-cloud"
          aria-hidden="true"
        />
        <form
          className="customer-hero-search"
          role="search"
          action="/empresas"
          method="get"
        >
          <Search size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="customer-search">
            Buscar empresas
          </label>
          <input
            id="customer-search"
            type="search"
            name="q"
            maxLength={100}
            placeholder="Buscar empresa"
          />
          <button className="button" type="submit">
            Buscar
          </button>
        </form>
      </section>
      {nextAppointment && (
        <section className="stack customer-continue">
          <SectionHeader
            title="Continuar de onde parou"
            action={
              <Link href="/cliente?tab=agendamentos" prefetch={false}>
                Ver todos <ArrowRight size={16} aria-hidden="true" />
              </Link>
            }
          />
          <Link
            className="customer-resume"
            href="/cliente?tab=agendamentos"
            prefetch={false}
            aria-label={`Ver agendamento: ${nextAppointment.service_name}`}
          >
            <MediaImage
              path={nextBusiness?.logo_path}
              alt={nextBusiness ? `Logo de ${nextBusiness.name}` : "Empresa"}
              fallback={nextBusiness?.name || nextAppointment.service_name}
              width={56}
              height={56}
              className="company-logo"
            />
            <div>
              <h3>{nextBusiness?.name || nextAppointment.service_name}</h3>
              {nextBusiness && (
                <p className="muted">{nextAppointment.service_name}</p>
              )}
              <small>
                Seu próximo horário · {dateTime(nextAppointment.starts_at)}
              </small>
            </div>
            <ChevronRight size={20} aria-hidden="true" />
          </Link>
        </section>
      )}
      <section className="stack customer-today">
        <SectionHeader
          title="Agenda de hoje"
          description="Horários de Brasília"
          action={
            <Link href="/cliente?tab=agendamentos" prefetch={false}>
              Ver todos <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        />
        {todaysAppointments.error ? (
          <Failure />
        ) : todayItems.length ? (
          <Appointments
            items={todayItems}
            businesses={businesses}
            returnTo="/cliente?tab=inicio"
          />
        ) : (
          <Empty title="Sua agenda está livre hoje.">
            <Link href="/empresas" prefetch={false}>
              Encontrar empresas
            </Link>
          </Empty>
        )}
      </section>
      <section className="stack customer-upcoming">
        <SectionHeader
          title="Próximos agendamentos"
          action={
            <Link href="/cliente?tab=agendamentos" prefetch={false}>
              Ver todos <ArrowRight size={16} aria-hidden="true" />
            </Link>
          }
        />
        {appointments.error ? (
          <Failure />
        ) : upcomingItems.length ? (
          <Appointments
            items={upcomingItems}
            businesses={businesses}
            returnTo="/cliente?tab=agendamentos"
          />
        ) : (
          <Empty title="Você ainda não tem um próximo horário.">
            <Link href="/empresas" prefetch={false}>
              Encontre uma empresa para agendar.
            </Link>
          </Empty>
        )}
      </section>
      {!summary?.success ? (
        <Failure />
      ) : (
        <section className="stack customer-summary">
          <SectionHeader title="Sua atividade" />
          <dl
            className="metrics-strip customer-metrics"
            aria-label="Seu resumo"
          >
            <div>
              <dt>Próximos</dt>
              <dd className="metric-value">{summary.data.upcoming}</dd>
            </div>
            <div>
              <dt>Concluídos</dt>
              <dd className="metric-value">{summary.data.completed}</dd>
            </div>
            <div>
              <dt>Gasto em atendimentos</dt>
              <dd className="metric-value">
                {money(summary.data.spending_cents)}
              </dd>
            </div>
            <div>
              <dt>Favoritas disponíveis</dt>
              <dd className="metric-value">{summary.data.favorites}</dd>
            </div>
          </dl>
        </section>
      )}
    </>
  );
}

async function AppointmentList({
  db,
  userId,
  params,
}: {
  db: Db;
  userId: string;
  params: Params;
}) {
  const filter = ["concluidos", "cancelados", "historico"].includes(
    params.list || "",
  )
    ? params.list!
    : "proximos";
  const history = filter !== "proximos";
  const page = pageNumber(params.page);
  const now = new Date().toISOString();
  let query = db
    .from("appointments")
    .select(appointmentFields, { count: "exact" })
    .eq("customer_id", userId);
  if (filter === "concluidos" || filter === "cancelados") {
    query = query
      .eq("status", filter === "concluidos" ? "completed" : "cancelled")
      .order("starts_at", { ascending: false });
  } else if (history) {
    query = query
      .or(`starts_at.lt.${now},status.in.(cancelled,completed)`)
      .order("starts_at", { ascending: false });
  } else {
    query = query
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", now)
      .order("starts_at");
  }
  query = query.order("id");
  const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const items = (result.data || []) as Appointment[];
  const businesses = await appointmentBusinesses(db, items);
  const completed = items.filter((item) => item.status === "completed");
  const reviews = completed.length
    ? await db
        .from("reviews")
        .select(reviewFields)
        .eq("reviewer_id", userId)
        .in(
          "appointment_id",
          completed.map((item) => item.id),
        )
    : null;
  const byAppointment = new Map(
    (reviews?.data || []).map((review: Review) => [
      review.appointment_id,
      review,
    ]),
  );
  return (
    <>
      <div className="page-intro inline between">
        <div>
          <h1>Meus agendamentos</h1>
          <p className="muted">Horários de Brasília.</p>
        </div>
        <Link className="button" href="/empresas" prefetch={false}>
          Novo agendamento
        </Link>
      </div>
      <nav
        className="inline section-tabs"
        aria-label="Período dos agendamentos"
      >
        {[
          ["proximos", "Próximos"],
          ["concluidos", "Concluídos"],
          ["cancelados", "Cancelados"],
          ["historico", "Histórico"],
        ].map(([value, label]) => (
          <Link
            key={value}
            href={`/cliente?tab=agendamentos${value === "proximos" ? "" : `&list=${value}`}`}
            aria-current={filter === value ? "page" : undefined}
            prefetch={false}
          >
            {label}
          </Link>
        ))}
      </nav>
      {result.error ? (
        <Failure />
      ) : !items.length ? (
        <Empty
          title={
            history
              ? "Nenhum atendimento no histórico."
              : "Nenhum próximo agendamento."
          }
        >
          <Link href="/empresas" prefetch={false}>
            Encontrar uma empresa
          </Link>
        </Empty>
      ) : (
        <div className="stack customer-appointments">
          {items.map((item) => (
            <div key={item.id} className="stack customer-appointment-item">
              <Appointments
                items={[item]}
                businesses={businesses}
                returnTo="/cliente?tab=agendamentos"
              />
              {item.status === "completed" && !reviews?.error && (
                <details className="customer-review-details">
                  <summary>
                    {byAppointment.has(item.id)
                      ? "Editar minha avaliação"
                      : "Avaliar atendimento"}
                  </summary>
                  <CustomerReviewForm
                    appointmentId={item.id}
                    rating={byAppointment.get(item.id)?.rating}
                    comment={byAppointment.get(item.id)?.comment}
                  />
                </details>
              )}
            </div>
          ))}
          {reviews?.error && (
            <Failure message="As avaliações estão temporariamente indisponíveis." />
          )}
          <Pagination
            tab="agendamentos"
            list={history ? filter : undefined}
            page={page}
            total={result.count || 0}
          />
        </div>
      )}
    </>
  );
}

async function Favorites({
  db,
  userId,
  page,
}: {
  db: Db;
  userId: string;
  page: number;
}) {
  // Base rows stay private and let customers unfavorite an expired company.
  const rows = await db
    .from("favorites")
    .select("business_id,created_at", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("business_id")
    .range((page - 1) * pageSize, page * pageSize - 1);
  const ids = (rows.data || []).map((item) => item.business_id as string);
  const catalog = ids.length
    ? await db
        .from("customer_favorites")
        .select(
          "business_id,slug,name,category,city,state,logo_path,rating_average,rating_count",
        )
        .eq("user_id", userId)
        .in("business_id", ids)
    : null;
  const businesses = new Map(
    (catalog?.data || []).map((item: Favorite) => [item.business_id, item]),
  );
  return (
    <>
      <PageHeader
        title="Empresas favoritas"
        description="Guarde as empresas para encontrar seu próximo horário."
      />
      {rows.error || catalog?.error ? (
        <Failure />
      ) : !ids.length ? (
        <Empty title="Suas empresas favoritas aparecerão aqui.">
          <Link href="/empresas" prefetch={false}>
            Encontrar empresas
          </Link>
        </Empty>
      ) : (
        <>
          <div className="customer-favorites compact-list">
            {ids.map((id) => {
              const business = businesses.get(id);
              return (
                <article className="compact-row favorite-row" key={id}>
                  <MediaImage
                    kind="company"
                    path={business?.logo_path}
                    alt={
                      business
                        ? `Logo de ${business.name}`
                        : "Empresa indisponível"
                    }
                    fallback={business?.name}
                    width={48}
                    height={48}
                    className="company-logo"
                  />
                  <div className="compact-row-content">
                    <h2>
                      {business?.name || "Empresa com reservas indisponíveis"}
                    </h2>
                    {business && (
                      <p className="muted">
                        {[
                          business.category,
                          [business.city, business.state]
                            .filter(Boolean)
                            .join(" · "),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {business && business.rating_count > 0 && (
                      <small>
                        <Star
                          size={14}
                          fill="currentColor"
                          aria-hidden="true"
                        />{" "}
                        {Number(business.rating_average).toFixed(1)} ·{" "}
                        {business.rating_count}{" "}
                        {business.rating_count === 1
                          ? "avaliação"
                          : "avaliações"}
                      </small>
                    )}
                  </div>
                  <div className="inline">
                    {business && (
                      <Link
                        className="button button-secondary"
                        href={`/agendar/${business.slug}`}
                        prefetch={false}
                      >
                        Ver perfil
                      </Link>
                    )}
                    <form action={toggleFavorite}>
                      <input type="hidden" name="business_id" value={id} />
                      <input type="hidden" name="favorite" value="false" />
                      <input
                        type="hidden"
                        name="return_to"
                        value="/cliente?tab=favoritos"
                      />
                      <FormSubmit secondary pendingLabel="Removendo…">
                        Remover favorito
                      </FormSubmit>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
          <Pagination tab="favoritos" page={page} total={rows.count || 0} />
        </>
      )}
    </>
  );
}

async function Reviews({
  db,
  userId,
  page,
}: {
  db: Db;
  userId: string;
  page: number;
}) {
  const result = await db
    .from("reviews")
    .select(reviewFields, { count: "exact" })
    .eq("reviewer_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);
  const reviews = (result.data || []) as Review[];
  const appointments = reviews.length
    ? await db
        .from("appointments")
        .select("id,service_name,starts_at")
        .eq("customer_id", userId)
        .in(
          "id",
          reviews.map((item) => item.appointment_id),
        )
    : null;
  const labels = new Map(
    (appointments?.data || []).map((item) => [item.id, item]),
  );
  return (
    <>
      <PageHeader
        title="Minhas avaliações"
        description="Avalie um atendimento concluído pelo seu histórico."
      />
      {result.error ? (
        <Failure />
      ) : !reviews.length ? (
        <Empty title="Você ainda não avaliou um atendimento.">
          <Link
            href="/cliente?tab=agendamentos&list=historico"
            prefetch={false}
          >
            Ver meu histórico
          </Link>
        </Empty>
      ) : (
        <>
          <div className="compact-list">
            {reviews.map((review) => (
              <article className="compact-review stack" key={review.id}>
                <div className="inline between">
                  <div>
                    <h2>
                      {labels.get(review.appointment_id)?.service_name ||
                        "Atendimento concluído"}
                    </h2>
                    <small className="muted">
                      {dateTime(
                        labels.get(review.appointment_id)?.starts_at ||
                          review.created_at,
                      )}
                    </small>
                  </div>
                  <span
                    className="review-stars"
                    aria-label={`${review.rating} de 5 estrelas`}
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <Star
                        key={value}
                        size={15}
                        fill={value <= review.rating ? "currentColor" : "none"}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </div>
                {review.comment && <p>{review.comment}</p>}
                <div className="inline between">
                  <details>
                    <summary>Editar avaliação</summary>
                    <CustomerReviewForm
                      appointmentId={review.appointment_id}
                      rating={review.rating}
                      comment={review.comment}
                    />
                  </details>
                  <form action={deleteReview}>
                    <input type="hidden" name="review_id" value={review.id} />
                    <input
                      type="hidden"
                      name="return_to"
                      value="/cliente?tab=avaliacoes"
                    />
                    <FormSubmit secondary pendingLabel="Excluindo…">
                      Excluir avaliação
                    </FormSubmit>
                  </form>
                </div>
              </article>
            ))}
          </div>
          <Pagination tab="avaliacoes" page={page} total={result.count || 0} />
        </>
      )}
    </>
  );
}

async function Profile({
  profile,
  email,
  createdAt,
}: {
  profile: {
    data: {
      display_name: string;
      username: string | null;
      phone: string | null;
      avatar_path: string | null;
    } | null;
    error: unknown;
  };
  email?: string;
  createdAt: string;
}) {
  return (
    <>
      <PageHeader
        title="Meu perfil"
        description="Organize suas informações de conta."
      />
      {profile.error || !profile.data ? (
        <Failure />
      ) : (
        <div className="settings-column stack">
          <MediaUploader
            kind="avatar"
            currentPath={profile.data.avatar_path}
            label="Foto de perfil"
          />
          <form className="stack" action={updateCustomerProfile}>
            <label className="field">
              Nome
              <input
                name="display_name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                defaultValue={profile.data.display_name}
              />
            </label>
            <label className="field">
              Nome de usuário <span className="muted">(opcional)</span>
              <input
                name="username"
                autoComplete="username"
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9_]{3,30}"
                defaultValue={profile.data.username || ""}
              />
              <small>De 3 a 30 letras minúsculas, números ou _.</small>
            </label>
            <label className="field">
              Telefone <span className="muted">(opcional)</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={20}
                defaultValue={profile.data.phone || ""}
              />
              <small>Seu telefone não aparece para as empresas.</small>
            </label>
            <FormSubmit>Salvar perfil</FormSubmit>
          </form>
          <dl className="account-facts">
            <div>
              <dt>E-mail de acesso</dt>
              <dd>{email || "Indisponível"}</dd>
            </div>
            <div>
              <dt>Conta criada em</dt>
              <dd>{calendarDate(createdAt)}</dd>
            </div>
          </dl>
          <Link href="/cliente?tab=configuracoes" prefetch={false}>
            Alterar e-mail ou senha
          </Link>
          <small className="muted">
            Seu nome é usado nos novos agendamentos. Ao publicar uma avaliação,
            seu nome de usuário ou primeiro nome fica público. Foto, e-mail e
            telefone continuam privados.
          </small>
        </div>
      )}
    </>
  );
}

async function Settings({
  db,
  userId,
  email,
}: {
  db: Db;
  userId: string;
  email?: string;
}) {
  const privacy = await db
    .from("privacy_requests")
    .select("requested_at,status")
    .eq("user_id", userId)
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (
    <>
      <PageHeader
        title="Configurações"
        description="Conta, segurança e seus dados."
      />
      <div className="settings-column stack">
        <section className="settings-section stack">
          <h2>Conta</h2>
          <div className="inline between">
            <Link href="/cliente?tab=perfil" prefetch={false}>
              Editar meu perfil
            </Link>
            <form action={signOut}>
              <FormSubmit secondary pendingLabel="Saindo…">
                Sair da conta
              </FormSubmit>
            </form>
          </div>
          <details>
            <summary>Alterar e-mail</summary>
            <form className="stack" action={changeCustomerEmail}>
              <p className="muted">
                E-mail atual: {email || "Indisponível"}. Confirme a mudança nos
                e-mails enviados pelo NuvLink.
              </p>
              <label className="field">
                Novo e-mail
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
              <label className="field">
                Senha atual
                <input
                  type="password"
                  name="current_password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </label>
              <FormSubmit secondary pendingLabel="Solicitando…">
                Solicitar alteração
              </FormSubmit>
            </form>
          </details>
        </section>
        <section className="settings-section stack">
          <h2>Segurança</h2>
          <details>
            <summary>Alterar senha</summary>
            <form className="stack" action={changeCustomerPassword}>
              <label className="field">
                Senha atual
                <input
                  type="password"
                  name="current_password"
                  autoComplete="current-password"
                  maxLength={128}
                  required
                />
              </label>
              <label className="field">
                Nova senha
                <input
                  type="password"
                  name="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <label className="field">
                Repita a nova senha
                <input
                  type="password"
                  name="password_confirmation"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <small>Use pelo menos 12 caracteres.</small>
              <FormSubmit secondary>Atualizar senha</FormSubmit>
            </form>
          </details>
        </section>
        <section id="notificacoes" className="settings-section stack">
          <h2>Notificações</h2>
          <p className="muted">
            Confirmações de conta, recuperação e alterações de acesso são
            enviadas para seu e-mail. Seus agendamentos ficam disponíveis na
            agenda.
          </p>
        </section>
        <section className="settings-section stack">
          <h2>Privacidade</h2>
          <div className="inline">
            <a className="button button-secondary" href="/api/me/export">
              Baixar meus dados
            </a>
            <Link href="/privacidade" prefetch={false}>
              Como seus dados são tratados
            </Link>
          </div>
          <details>
            <summary>Solicitar exclusão da conta e dos dados</summary>
            <p className="muted">
              A solicitação será analisada pelo responsável. A exclusão
              considera obrigações legais de retenção e não é imediata.
            </p>
            {privacy.error ? (
              <Failure />
            ) : (
              privacy.data && (
                <p className="notice" role="status">
                  Solicitação registrada em{" "}
                  {calendarDate(privacy.data.requested_at)}.{" "}
                  {privacy.data.status === "completed"
                    ? "Concluída."
                    : privacy.data.status === "processing"
                      ? "Em análise."
                      : "Recebida."}
                </p>
              )
            )}
            <form action={requestCustomerErasure}>
              <FormSubmit secondary pendingLabel="Registrando…">
                Registrar solicitação de exclusão
              </FormSubmit>
            </form>
          </details>
        </section>
      </div>
    </>
  );
}

export default async function Customer({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  if (!isConfigured()) redirect("/entrar");
  const params = await searchParams;
  const tab = currentTab(params.tab);
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    redirect(`/entrar?next=${encodeURIComponent(`/cliente?tab=${tab}`)}`);
  const profile = await db
    .from("profiles")
    .select("display_name,username,phone,avatar_path")
    .eq("id", user.id)
    .single();
  return (
    <AppShell
      active="cliente"
      workspace="cliente"
      activeTab={tab}
      account={{
        name: profile.data?.display_name,
        avatarPath: profile.data?.avatar_path,
      }}
    >
      <Notices params={params} />
      {tab === "inicio" && (
        <Home db={db} userId={user.id} name={profile.data?.display_name} />
      )}
      {tab === "agendamentos" && (
        <AppointmentList db={db} userId={user.id} params={params} />
      )}
      {tab === "favoritos" && (
        <Favorites db={db} userId={user.id} page={pageNumber(params.page)} />
      )}
      {tab === "avaliacoes" && (
        <Reviews db={db} userId={user.id} page={pageNumber(params.page)} />
      )}
      {tab === "perfil" && (
        <Profile
          profile={profile}
          email={user.email}
          createdAt={user.created_at}
        />
      )}
      {tab === "configuracoes" && (
        <Settings db={db} userId={user.id} email={user.email} />
      )}
    </AppShell>
  );
}
