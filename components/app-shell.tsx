import Link from "next/link";
import { Logo } from "@/components/ui";
import { signOut } from "@/lib/actions";

export function AppShell({
  children,
  active,
  authenticated = true,
}: {
  children: React.ReactNode;
  active?: "cliente" | "empresa" | "empresas" | "planos";
  authenticated?: boolean;
}) {
  return (
    <>
      <header className="app-header">
        <nav className="container app-nav" aria-label="Navegação principal">
          <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
            <Logo />
          </Link>
          <div
            className={`nav-links${authenticated ? " nav-authenticated" : ""}`}
          >
            <Link
              aria-current={active === "empresas" ? "page" : undefined}
              href="/empresas"
            >
              Agendar
            </Link>
            {authenticated ? (
              <>
                <Link
                  aria-current={active === "cliente" ? "page" : undefined}
                  href="/cliente"
                >
                  Meus agendamentos
                </Link>
                <Link
                  aria-current={active === "empresa" ? "page" : undefined}
                  href="/empresa"
                >
                  Minha empresa
                </Link>
                <form action={signOut}>
                  <button className="button button-quiet" type="submit">
                    Sair
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link
                  aria-current={active === "planos" ? "page" : undefined}
                  href="/planos"
                >
                  Planos
                </Link>
                <Link className="button button-secondary" href="/entrar">
                  Entrar
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main id="main" className="container workspace stack">
        {children}
      </main>
      <footer className="container footer">
        <span>NuvemMeet</span>
        <Link href="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </>
  );
}
