import Link from "next/link";
import { Logo } from "@/components/ui";
export default function NotFound() {
  return (
    <main id="main" className="container workspace stack">
      <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
        <Logo />
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
