import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  ImageIcon,
  AtSign,
  MapPin,
  MessageCircle,
  Phone,
  Star,
} from "lucide-react";
import { MediaImage } from "@/components/media-image";
import { PublicRating } from "@/components/public-rating";
import { EmptyState } from "@/components/ui";
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
      <section
        id="sobre"
        className="card stack public-section public-info-panel"
      >
        <h2>Sobre a empresa</h2>
        <p className="muted">
          {business.description ||
            "A empresa ainda não adicionou uma descrição."}
        </p>
        <div className="public-details-grid">
          {(business.address || location || phone || whatsapp || instagram) && (
            <div className="stack">
              {business.address && (
                <p className="public-contact-line">
                  <MapPin size={17} aria-hidden="true" />
                  {business.address}
                </p>
              )}
              {location && <p className="muted">{location}</p>}
              <div className="inline">
                {phone && (
                  <a className="public-contact-link" href={phone}>
                    <Phone size={16} aria-hidden="true" />
                    {business.phone}
                  </a>
                )}
                {whatsapp && (
                  <a
                    className="button button-secondary"
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle size={17} aria-hidden="true" /> WhatsApp
                  </a>
                )}
                {instagram && (
                  <a
                    className="public-contact-link"
                    href={instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <AtSign size={17} aria-hidden="true" /> Instagram
                  </a>
                )}
              </div>
            </div>
          )}
          {hours.length > 0 && (
            <div className="stack public-hours-panel">
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
      {services.length > 0 && (
        <section
          id="servicos"
          className="card stack public-section public-info-panel"
        >
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
                  <p className="muted public-service-facts">
                    <span>
                      <Clock3 size={14} aria-hidden="true" />
                      {service.duration_minutes} min
                    </span>
                    <strong>{money(service.price_cents)}</strong>
                  </p>
                </div>
                <Link
                  prefetch={false}
                  className="button button-secondary"
                  href={`/agendar/${business.slug}?${new URLSearchParams({ service: service.id, date })}#reservar`}
                >
                  Agendar <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}
      {professionals.length > 0 && (
        <section
          id="profissionais"
          className="card stack public-section public-info-panel"
        >
          <h2>Profissionais</h2>
          <p className="muted">
            Conheça a equipe. Os horários disponíveis seguem a agenda da
            empresa.
          </p>
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
      <section
        id="galeria"
        className="card stack public-section public-info-panel"
      >
        <h2>Galeria</h2>
        {gallery.length > 0 ? (
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
        ) : (
          <EmptyState
            icon={<ImageIcon size={22} aria-hidden="true" />}
            title={
              unavailable
                ? "Galeria indisponível no momento"
                : "Ainda não há fotos"
            }
            description={
              unavailable
                ? "Tente carregar o perfil novamente em instantes."
                : "As fotos adicionadas pela empresa aparecerão aqui."
            }
          />
        )}
      </section>
      <section
        id="avaliacoes"
        className="card stack public-section public-info-panel"
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
                  <div className="inline between public-review-heading">
                    <div className="inline public-review-author">
                      <MediaImage
                        alt={`Avatar de ${review.reviewer_name || "Cliente"}`}
                        fallback={review.reviewer_name || "Cliente"}
                        width={36}
                        height={36}
                        className="review-avatar"
                      />
                      <strong>{review.reviewer_name || "Cliente"}</strong>
                    </div>
                    <span
                      className="public-rating-stars public-review-stars"
                      aria-label={`${review.rating} de 5 estrelas`}
                    >
                      {Array.from({ length: 5 }, (_, index) => (
                        <Star
                          key={index}
                          size={15}
                          fill={
                            index < Math.max(0, Math.min(5, review.rating))
                              ? "currentColor"
                              : "none"
                          }
                          aria-hidden="true"
                        />
                      ))}
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
          <EmptyState
            icon={<Star size={22} aria-hidden="true" />}
            title={
              reviewsUnavailable
                ? "Avaliações indisponíveis no momento"
                : "Ainda não há avaliações"
            }
            description={
              reviewsUnavailable
                ? "As avaliações não puderam ser carregadas. Tente novamente em instantes."
                : "A empresa ainda não recebeu avaliações."
            }
          />
        )}
        <p className="muted">
          Clientes podem avaliar depois de um atendimento concluído, em{" "}
          <Link href="/cliente?tab=avaliacoes">Minhas avaliações</Link>.
        </p>
      </section>
    </div>
  );
}
