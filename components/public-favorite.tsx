import Link from "next/link";
import { Heart } from "lucide-react";
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
        <Heart size={18} aria-hidden="true" /> Favoritar
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
        <Heart
          size={18}
          fill={favorite ? "currentColor" : "none"}
          aria-hidden="true"
        />{" "}
        {favorite ? "Favoritada" : "Favoritar"}
      </button>
    </form>
  );
}
