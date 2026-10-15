import Link from "next/link";
import { MediaImage } from "@/components/media-image";
import { PublicRating } from "@/components/public-rating";
import { money, type BusinessHours, type Service } from "@/lib/types";

export type PublicCompany = {
  id: string;
  name: string;
  slug: string;
  description: string;
  timezone: string;
  category: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagram: string | null;
  logo_path: string | null;
  cover_path: string | null;
  rating_average: number | null;
  rating_count: number;
};
export type PublicGallery = {
  id: string;
  business_id: string;
  storage_path: string;
  position: number;
};
export type PublicProfessional = {
  id: string;
  business_id: string;
  name: string;
  title: string;
  photo_path: string | null;
};
export type PublicReview = {
  id: string;
  business_id: string;
  rating: number;
  comment: string;
  reviewer_name: string;
  created_at: string;
  updated_at: string;
};
const weekdays = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

function phoneLink(value: string | null, whatsapp = false) {
  if (!value || !/^[+\d\s().-]{8,24}$/.test(value)) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  if (!/^\d{12,15}$/.test(digits)) return null;
  return whatsapp ? `https://wa.me/${digits}` : `tel:+${digits}`;
}
function instagramLink(value: string | null) {
  if (!value) return null;
  const username = value.replace(/^@/, "");
  if (/^[a-zA-Z0-9._]{1,30}$/.test(username))
    return `https://www.instagram.com/${username}/`;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/[a-zA-Z0-9._]{1,30}\/?$/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function reviewDate(value: string, timezone: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "medium",
        timeZone: timezone,
      }).format(date);
}

export function PublicCompanyDetails({
  business,
  services,
  hours,
  gallery,
  professionals,
  reviews,
  date,
  unavailable,
  reviewsUnavailable,
}: {
  business: PublicCompany;
  services: Service[];
  hours: BusinessHours[];
  gallery: PublicGallery[];
  professionals: PublicProfessional[];
  reviews: PublicReview[];
  date: string;
  unavailable: boolean;
  reviewsUnavailable: boolean;
}) {
  const phone = phoneLink(business.phone);
  const whatsapp = phoneLink(business.whatsapp, true);
  const instagram = instagramLink(business.instagram);
  const location = [business.city, business.state].filter(Boolean).join(" - ");
  return (
    <div className="stack public-company-details">
      {unavailable && (
        <p className="notice" role="status">
          Algumas informações da empresa não puderam ser carregadas. Tente
          novamente em instantes.
        </p>
      )}
      {(business.description ||
        business.address ||
        location ||
        phone ||
        whatsapp ||
        instagram ||
        hours.length > 0) && (
        <section className="card stack public-section">
          <h2>Sobre a empresa</h2>
          {business.description && (
            <p className="muted">{business.description}</p>
          )}
          <div className="public-details-grid">
            {(business.address ||
              location ||
              phone ||
              whatsapp ||
              instagram) && (
              <div className="stack">
                {business.address && <p>{business.address}</p>}
                {location && <p className="muted">{location}</p>}
                <div className="inline">
                  {phone && <a href={phone}>{business.phone}</a>}
                  {whatsapp && (
                    <a
                      className="button button-secondary"
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      WhatsApp
                    </a>
                  )}
                  {instagram && (
                    <a
                      href={instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Instagram
                    </a>
                  )}
                </div>
              </div>
            )}
            {hours.length > 0 && (
              <div className="stack">
                <h3>Horário de funcionamento</h3>
                <dl className="public-hours">
                  {hours.map((hour) => (
                    <div key={hour.weekday}>
                      <dt>{weekdays[hour.weekday]}</dt>
                      <dd>
                        {hour.start_time.slice(0, 5)} –{" "}
                        {hour.end_time.slice(0, 5)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </section>
      )}
      {services.length > 0 && (
        <section className="card stack public-section">
          <h2>Serviços</h2>
          <div className="public-service-list">
            {services.map((service) => (
              <article
                key={service.id}
                className="inline between public-service-row"
              >
                <div className="stack">
                  <h3>{service.name}</h3>
                  {service.description && (
                    <p className="muted">{service.description}</p>
                  )}
                  <p className="muted">
                    {service.duration_minutes} min ·{" "}
                    {money(service.price_cents)}
                  </p>
                </div>
                <Link
                  prefetch={false}
                  className="button button-secondary"
                  href={`/agendar/${business.slug}?${new URLSearchParams({ service: service.id, date })}#reservar`}
                >
                  Agendar
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
      {professionals.length > 0 && (
        <section className="card stack public-section">
          <h2>Profissionais</h2>
          <div className="public-professionals">
            {professionals.map((person) => (
              <article className="inline" key={person.id}>
                <MediaImage
                  path={person.photo_path}
                  alt={`Foto de ${person.name}`}
                  fallback={person.name}
                  width={48}
                  height={48}
                  className="professional-avatar"
                />
                <div>
                  <h3>{person.name}</h3>
                  {person.title && <p className="muted">{person.title}</p>}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {gallery.length > 0 && (
        <section className="card stack public-section">
          <h2>Galeria</h2>
          <div className="public-gallery">
            {gallery.map((photo, index) => (
              <MediaImage
                key={photo.id}
                path={photo.storage_path}
                alt={`Foto ${index + 1} de ${business.name}`}
                fallback={business.name}
                width={640}
                height={480}
                sizes="(max-width: 600px) 45vw, (max-width: 900px) 30vw, 280px"
                className="public-gallery-photo"
              />
            ))}
          </div>
        </section>
      )}
      <section
        className="card stack public-section"
        aria-labelledby="public-reviews-title"
      >
        <div className="inline between">
          <h2 id="public-reviews-title">Avaliações</h2>
          <PublicRating
            average={business.rating_average}
            count={business.rating_count}
          />
        </div>
        {reviews.length > 0 ? (
          <div className="public-review-list">
            {reviews.map((review) => {
              const formattedDate = reviewDate(
                review.updated_at || review.created_at,
                business.timezone,
              );
              return (
                <article className="stack public-review" key={review.id}>
                  <div className="inline between">
                    <strong>{review.reviewer_name || "Cliente"}</strong>
                    <span
                      className="public-rating-stars"
                      aria-label={`${review.rating} de 5 estrelas`}
                    >
                      {"★".repeat(Math.max(0, Math.min(5, review.rating)))}
                      {"☆".repeat(Math.max(0, 5 - Math.min(5, review.rating)))}
                    </span>
                  </div>
                  {review.comment && <p>{review.comment}</p>}
                  {formattedDate && (
                    <small className="muted">{formattedDate}</small>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">
            {reviewsUnavailable
              ? "As avaliações não puderam ser carregadas."
              : "A empresa ainda não recebeu avaliações."}
          </p>
        )}
        <p className="muted">
          Clientes podem avaliar depois de um atendimento concluído, em{" "}
          <Link href="/cliente?tab=avaliacoes">Minhas avaliações</Link>.
        </p>
      </section>
    </div>
  );
}
