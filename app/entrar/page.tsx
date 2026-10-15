import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { signIn, signUp, sendReset } from "@/lib/actions";
import { isConfigured, isRegistrationOpen } from "@/lib/supabase";
import { Notices } from "@/components/notices";
import { safeAuthDestination } from "@/lib/auth-navigation";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; next?: string | string[]; form?: string }>;
}) {
  const params = await searchParams;
  const configured = isConfigured();
  const registrationOpen = isRegistrationOpen();
  const next = safeAuthDestination(params.next);

  return (
    <main id="main" className="container auth-shell stack">
      <Link className="brand-link" href="/" aria-label="NuvemMeet, início">
        <Logo />
      </Link>
      <div className="page-intro">
        <h1>Entre no NuvemMeet</h1>
        <p className="muted">Agende um serviço ou cuide da sua empresa.</p>
      </div>
      <Notices params={params} />
      {!configured && (
        <p className="notice">O acesso está temporariamente indisponível.</p>
      )}
      <form className="stack" action={signIn} aria-label="Entrar na conta">
        <input type="hidden" name="next" value={next} />
        <label className="field">
          E-mail
          <input
            type="email"
            name="email"
            autoComplete="email"
            maxLength={254}
            required
          />
        </label>
        <label className="field">
          Senha
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <button className="button full-width" disabled={!configured}>
          Entrar
        </button>
      </form>
      <details className="auth-details" open={params.form === "recovery"}>
        <summary>Esqueci minha senha</summary>
        <form className="stack" action={sendReset}>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            E-mail da conta
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <button className="button button-secondary" disabled={!configured}>
            Enviar recuperação
          </button>
        </form>
      </details>
      <details className="auth-details" open={params.form === "signup"}>
        <summary>Crie sua conta grátis</summary>
        {!registrationOpen && (
          <p className="notice">
            Novos cadastros estarão disponíveis em breve.
          </p>
        )}
        <form className="stack" action={signUp}>
          <input type="hidden" name="next" value={next} />
          <label className="field">
            Seu nome
            <input
              name="name"
              autoComplete="name"
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label className="field">
            E-mail
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
          <label className="field">
            Senha
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <small>Pelo menos 12 caracteres. Use uma senha exclusiva.</small>
          </label>
          <label className="inline privacy-checkbox">
            <input type="checkbox" name="privacy" required />
            <span>
              Li a <Link href="/privacidade">política de privacidade</Link>.
            </span>
          </label>
          <button
            className="button full-width"
            disabled={!configured || !registrationOpen}
          >
            Criar conta grátis
          </button>
        </form>
        <p className="muted auth-note">
          Para receber reservas na sua empresa, escolha um{" "}
          <Link href="/planos">plano</Link>.
        </p>
      </details>
      <Link className="auth-back" href="/empresas">
        Encontrar uma empresa
      </Link>
    </main>
  );
}
