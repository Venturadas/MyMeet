"use client";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowLeft, CircleAlert, RotateCcw } from "lucide-react";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="container entry-state-shell">
      <Link className="brand-link" href="/" aria-label="NuvLink, início">
        <BrandLogo />
      </Link>
      <section className="card stack entry-state-card">
        <span className="entry-state-icon">
          <CircleAlert size={28} aria-hidden="true" />
        </span>
        <h1>Não foi possível carregar a página.</h1>
        <p className="muted">Tente novamente em instantes.</p>
        <div className="inline">
          <button className="button" onClick={() => retry()}>
            <RotateCcw size={17} aria-hidden="true" /> Tentar novamente
          </button>
          <Link className="button button-secondary" href="/">
            <ArrowLeft size={17} aria-hidden="true" /> Voltar ao início
          </Link>
        </div>
      </section>
    </main>
  );
}
