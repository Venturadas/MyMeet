import { Star } from "lucide-react";
export function PublicRating({
  average,
  count,
}: {
  average: number | string | null | undefined;
  count: number | string | null | undefined;
}) {
  const total = Number(count);
  const rating = Number(average);
  if (
    !Number.isInteger(total) ||
    total < 1 ||
    !Number.isFinite(rating) ||
    rating < 1 ||
    rating > 5
  )
    return <span className="muted public-rating">Sem avaliações</span>;
  const formatted = new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(rating);
  return (
    <span
      className="public-rating"
      aria-label={`${formatted} de 5 estrelas, ${total} ${total === 1 ? "avaliação" : "avaliações"}`}
    >
      <Star
        className="public-rating-stars"
        size={15}
        fill="currentColor"
        aria-hidden="true"
      />{" "}
      <strong>{formatted}</strong>{" "}
      <span className="muted">
        ({total} {total === 1 ? "avaliação" : "avaliações"})
      </span>
    </span>
  );
}
