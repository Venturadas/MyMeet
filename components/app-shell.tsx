import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { signOut } from "@/lib/actions";

type Workspace = "cliente" | "empresa";
const workspaceLinks = {
  cliente: [
    ["inicio", "Início"],
    ["agendamentos", "Meus agendamentos"],
    ["favoritos", "Favoritos"],
    ["avaliacoes", "Avaliações"],
    ["perfil", "Meu perfil"],
    ["configuracoes", "Configurações"],
  ],
  empresa: [
    ["dashboard", "Dashboard"],
    ["agenda", "Agenda"],
    ["servicos", "Serviços"],
    ["clientes", "Clientes"],
    ["avaliacoes", "Avaliações"],
    ["perfil", "Perfil da empresa"],
    ["galeria", "Galeria"],
    ["configuracoes", "Configurações"],
  ],
} as const;

function WorkspaceNavigation({
  workspace,
  activeTab,
  mobile = false,
}: {
  workspace: Workspace;
  activeTab: string;
  mobile?: boolean;
}) {
  return (
    <nav
      className="workspace-menu"
      aria-label={`${mobile ? "Menu" : "Áreas"} ${workspace === "empresa" ? "da empresa" : "do cliente"}${mobile ? " no celular" : ""}`}
    >
      {workspaceLinks[workspace].map(([tab, label]) => (
        <Link
          key={tab}
          prefetch={false}
          href={`/${workspace}?tab=${tab}`}
          aria-current={activeTab === tab ? "page" : undefined}
        >
          <span className="workspace-menu-marker" aria-hidden="true" />
          {label}
        </Link>
      ))}
      {workspace === "empresa" && (
        <Link prefetch={false} href="/planos">
          Plano e assinatura
        </Link>
      )}
    </nav>
  );
}

export function AppShell({
  children,
  active,
  authenticated = true,
  workspace,
  activeTab,
}: {
  children: React.ReactNode;
  active?: "cliente" | "empresa" | "empresas" | "planos";
  authenticated?: boolean;
  workspace?: Workspace;
  activeTab?: string;
}) {
  return (
    <>
      <header className="app-header">
        <nav className="container app-nav" aria-label="Navegação principal">
          <Link className="brand-link" href="/" aria-label="NuvLink, início">
            <BrandLogo />
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
                  prefetch={false}
                  aria-current={active === "cliente" ? "page" : undefined}
                  href="/cliente?tab=agendamentos"
                >
                  Meus agendamentos
                </Link>
                <Link
                  prefetch={false}
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
      {workspace ? (
        <div className="container workspace workspace-grid">
          <aside className="workspace-sidebar">
            <Link className="brand-link workspace-brand" href="/" aria-label="NuvLink, início">
              <BrandLogo variant="light" />
            </Link>
            <p className="workspace-label">
              {workspace === "empresa" ? "Minha empresa" : "Minha conta"}
            </p>
            <WorkspaceNavigation
              workspace={workspace}
              activeTab={
                activeTab || (workspace === "empresa" ? "dashboard" : "inicio")
              }
            />
          </aside>
          <details className="workspace-mobile-menu">
            <summary>
              <span aria-hidden="true">☰</span>{" "}
              {workspaceLinks[workspace].find(
                ([tab]) => tab === activeTab,
              )?.[1] || (workspace === "empresa" ? "Dashboard" : "Início")}
              <span className="muted">Menu</span>
            </summary>
            <WorkspaceNavigation
              mobile
              workspace={workspace}
              activeTab={
                activeTab || (workspace === "empresa" ? "dashboard" : "inicio")
              }
            />
          </details>
          <main id="main" className="workspace-content stack">
            {children}
          </main>
        </div>
      ) : (
        <main id="main" className="container workspace stack">
          {children}
        </main>
      )}
      <footer className="container footer">
        <BrandLogo variant="light" />
        <Link href="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </>
  );
}
