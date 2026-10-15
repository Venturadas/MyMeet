import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Logo } from "@/components/ui";
import { MediaImage } from "@/components/media-image";
import { PublicRating } from "@/components/public-rating";
import { PublicFavorite } from "@/components/public-favorite";
import {
  PublicCompanyDetails,
  type PublicCompany,
  type PublicGallery,
  type PublicProfessional,
  type PublicReview,
} from "@/components/public-company-details";
import { Notices } from "@/components/notices";
import { SlotPicker, type Slot } from "@/components/slot-picker";
import { isConfigured, supabase } from "@/lib/supabase";
import { bookAppointment } from "@/lib/actions";
import {
  localDate,
  money,
  type BusinessHours,
  type Service,
} from "@/lib/types";

export const metadata: Metadata = { title: "Perfil da empresa e agendamentos" };
function UnavailableAgenda() {
  return (
    <main id="main" className="container workspace stack">
      <Link href="/" aria-label="NuvemMeet, início">
        <Logo />
      </Link>
      <h1>Agenda indisponível</h1>
      <p className="notice error" role="alert">
        Não foi possível carregar esta agenda. Tente novamente em instantes.
      </p>
      <Link className="button button-secondary" href="/empresas">
        Encontrar empresas
      </Link>
    </main>
  );
}

export default async function Booking({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    service?: string | string[];
    date?: string | string[];
    notice?: string;
    error?: string;
  }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 64) notFound();
  if (!isConfigured()) return <UnavailableAgenda />;
  const db = await supabase();
  const { data: businessData, error: businessError } = await db
    .from("business_catalog")
    .select(
      "id,name,slug,description,timezone,category,city,state,address,phone,whatsapp,instagram,logo_path,cover_path,rating_average,rating_count",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (businessError) return <UnavailableAgenda />;
  if (!businessData) notFound();
  const business = businessData as PublicCompany;
  const [
    serviceResult,
    authResult,
    hoursResult,
    galleryResult,
    professionalsResult,
    reviewsResult,
  ] = await Promise.all([
    db
      .from("services")
      .select(
        "id,business_id,name,description,duration_minutes,price_cents,active",
      )
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name"),
    db.auth.getUser(),
    db
      .from("business_hours")
      .select("business_id,weekday,start_time,end_time")
      .eq("business_id", business.id)
      .order("weekday"),
    db
      .from("business_gallery_public")
      .select("id,business_id,storage_path,position")
      .eq("business_id", business.id)
      .order("position")
      .order("id")
      .limit(12),
    db
      .from("business_professionals_public")
      .select("id,business_id,name,title,photo_path")
      .eq("business_id", business.id)
      .order("name")
      .order("id")
      .limit(20),
    db
      .from("business_reviews_public")
      .select(
        "id,business_id,rating,comment,reviewer_name,created_at,updated_at",
      )
      .eq("business_id", business.id)
      .order("created_at", { ascending: false })
      .order("id")
      .limit(6),
  ]);
  const user = authResult.data.user;
  const options = (serviceResult.data || []) as Service[];
  const selected =
    options.find((service) => service.id === query.service) || options[0];
  const today = localDate(business.timezone);
  const lastDate = new Date(`${today}T12:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + 90);
  const maxDate = lastDate.toISOString().slice(0, 10);
  const parsedDate = z.iso.date().safeParse(query.date);
  const dateValid =
    parsedDate.success &&
    parsedDate.data >= today &&
    parsedDate.data <= maxDate;
  const date = dateValid ? parsedDate.data : today;
  const invalidDate = query.date !== undefined && !dateValid;
  const path = `/agendar/${slug}`;
  const loginDestination = selected
    ? `${path}?${new URLSearchParams({ service: selected.id, date })}`
    : path;
  const [slotResult, favoriteResult] = await Promise.all([
    selected
      ? db.rpc("available_slots", {
          p_business_id: business.id,
          p_service_id: selected.id,
          p_date: date,
        })
      : Promise.resolve({ data: [], error: null }),
    user
      ? db
          .from("favorites")
          .select("business_id")
          .eq("business_id", business.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const slots = (slotResult.data || []) as Slot[];
  const detailsUnavailable = Boolean(
    hoursResult.error ||
    galleryResult.error ||
    professionalsResult.error ||
    reviewsResult.error,
  );
  const location = [business.city, business.state].filter(Boolean).join(" - ");

  return (
    <main id="main" className="container workspace stack public-profile">
      <nav className="inline between">
        <Link href="/" aria-label="NuvemMeet, início">
          <Logo />
        </Link>
        <div className="inline">
          <Link href="/empresas">Encontrar empresas</Link>
          <Link
            href={
              user
                ? "/cliente"
                : `/entrar?next=${encodeURIComponent(loginDestination)}`
            }
          >
            {user ? "Meus agendamentos" : "Entrar"}
          </Link>
        </div>
      </nav>
      <header className="public-company-header">
        {business.cover_path && (
          <MediaImage
            path={business.cover_path}
            alt={`Capa de ${business.name}`}
            fallback={business.name}
            width={1600}
            height={600}
            sizes="(max-width: 1000px) 100vw, 1100px"
            className="public-company-cover"
          />
        )}
        <div className="public-company-identity">
          <MediaImage
            path={business.logo_path}
            alt={`Logo de ${business.name}`}
            fallback={business.name}
            width={80}
            height={80}
            className="company-logo"
          />
          <div className="stack public-company-meta">
            <h1>{business.name}</h1>
            {(business.category || location) && (
              <p className="muted">
                {[business.category, location].filter(Boolean).join(" · ")}
              </p>
            )}
            <PublicRating
              average={business.rating_average}
              count={business.rating_count}
            />
          </div>
          <div className="inline public-company-actions">
            <a className="button" href="#reservar">
              Agendar um serviço
            </a>
            {!favoriteResult.error && (
              <PublicFavorite
                businessId={business.id}
                path={loginDestination}
                authenticated={Boolean(user)}
                favorite={Boolean(favoriteResult.data)}
              />
            )}
          </div>
        </div>
      </header>
      <Notices params={query} />
      {invalidDate && (
        <p className="notice" role="status">
          Escolha uma data entre hoje e os próximos 90 dias.
        </p>
      )}
      {(serviceResult.error || slotResult.error) && (
        <p className="notice error" role="alert">
          Não foi possível carregar a disponibilidade. Confira a data ou tente
          novamente.
        </p>
      )}
      <section
        id="reservar"
        className="stack public-section"
        aria-labelledby="booking-title"
      >
        <div className="inline between">
          <h2 id="booking-title">Agendar um serviço</h2>
          <small className="muted">Horários de Brasília</small>
        </div>
        <div className="grid-2">
          <section className="card stack">
            <h3>1. Serviço e dia</h3>
            {!options.length ? (
              <p className="muted">
                {serviceResult.error
                  ? "Os serviços não puderam ser carregados."
                  : "Esta empresa ainda não disponibilizou serviços."}
              </p>
            ) : (
              <form
                key={`${selected?.id}-${date}`}
                className="stack"
                method="get"
                action={`${path}#reservar`}
              >
                <label className="field">
                  Serviço
                  <select name="service" defaultValue={selected?.id}>
                    {options.map((service) => (
                      <option value={service.id} key={service.id}>
                        {service.name} · {service.duration_minutes} min ·{" "}
                        {money(service.price_cents)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Data
                  <input
                    type="date"
                    name="date"
                    min={today}
                    max={maxDate}
                    defaultValue={date}
                    required
                  />
                </label>
                <button className="button button-secondary">
                  Consultar horários
                </button>
              </form>
            )}
            {selected?.description && (
              <p className="muted">{selected.description}</p>
            )}
          </section>
          <section className="card stack">
            <h3>2. Escolha seu horário</h3>
            {selected && (
              <form className="stack" action={bookAppointment}>
                <input type="hidden" name="business_id" value={business.id} />
                <input type="hidden" name="service_id" value={selected.id} />
                <input type="hidden" name="next" value={path} />
                <SlotPicker slots={slots} timezone={business.timezone} />
                <p className="muted">
                  {selected.name} · {selected.duration_minutes} min ·{" "}
                  {money(selected.price_cents)}
                </p>
                {user ? (
                  <>
                    <small>
                      A empresa recebe seu nome e os dados da reserva. Seu
                      e-mail permanece privado.{" "}
                      <Link href="/privacidade">Privacidade</Link>.
                    </small>
                    <button
                      className="button"
                      disabled={!slots.length || Boolean(slotResult.error)}
                    >
                      Confirmar agendamento
                    </button>
                  </>
                ) : (
                  <Link
                    className="button"
                    href={`/entrar?next=${encodeURIComponent(loginDestination)}`}
                  >
                    Entrar para agendar
                  </Link>
                )}
              </form>
            )}
          </section>
        </div>
      </section>
      <PublicCompanyDetails
        business={business}
        services={options}
        hours={(hoursResult.data || []) as BusinessHours[]}
        gallery={(galleryResult.data || []) as PublicGallery[]}
        professionals={(professionalsResult.data || []) as PublicProfessional[]}
        reviews={(reviewsResult.data || []) as PublicReview[]}
        date={date}
        unavailable={detailsUnavailable}
        reviewsUnavailable={Boolean(reviewsResult.error)}
      />
      <Link href="/privacidade">Privacidade e seus dados</Link>
    </main>
  );
}
