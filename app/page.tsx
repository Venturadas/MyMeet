import Link from "next/link";
import { Logo, SectionHeading } from "@/components/ui";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={diagonal ? "M6 18 18 6M6 6h12v12" : "M5 12h14m-6-6 6 6-6 6"}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const features = [
  {
    number: "01",
    title: "Seu serviço, seu ritmo.",
    description:
      "Organize serviços, valores e horários de atendimento conforme o seu negócio.",
    icon: (
      <>
        <path d="M6 5h12M6 12h12M6 19h12" />
        <circle cx="9" cy="5" r="2" />
        <circle cx="15" cy="12" r="2" />
        <circle cx="11" cy="19" r="2" />
      </>
    ),
  },
  {
    number: "02",
    title: "Um link. Um agendamento.",
    description:
      "Seu cliente escolhe o serviço e um horário disponível. Sem troca de mensagens para combinar.",
    icon: (
      <>
        <rect x="4" y="5" width="16" height="16" rx="5" />
        <path d="M8 3v4m8-4v4M4 11h16m5 5 2 2 4-4" />
      </>
    ),
  },
  {
    number: "03",
    title: "Tudo no seu painel.",
    description:
      "Confirme, cancele ou reagende. Acompanhe os atendimentos e mantenha cada detalhe no lugar.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="5" />
        <path d="M3 10h18m-11 0v10m4-6h3m-3 3h3" />
      </>
    ),
  },
];

export default function Home() {
  return (
    <>
      <header className="app-header container">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <nav className="nav" aria-label="Navegação principal">
          <a className="nav-how" href="#como-funciona">
            Como funciona
          </a>
          <Link href="/empresas">Agendar</Link>
          <Link className="button button-secondary button-small" href="/entrar">
            Entrar <Arrow />
          </Link>
        </nav>
      </header>
      <main id="main">
        <section className="hero container">
          <div className="hero-copy">
            <p className="hero-eyebrow">
              <span aria-hidden="true" /> Menos mensagens, mais encontros
            </p>
            <h1>
              Seu tempo,
              <br />
              <span>bem agendado.</span>
            </h1>
            <p className="hero-description">
              Uma agenda simples para o seu negócio. Seus clientes escolhem o
              horário e você cuida do que faz de melhor.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/entrar">
                Começar agora <Arrow />
              </Link>
              <Link className="button button-secondary" href="/demo">
                Explorar a demo <Arrow diagonal />
              </Link>
            </div>
            <div className="hero-footnote">
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinejoin="round"
                />
                <path
                  d="m8 12 3 3 5-5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>{" "}
              Feito para simplificar. Pensado para proteger.
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Exemplo ilustrativo de uma agenda, com dados fictícios"
          >
            <div className="visual-orbit" aria-hidden="true" />
            <div className="schedule-preview">
              <div className="preview-header">
                <div>
                  <p className="eyebrow">SUA AGENDA, NO LUGAR</p>
                  <h2>Um bom dia começa aqui.</h2>
                </div>
                <span className="preview-icon" aria-hidden="true">
                  ✦
                </span>
              </div>
              <div className="preview-day">
                <div>
                  <strong>Quarta-feira</strong>
                  <span>14 de outubro · exemplo</span>
                </div>
                <span className="chip">3 encontros</span>
              </div>
              <div className="preview-dates" aria-hidden="true">
                {["S 12", "T 13", "Q 14", "Q 15", "S 16"].map((day, i) => (
                  <span className={i === 2 ? "active" : ""} key={day}>
                    <small>{day.split(" ")[0]}</small>
                    {day.split(" ")[1]}
                  </span>
                ))}
              </div>
              <div className="preview-event">
                <span className="preview-time">09:00</span>
                <span className="event-line" />
                <div>
                  <strong>Consultoria inicial</strong>
                  <span>Cliente exemplo · 45 min</span>
                </div>
                <span className="event-check" aria-label="Confirmado">
                  ✓
                </span>
              </div>
              <div className="preview-event preview-event-blue">
                <span className="preview-time">11:00</span>
                <span className="event-line" />
                <div>
                  <strong>Sessão de acompanhamento</strong>
                  <span>Cliente exemplo · 60 min</span>
                </div>
                <span className="event-dot" aria-label="A confirmar" />
              </div>
              <div className="preview-event">
                <span className="preview-time">14:00</span>
                <span className="event-line" />
                <div>
                  <strong>Consultoria inicial</strong>
                  <span>Cliente exemplo · 45 min</span>
                </div>
                <span className="event-check" aria-label="Confirmado">
                  ✓
                </span>
              </div>
              <div className="preview-bottom">
                <span>
                  <span className="tiny-dot" /> Agenda organizada
                </span>
                <span>
                  Tempo para você <Arrow />
                </span>
              </div>
            </div>
            <div className="floating-note">
              <span className="floating-check" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Horário reservado</strong>
                <span>Simples assim.</span>
              </div>
            </div>
            <p className="illustration-label">
              Ilustração do produto · dados fictícios
            </p>
          </div>
        </section>
        <section id="como-funciona" className="feature-section container">
          <div className="feature-intro">
            <SectionHeading
              eyebrow="PEQUENOS PASSOS, MAIS ORGANIZAÇÃO"
              title="Do primeiro clique ao próximo encontro."
            />
            <p className="muted">
              O essencial para tirar o agendamento da conversa e colocar na
              agenda.
            </p>
          </div>
          <div className="grid-3">
            {features.map((feature) => (
              <article className="feature-card" key={feature.number}>
                <div className="feature-card-top">
                  <span className="feature-icon">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {feature.icon}
                    </svg>
                  </span>
                  <span className="feature-number">{feature.number}</span>
                </div>
                <h3>{feature.title}</h3>
                <p className="muted">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="privacy-section container">
          <div className="privacy-card">
            <div className="privacy-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="m8 12 3 3 5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <p className="eyebrow">PRIVACIDADE DESDE O COMEÇO</p>
              <h2>Cada informação, no seu lugar.</h2>
              <p>
                Seu cliente acompanha os próprios agendamentos. A empresa acessa
                apenas as informações necessárias para o atendimento.
              </p>
            </div>
            <Link className="button button-secondary" href="/privacidade">
              Como cuidamos dos dados <Arrow />
            </Link>
          </div>
        </section>
      </main>
      <footer className="site-footer container">
        <Link href="/" aria-label="MyMeet, início">
          <Logo />
        </Link>
        <p>Mais espaço para o que importa.</p>
        <Link href="/privacidade">Privacidade</Link>
      </footer>
    </>
  );
}
