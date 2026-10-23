import Link from "next/link";
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  Heart,
  House,
  Images,
  LogOut,
  Menu,
  Search,
  Settings2,
  Scissors,
  Star,
  Store,
  UserRound,
  UsersRound,
  Wallet,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { MediaImage } from "@/components/media-image";
import { NavigationMenu } from "@/components/navigation-menu";
import { signOut } from "@/lib/actions";

type Workspace = "cliente" | "empresa";
type Account = { name?: string | null; avatarPath?: string | null };
const workspaceLinks = {
  cliente: [
    ["inicio", "Início", House],
    ["perfil", "Meu perfil", UserRound],
    ["agendamentos", "Meus agendamentos", CalendarDays],
    ["favoritos", "Favoritos", Heart],
    ["avaliacoes", "Avaliações", Star],
    ["configuracoes", "Configurações", Settings2],
  ],
  empresa: [
    ["dashboard", "Dashboard", ChartNoAxesCombined],
    ["agenda", "Agenda", CalendarDays],
    ["servicos", "Serviços", Scissors],
    ["clientes", "Clientes", UsersRound],
    ["avaliacoes", "Avaliações", Star],
    ["perfil", "Perfil da empresa", Store],
    ["galeria", "Galeria", Images],
    ["configuracoes", "Configurações", Settings2],
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
      className="app-side-links"
      aria-label={`${mobile ? "Mais áreas" : "Áreas"} ${workspace === "empresa" ? "da empresa" : "do cliente"}`}
    >
      {workspaceLinks[workspace].map(([tab, label, Icon]) => (
        <Link
          key={tab}
          prefetch={false}
          href={`/${workspace}?tab=${tab}`}
          aria-current={activeTab === tab ? "page" : undefined}
        >
          <Icon size={19} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      {workspace === "empresa" && (
        <Link href="/planos">
          <Wallet size={19} aria-hidden="true" />
          <span>Plano e assinatura</span>
        </Link>
      )}
    </nav>
  );
}

function AccountMenu({
  workspace,
  account,
}: {
  workspace: Workspace;
  account?: Account;
}) {
  return (
    <NavigationMenu
      className="app-account"
      summaryClassName="app-account-trigger"
      label={
        <>
          <MediaImage
            kind="avatar"
            path={account?.avatarPath}
            alt="Sua foto de perfil"
            fallback={account?.name || ""}
            width={36}
            height={36}
            className="app-avatar"
          />
          <span className="app-account-name">
            {account?.name || "Minha conta"}
          </span>
          <ChevronDown size={15} aria-hidden="true" />
          <span className="sr-only">Abrir opções da conta</span>
        </>
      }
    >
      <div className="app-account-panel">
        <Link prefetch={false} href="/cliente?tab=perfil">
          <UserRound size={17} aria-hidden="true" />
          Meu perfil
        </Link>
        <Link prefetch={false} href={`/${workspace}?tab=configuracoes`}>
          <Settings2 size={17} aria-hidden="true" />
          Configurações
        </Link>
        <Link
          prefetch={false}
          href={workspace === "cliente" ? "/empresa" : "/cliente"}
        >
          <Store size={17} aria-hidden="true" />
          {workspace === "cliente" ? "Minha empresa" : "Área do cliente"}
        </Link>
        <form action={signOut}>
          <button type="submit">
            <LogOut size={17} aria-hidden="true" />
            Sair
          </button>
        </form>
      </div>
    </NavigationMenu>
  );
}

function BottomNavigation({
  workspace,
  activeTab,
}: {
  workspace: Workspace;
  activeTab: string;
}) {
  const primary =
    workspace === "cliente"
      ? ([
          ["inicio", "Início", House],
          ["agendamentos", "Agendamentos", CalendarDays],
          ["favoritos", "Favoritos", Heart],
        ] as const)
      : ([
          ["dashboard", "Início", House],
          ["agenda", "Agenda", CalendarDays],
          ["servicos", "Serviços", Scissors],
        ] as const);
  const moreActive = !primary.some(([tab]) => tab === activeTab);
  return (
    <nav className="app-bottom-nav" aria-label="Navegação no celular">
      {primary.map(([tab, label, Icon]) => (
        <Link
          prefetch={false}
          key={tab}
          href={`/${workspace}?tab=${tab}`}
          aria-current={activeTab === tab ? "page" : undefined}
        >
          <Icon size={22} aria-hidden="true" />
          <span>{label}</span>
        </Link>
      ))}
      <NavigationMenu
        className={`app-more${moreActive ? " is-active" : ""}`}
        summaryClassName="app-more-trigger"
        label={
          <>
            <Menu size={22} aria-hidden="true" />
            <span>Mais</span>
          </>
        }
      >
        <div className="app-more-panel">
          <p className="eyebrow">
            {workspace === "empresa" ? "Seu negócio" : "Sua conta"}
          </p>
          <WorkspaceNavigation
            workspace={workspace}
            activeTab={activeTab}
            mobile
          />
          <Link
            className="app-switch"
            href={workspace === "cliente" ? "/empresa" : "/cliente"}
          >
            <Store size={18} aria-hidden="true" />
            {workspace === "cliente" ? "Minha empresa" : "Área do cliente"}
          </Link>
          <form action={signOut}>
            <button type="submit" className="app-signout">
              <LogOut size={18} aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      </NavigationMenu>
    </nav>
  );
}

export function AppShell({
  children,
  active,
  authenticated = true,
  workspace,
  activeTab,
  account,
  loginHref = "/entrar",
}: {
  children: React.ReactNode;
  active?: "cliente" | "empresa" | "empresas" | "planos";
  authenticated?: boolean;
  workspace?: Workspace;
  activeTab?: string;
  account?: Account;
  loginHref?: string;
}) {
  if (workspace) {
    const tab = activeTab || (workspace === "empresa" ? "dashboard" : "inicio");
    return (
      <div className={`app-frame app-frame-${workspace}`}>
        <aside className="app-sidebar">
          <Link
            className="brand-link app-sidebar-brand"
            href="/"
            aria-label="NuvLink, início"
          >
            <BrandLogo variant="dark" />
          </Link>
          <p className="app-sidebar-label">
            {workspace === "empresa" ? "Meu negócio" : "Minha conta"}
          </p>
          <WorkspaceNavigation workspace={workspace} activeTab={tab} />
          <div className="app-sidebar-bottom">
            <Link
              className="app-switch"
              href={workspace === "cliente" ? "/empresa" : "/cliente"}
            >
              <Store size={18} aria-hidden="true" />
              {workspace === "cliente" ? "Minha empresa" : "Área do cliente"}
            </Link>
            <form action={signOut}>
              <button className="app-signout" type="submit">
                <LogOut size={18} aria-hidden="true" />
                Sair
              </button>
            </form>
            <Link className="app-privacy" href="/privacidade">
              Privacidade e seus dados
            </Link>
          </div>
        </aside>
        <div className="app-main-column">
          <header className="app-topbar">
            <Link
              className="brand-link app-mobile-brand"
              href="/"
              aria-label="NuvLink, início"
            >
              <BrandLogo />
            </Link>
            <div className="app-topbar-context">
              {workspace === "empresa"
                ? "Seu negócio conectado"
                : "Seu próximo encontro começa aqui"}
            </div>
            <div className="app-topbar-actions">
              <Link
                className="icon-button app-search-shortcut"
                href="/empresas"
                aria-label="Encontrar empresas"
              >
                <Search size={20} aria-hidden="true" />
              </Link>
              {workspace === "cliente" && (
                <Link
                  className="icon-button app-notifications-link"
                  href="/cliente?tab=configuracoes#notificacoes"
                  aria-label="Informações sobre notificações"
                >
                  <Bell size={20} aria-hidden="true" />
                </Link>
              )}
              <AccountMenu workspace={workspace} account={account} />
            </div>
          </header>
          <main id="main" className="app-content workspace-content stack">
            {children}
          </main>
        </div>
        <BottomNavigation workspace={workspace} activeTab={tab} />
      </div>
    );
  }
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
                <Link className="button button-secondary" href={loginHref}>
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
        <BrandLogo variant="light" />
        <Link href="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </>
  );
}
