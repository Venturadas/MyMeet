import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="container workspace stack">
      <h1>Essa agenda não foi encontrada.</h1>
      <p className="muted">Confira o link enviado pela empresa.</p>
      <Link href="/" className="button">
        Voltar ao início
      </Link>
    </main>
  );
}
