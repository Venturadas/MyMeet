import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { isConfigured, supabase } from "@/lib/supabase";
import type { Business } from "@/lib/types";

export const metadata: Metadata = { title: "Encontrar empresas" };

type PublicBusiness = Pick<Business, "id" | "name" | "slug" | "description">;
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
      const { data: auth } = await db.auth.getUser();
      authenticated = Boolean(auth.user);
      if (search.success) {
        let query = db
          .from("business_catalog")
          .select("id,name,slug,description")
          .order("name")
          .order("id")
          .range((page - 1) * pageSize, page * pageSize);
        if (term) {
          // A literal regex avoids LIKE's wildcard aliases for %, _ and *.
          query = query.filter(
            "name",
            "imatch",
            term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          );
        }
        const { data, error } = await query;
        unavailable = Boolean(error);
        businesses = (data || []) as PublicBusiness[];
      }
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
        <span className="eyebrow">Agende em uma empresa</span>
        <h1>Encontrar empresas</h1>
        <p className="muted">
          Escolha a empresa, abra sua agenda e selecione o serviço, o dia e o
          horário. Você precisa entrar na sua conta apenas para confirmar a
          reserva.
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
      {!configured ? (
        <section className="card stack">
          <h2>As agendas estão sendo preparadas</h2>
          <p className="muted">
            A busca está temporariamente indisponível. Tente novamente em
            instantes.
          </p>
        </section>
      ) : unavailable ? (
        <p className="notice error" role="alert">
          Não foi possível carregar as empresas. Tente novamente em instantes.
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
                <div className="grid-3">
                  {businesses.slice(0, pageSize).map((business) => (
                    <article
                      className="card stack business-card"
                      key={business.id}
                    >
                      <h2>{business.name}</h2>
                      <p className="muted">
                        {business.description ||
                          "Abra a agenda para conhecer os serviços desta empresa."}
                      </p>
                      <Link
                        className="button"
                        href={`/agendar/${business.slug}`}
                        aria-label={`Ver serviços e horários de ${business.name}`}
                      >
                        Ver serviços e horários
                      </Link>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="card stack">
                <h2>
                  {page > 1
                    ? "Não há resultados nesta página"
                    : term
                      ? "Nenhuma empresa encontrada"
                      : "Ainda não há empresas cadastradas"}
                </h2>
                <p className="muted">
                  {term
                    ? "Confira o nome ou tente outra busca. Você também pode abrir o link enviado pela empresa."
                    : "As empresas aparecem aqui depois de criar suas agendas. Se você tem uma empresa, comece em Minha empresa."}
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
                    className="button button-secondary"
                    href={pageLink(page - 1)}
                  >
                    Página anterior
                  </Link>
                )}
                {more && page < 999 && (
                  <Link
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
