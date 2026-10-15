import { z } from "zod";
import { dateTime } from "@/lib/types";

const count = z.number().int().nonnegative();
const clientsSchema = z
  .array(
    z.object({
      client_key: z.string().min(1).max(128),
      name: z.string().min(1).max(100),
      appointments: count,
      completed: count,
      cancelled: count,
      last_visit: z.iso.datetime({ offset: true }).nullable(),
      next_visit: z.iso.datetime({ offset: true }).nullable(),
    }),
  )
  .max(100);
const reviewSummarySchema = z.object({
  average: z.number().min(0).max(5),
  count,
  distribution: z
    .array(z.object({ rating: z.number().int().min(1).max(5), count }))
    .length(5),
});
const reviewsSchema = z
  .array(
    z.object({
      id: z.uuid(),
      rating: z.number().int().min(1).max(5),
      comment: z.string().max(1000),
      reviewer_name: z.string().max(100),
      created_at: z.iso.datetime({ offset: true }),
    }),
  )
  .max(25);
export function parseCompanyClients(data: unknown) {
  const parsed = clientsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
export function parseCompanyReviewSummary(data: unknown) {
  const parsed = reviewSummarySchema.safeParse(data);
  if (!parsed.success) return null;
  const result = parsed.data;
  if (
    result.distribution.reduce((total, item) => total + item.count, 0) !==
      result.count ||
    new Set(result.distribution.map((item) => item.rating)).size !== 5
  )
    return null;
  return result;
}
export function parseCompanyReviews(data: unknown) {
  const parsed = reviewsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export function CompanyClients({
  clients,
  timezone,
}: {
  clients: NonNullable<ReturnType<typeof parseCompanyClients>>;
  timezone: string;
}) {
  if (!clients.length)
    return (
      <p className="muted">
        Seus clientes aparecerão aqui quando fizerem o primeiro agendamento.
      </p>
    );
  return (
    <div className="company-list">
      {clients.map((client) => (
        <article className="company-client-row" key={client.client_key}>
          <div>
            <h3>{client.name}</h3>
            <small className="muted">
              {client.appointments}{" "}
              {client.appointments === 1 ? "agendamento" : "agendamentos"} ·{" "}
              {client.completed} concluídos · {client.cancelled} cancelados
            </small>
          </div>
          <dl className="company-client-dates">
            {client.last_visit && (
              <div>
                <dt>Último atendimento</dt>
                <dd>{dateTime(client.last_visit, timezone)}</dd>
              </div>
            )}
            {client.next_visit && (
              <div>
                <dt>Próximo agendamento</dt>
                <dd>{dateTime(client.next_visit, timezone)}</dd>
              </div>
            )}
          </dl>
        </article>
      ))}
    </div>
  );
}

export function CompanyReviewSummary({
  summary,
}: {
  summary: NonNullable<ReturnType<typeof parseCompanyReviewSummary>>;
}) {
  return (
    <div className="company-review-summary">
      <div>
        <strong className="metric-value">
          {summary.count
            ? `${summary.average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ★`
            : "—"}
        </strong>
        <p className="muted">
          {summary.count} {summary.count === 1 ? "avaliação" : "avaliações"}
        </p>
      </div>
      <div
        className="company-review-distribution"
        aria-label="Distribuição das avaliações"
      >
        {summary.distribution
          .slice()
          .sort((a, b) => b.rating - a.rating)
          .map((item) => (
            <div key={item.rating}>
              <span>{item.rating} ★</span>
              <meter
                min={0}
                max={Math.max(1, summary.count)}
                value={item.count}
                aria-label={`${item.rating} estrelas: ${item.count} avaliações`}
              />
              <span>{item.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

export function CompanyReviews({
  reviews,
  timezone,
}: {
  reviews: NonNullable<ReturnType<typeof parseCompanyReviews>>;
  timezone: string;
}) {
  if (!reviews.length)
    return (
      <p className="muted">
        Após um atendimento concluído, o cliente poderá avaliar sua empresa.
      </p>
    );
  return (
    <div className="company-list">
      {reviews.map((review) => (
        <article className="company-review-row stack" key={review.id}>
          <div className="inline between">
            <strong>{review.reviewer_name}</strong>
            <span
              className="company-rating"
              aria-label={`${review.rating} de 5 estrelas`}
            >
              {"★".repeat(review.rating)}
              {"☆".repeat(5 - review.rating)}
            </span>
          </div>
          {review.comment && <p>{review.comment}</p>}
          <small className="muted">
            {dateTime(review.created_at, timezone)}
          </small>
        </article>
      ))}
    </div>
  );
}
