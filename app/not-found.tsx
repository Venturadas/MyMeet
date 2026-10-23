import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowLeft, Search, SearchX } from "lucide-react";
export default function NotFound() {
  return (
    <main id="main" className="container entry-state-shell">
      <Link className="brand-link" href="/" aria-label="NuvLink, início">
        <BrandLogo />
      </Link>
      <section className="card stack entry-state-card">
        <span className="entry-state-icon">
          <SearchX size={28} aria-hidden="true" />
        </span>
        <h1>Página não encontrada.</h1>
        <p className="muted">
          Confira o endereço ou procure a empresa para agendar.
        </p>
        <div className="inline">
          <Link href="/empresas" className="button">
            <Search size={17} aria-hidden="true" /> Encontrar empresas
          </Link>
          <Link href="/" className="button button-secondary">
            <ArrowLeft size={17} aria-hidden="true" /> Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}
