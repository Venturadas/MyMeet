"use client";
import Link from "next/link";
import { Logo } from "@/components/ui";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="container workspace stack">
      <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
        <Logo />
      </Link>
      <h1>Não foi possível carregar a página.</h1>
      <p className="muted">Tente novamente em instantes.</p>
      <button className="button" onClick={() => retry()}>
        Tentar novamente
      </button>
    </main>
  );
}
