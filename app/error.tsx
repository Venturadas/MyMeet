"use client";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="container workspace stack">
      <Link className="brand-link" href="/" aria-label="NuvLink, início">
        <BrandLogo />
      </Link>
      <h1>Não foi possível carregar a página.</h1>
      <p className="muted">Tente novamente em instantes.</p>
      <button className="button" onClick={() => retry()}>
        Tentar novamente
      </button>
    </main>
  );
}
