import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isConfigured, supabase } from "@/lib/supabase";
import { Appointment, dateTime, money } from "@/lib/types";
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
import { Appointments } from "@/components/appointments";
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
  return (
    <p className="notice error" role="alert">
      {message}
    </p>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state compact-empty">
      <h3>{title}</h3>
      {children}
    </div>
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

async function Home({ db, userId }: { db: Db; userId: string }) {
  const [profile, overview, appointments] = await Promise.all([
    db.from("profiles").select("display_name").eq("id", userId).single(),
    db.rpc("customer_overview"),
    db
      .from("appointments")
      .select(appointmentFields)
      .eq("customer_id", userId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at")
      .limit(3),
  ]);
  const summary = overview.error
    ? null
    : overviewSchema.safeParse(overview.data);
  return (
    <>
      <div className="page-intro inline between">
        <div>
          <span className="eyebrow">Área do cliente</span>
          <h1>
            {profile.data?.display_name
              ? `Olá, ${profile.data.display_name.split(" ")[0]}.`
              : "Seu próximo encontro."}
          </h1>
          <p className="muted">Seus horários, reunidos em um só lugar.</p>
        </div>
        <Link className="button" href="/empresas" prefetch={false}>
          Agendar um serviço
        </Link>
      </div>
      {!summary?.success ? (
        <Failure />
      ) : (
        <dl className="metrics-strip customer-metrics" aria-label="Seu resumo">
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
      )}
      <section className="stack">
        <div className="inline between">
          <h2>Próximos agendamentos</h2>
          <Link href="/cliente?tab=agendamentos" prefetch={false}>
            Ver todos
          </Link>
        </div>
        {appointments.error ? (
          <Failure />
        ) : appointments.data.length ? (
          <Appointments
            items={appointments.data as Appointment[]}
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
  const history = params.list === "historico";
  const page = pageNumber(params.page);
  const now = new Date().toISOString();
  let query = db
    .from("appointments")
    .select(appointmentFields, { count: "exact" })
    .eq("customer_id", userId);
  query = history
    ? query
        .or(`starts_at.lt.${now},status.in.(cancelled,completed)`)
        .order("starts_at", { ascending: false })
    : query
        .in("status", ["pending", "confirmed"])
        .gte("starts_at", now)
        .order("starts_at");
  query = query.order("id");
  const result = await query.range((page - 1) * pageSize, page * pageSize - 1);
  const items = (result.data || []) as Appointment[];
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
        <Link
          href="/cliente?tab=agendamentos"
          aria-current={!history ? "page" : undefined}
          prefetch={false}
        >
          Próximos
        </Link>
        <Link
          href="/cliente?tab=agendamentos&list=historico"
          aria-current={history ? "page" : undefined}
          prefetch={false}
        >
          Histórico
        </Link>
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
            list={history ? "historico" : undefined}
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
      <div className="page-intro">
        <h1>Empresas favoritas</h1>
        <p className="muted">
          Guarde as empresas para encontrar seu próximo horário.
        </p>
      </div>
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
                        ★ {Number(business.rating_average).toFixed(1)} ·{" "}
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
      <div className="page-intro">
        <h1>Minhas avaliações</h1>
        <p className="muted">
          Avalie um atendimento concluído pelo seu histórico.
        </p>
      </div>
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
                    {"★".repeat(review.rating)}
                    {"☆".repeat(5 - review.rating)}
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
  db,
  userId,
  email,
  createdAt,
}: {
  db: Db;
  userId: string;
  email?: string;
  createdAt: string;
}) {
  const profile = await db
    .from("profiles")
    .select("display_name,username,phone,avatar_path")
    .eq("id", userId)
    .single();
  return (
    <>
      <div className="page-intro">
        <h1>Meu perfil</h1>
        <p className="muted">Organize suas informações de conta.</p>
      </div>
      {profile.error ? (
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
      <div className="page-intro">
        <h1>Configurações</h1>
        <p className="muted">Conta, segurança e seus dados.</p>
      </div>
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
                e-mails enviados pelo NuvemMeet.
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
        <section className="settings-section stack">
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
  return (
    <AppShell active="cliente" workspace="cliente" activeTab={tab}>
      <Notices params={params} />
      {tab === "inicio" && <Home db={db} userId={user.id} />}
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
          db={db}
          userId={user.id}
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
