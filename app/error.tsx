"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="container workspace stack">
      <h1>Não foi possível carregar esta página.</h1>
      <p className="muted">
        Tente novamente em instantes. Seus dados não são exibidos nesta
        mensagem.
      </p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
