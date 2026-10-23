import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
export default function NotFound() {
  return (
    <main id="main" className="container workspace stack">
      <Link className="brand-link" href="/" aria-label="NuvLink, início">
        <BrandLogo />
      </Link>
      <h1>Página não encontrada.</h1>
      <p className="muted">
        Confira o endereço ou procure a empresa para agendar.
      </p>
      <Link href="/empresas" className="button">
        Encontrar empresas
      </Link>
    </main>
  );
}
