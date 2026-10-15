import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { MediaImage } from "@/components/media-image";
import { PublicRating } from "@/components/public-rating";
import { isConfigured, supabase } from "@/lib/supabase";

export const metadata: Metadata = { title: "Encontrar empresas" };
type PublicBusiness = {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string | null;
  city: string | null;
  state: string | null;
  logo_path: string | null;
  rating_average: number | null;
  rating_count: number;
};
const pageSize = 12;

export default async function Companies({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}) {
  const params = await searchParams;
  const search = z
    .string()
    .trim()
    .max(80)
    .safeParse(params.q ?? "");
  const term = search.success ? search.data : "";
  const page =
    typeof params.page === "string" && /^[1-9]\d{0,2}$/.test(params.page)
      ? Number(params.page)
      : 1;
  const configured = isConfigured();
  let authenticated = false;
  let unavailable = false;
  let businesses: PublicBusiness[] = [];
  if (configured) {
    try {
      const db = await supabase();
      let query = db
        .from("business_catalog")
        .select(
          "id,name,slug,description,category,city,state,logo_path,rating_average,rating_count",
        )
        .order("name")
        .order("id")
        .range((page - 1) * pageSize, page * pageSize);
      // Match text literally, including %, _ and regular expression syntax.
      if (term)
        query = query.filter(
          "name",
          "imatch",
          term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        );
      const [authResult, businessResult] = await Promise.all([
        db.auth.getUser(),
        search.success ? query : Promise.resolve({ data: [], error: null }),
      ]);
      authenticated = Boolean(authResult.data.user);
      unavailable = Boolean(businessResult.error);
      businesses = (businessResult.data || []) as PublicBusiness[];
    } catch {
      unavailable = true;
    }
  }
  const more = businesses.length > pageSize;
  const pageLink = (number: number) =>
    `/empresas?${new URLSearchParams({ ...(term ? { q: term } : {}), page: String(number) })}`;
  return (
    <AppShell active="empresas" authenticated={authenticated}>
      <div className="page-intro">
        <span className="eyebrow">Sua próxima reserva</span>
        <h1>Encontrar empresas</h1>
        <p className="muted">
          Encontre a empresa e escolha um serviço e horário.
        </p>
      </div>
      <form
        className="card directory-search"
        action="/empresas"
        method="get"
        role="search"
      >
        <label className="field">
          Nome da empresa
          <input
            key={term}
            type="search"
            name="q"
            maxLength={80}
            defaultValue={term}
            placeholder="Qual empresa você procura?"
          />
        </label>
        <button className="button">Buscar empresas</button>
        {term && <Link href="/empresas">Limpar busca</Link>}
      </form>
      {!search.success && (
        <p className="notice error" role="alert">
          Informe um nome de empresa com até 80 caracteres.
        </p>
      )}
      {search.success && (!configured || unavailable) ? (
        <p className="notice error" role="alert">
          A busca está temporariamente indisponível. Tente novamente em
          instantes.
        </p>
      ) : (
        search.success && (
          <section className="stack" aria-label="Empresas encontradas">
            {businesses.length ? (
              <>
                <p className="muted" role="status">
                  {term ? `Resultados para “${term}”` : "Empresas cadastradas"}{" "}
                  · página {page}
                </p>
                <div className="directory-grid">
                  {businesses.slice(0, pageSize).map((business) => {
                    const location = [business.city, business.state]
                      .filter(Boolean)
                      .join(" - ");
                    return (
                      <article
                        className="card directory-card"
                        key={business.id}
                      >
                        <MediaImage
                          path={business.logo_path}
                          alt={`Logo de ${business.name}`}
                          fallback={business.name}
                          width={64}
                          height={64}
                          className="company-logo"
                        />
                        <div className="stack directory-card-content">
                          <h2>{business.name}</h2>
                          {business.category && (
                            <p className="muted">{business.category}</p>
                          )}
                          <PublicRating
                            average={business.rating_average}
                            count={business.rating_count}
                          />
                          {location && <p className="muted">{location}</p>}
                          {business.description && (
                            <p className="muted directory-description">
                              {business.description}
                            </p>
                          )}
                          <Link
                            prefetch={false}
                            className="button button-secondary"
                            href={`/agendar/${business.slug}`}
                            aria-label={`Ver perfil de ${business.name}`}
                          >
                            Ver perfil
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="card stack">
                <h2>
                  {page > 1
                    ? "Não há resultados nesta página"
                    : term
                      ? "Nenhuma empresa encontrada"
                      : "Ainda não há empresas disponíveis"}
                </h2>
                <p className="muted">
                  {term
                    ? "Tente outro nome ou abra o link enviado pela empresa."
                    : "Você também pode abrir o link de agendamento enviado pela empresa."}
                </p>
                <div className="inline">
                  {(term || page > 1) && (
                    <Link className="button button-secondary" href="/empresas">
                      Ver todas as empresas
                    </Link>
                  )}
                  <Link href="/empresa">Configurar minha empresa</Link>
                </div>
              </div>
            )}
            {(page > 1 || more) && (
              <nav className="inline" aria-label="Páginas de empresas">
                {page > 1 && (
                  <Link
                    prefetch={false}
                    className="button button-secondary"
                    href={pageLink(page - 1)}
                  >
                    Página anterior
                  </Link>
                )}
                {more && page < 999 && (
                  <Link
                    prefetch={false}
                    className="button button-secondary"
                    href={pageLink(page + 1)}
                  >
                    Próxima página
                  </Link>
                )}
              </nav>
            )}
          </section>
        )
      )}
    </AppShell>
  );
}
