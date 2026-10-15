import Link from "next/link";
import { toggleFavorite } from "@/lib/engagement-actions";

export function PublicFavorite({
  businessId,
  path,
  authenticated,
  favorite,
}: {
  businessId: string;
  path: string;
  authenticated: boolean;
  favorite: boolean;
}) {
  if (!authenticated)
    return (
      <Link
        className="button button-secondary favorite-toggle"
        href={`/entrar?next=${encodeURIComponent(path)}`}
      >
        <span aria-hidden="true">♡</span> Favoritar
      </Link>
    );
  return (
    <form action={toggleFavorite}>
      <input type="hidden" name="business_id" value={businessId} />
      <input
        type="hidden"
        name="favorite"
        value={favorite ? "false" : "true"}
      />
      <input type="hidden" name="return_to" value={path} />
      <button
        className="button button-secondary favorite-toggle"
        aria-pressed={favorite}
      >
        <span aria-hidden="true">{favorite ? "♥" : "♡"}</span>{" "}
        {favorite ? "Favoritada" : "Favoritar"}
      </button>
    </form>
  );
}
