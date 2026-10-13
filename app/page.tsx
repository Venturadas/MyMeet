import Link from "next/link";
import { Logo } from "@/components/ui";
import { BUSINESS_PRICE_CENTS } from "@/lib/billing-plan";
import { money } from "@/lib/types";

const benefits = [
  {
    title: "Clientes agendam pelo seu link",
    description: "Serviço, dia e horário. Sem precisar combinar por mensagem.",
  },
  {
    title: "Sua agenda em um só lugar",
    description: "Confirme, reagende e acompanhe os atendimentos pelo celular.",
  },
  {
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
          <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
            <Logo />
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
      <main id="main" className="home-main">
        <section className="container home-hero">
          <p className="eyebrow">Agenda online, sem complicação</p>
          <h1>
            Sua agenda, no ritmo <span>do seu negócio.</span>
          </h1>
          <p className="home-description">
            Receba reservas, organize seus horários e acompanhe os atendimentos.
            No computador ou na palma da mão.
          </p>
          <div className="inline home-actions">
            <Link className="button" href="/planos">
              Criar minha empresa
            </Link>
            <Link className="button button-secondary" href="/empresas">
              Agendar um serviço
            </Link>
          </div>
          <p className="home-price">
            Empresas: <strong>{money(BUSINESS_PRICE_CENTS)}/mês.</strong>{" "}
            Clientes agendam grátis.
          </p>
        </section>
        <section className="container home-benefits" aria-label="Como funciona">
          {benefits.map((benefit) => (
            <div key={benefit.title}>
              <h2>{benefit.title}</h2>
              <p className="muted">{benefit.description}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="container footer">
        <span>NuvemMeet</span>
        <Link href="/privacidade">Privacidade e seus dados</Link>
      </footer>
    </>
  );
}
