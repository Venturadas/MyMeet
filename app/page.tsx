import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  ChartNoAxesCombined,
  Link2,
  Search,
  Store,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BUSINESS_PRICE_CENTS } from "@/lib/billing-plan";
import { money } from "@/lib/types";

const benefits = [
  {
    icon: Link2,
    title: "Clientes agendam pelo seu link",
    description: "Serviço, dia e horário. Sem precisar combinar por mensagem.",
  },
  {
    icon: CalendarDays,
    title: "Sua agenda em um só lugar",
    description: "Confirme, reagende e acompanhe os atendimentos pelo celular.",
  },
  {
    icon: ChartNoAxesCombined,
    title: "Resultados para o seu negócio",
    description: "Veja os agendamentos e os serviços realmente concluídos.",
  },
];

export default function Home() {
  return (
    <>
      <header className="app-header">
        <nav
          className="container app-nav home-nav"
          aria-label="Navegação principal"
        >
          <Link className="brand-link" href="/" aria-label="NuvLink, início">
            <BrandLogo />
          </Link>
          <div className="nav-links">
            <Link href="/empresas">Agendar</Link>
            <Link href="/planos">Planos</Link>
            <Link className="button button-secondary" href="/entrar">
              Entrar
            </Link>
          </div>
        </nav>
      </header>
      <main id="main" className="entry-home container">
        <section className="entry-hero" aria-labelledby="home-title">
          <div className="entry-hero-copy">
            <p className="eyebrow">Encontre. Agende. Conecte.</p>
            <h1 id="home-title">Seu próximo horário começa aqui.</h1>
            <p>
              Encontre uma empresa e agende seus serviços preferidos. Simples,
              rápido e no seu tempo.
            </p>
          </div>
          <Image
            className="entry-cloud"
            src="/brand/logo-icon.png"
            width={280}
            height={280}
            alt=""
            sizes="(max-width: 639px) 144px, 280px"
            priority
          />
          <form
            className="entry-search"
            role="search"
            action="/empresas"
            method="get"
          >
            <Search aria-hidden="true" size={20} />
            <label className="sr-only" htmlFor="home-company-search">
              Nome da empresa
            </label>
            <input
              id="home-company-search"
              name="q"
              type="search"
              maxLength={100}
              placeholder="Nome da empresa"
            />
            <button className="button" type="submit">
              Buscar
            </button>
          </form>
          <p className="entry-hero-note">Criar uma conta e agendar é grátis.</p>
        </section>
        <section className="entry-business" aria-labelledby="business-title">
          <div className="entry-business-heading">
            <span className="entry-icon">
              <Store aria-hidden="true" size={22} />
            </span>
            <div>
              <p className="eyebrow">Para o seu negócio</p>
              <h2 id="business-title">
                Uma agenda organizada. Mais tempo para atender.
              </h2>
              <p className="muted">
                Receba reservas pelo seu link e acompanhe seus atendimentos em
                um só lugar.
              </p>
            </div>
          </div>
          <div className="entry-business-action">
            <p>
              <strong>{money(BUSINESS_PRICE_CENTS)}</strong>{" "}
              <span className="muted">por 30 dias</span>
            </p>
            <Link className="button" href="/planos">
              Criar minha empresa <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <small className="muted">Renovação manual por Pix.</small>
          </div>
        </section>
        <section className="entry-benefits" aria-label="Como funciona">
          {benefits.map(({ icon: Icon, ...benefit }) => (
            <div key={benefit.title} className="entry-benefit">
              <span className="entry-icon">
                <Icon aria-hidden="true" size={21} />
              </span>
              <h2>{benefit.title}</h2>
              <p className="muted">{benefit.description}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="container footer">
        <BrandLogo variant="light" />
        <Link href="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </>
  );
}
