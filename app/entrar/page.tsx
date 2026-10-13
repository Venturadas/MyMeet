import type { Metadata } from "next";
export const metadata: Metadata = { title: "Entrar" };
import Link from "next/link";
import { Logo } from "@/components/ui";
import { signIn, signUp, sendReset } from "@/lib/actions";
import { isConfigured, isRegistrationOpen } from "@/lib/supabase";
import { Notices } from "@/components/notices";

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; next?: string }>;
}) {
  const params = await searchParams;
  return (
    <main id="main" className="container workspace stack">
      <Link href="/" aria-label="MyMeet, início">
        <Logo />
      </Link>
      <div className="page-intro">
        <span className="eyebrow">Seu próximo encontro começa aqui</span>
        <h1>Uma conta. Uma agenda mais leve.</h1>
        <p className="muted">Crie sua conta grátis para agendar. Empresas precisam de uma assinatura ativa para atender clientes.</p>
      </div>
      <Notices params={params} />
      {!isConfigured() && (
        <p className="notice">
          O acesso real aguarda a conexão com Supabase. Enquanto isso,{" "}
          <Link href="/demo">explore a demonstração</Link>.
        </p>
      )}
      <div className="grid-2">
        <section className="card stack">
          <h2>Bem-vindo de volta</h2>
          <form className="stack" action={signIn}>
            <input type="hidden" name="next" value={params.next || ""} />
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
            <button className="button" disabled={!isConfigured()}>
              Entrar
            </button>
          </form>
          <details>
            <summary>Esqueci minha senha</summary>
            <form className="stack" action={sendReset}>
              <label className="field">
                E-mail da conta
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                />
              </label>
              <button
                className="button button-secondary"
                disabled={!isConfigured()}
              >
                Enviar recuperação
              </button>
            </form>
          </details>
        </section>
        <section className="card stack">
          <h2>Crie sua conta grátis</h2>
          {!isRegistrationOpen() && (
            <p className="notice">
              Novas contas estarão disponíveis em breve. Enquanto isso,{" "}
              <Link href="/demo">explore a demonstração</Link>.
            </p>
          )}
          <p className="muted">
            Pedimos só nome e e-mail. Nenhum CPF, endereço ou dado sensível.
          </p>
          <form className="stack" action={signUp}>
            <input type="hidden" name="next" value={params.next || ""} />
            <label className="field">
              Como podemos chamar você?
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
              <small>Ao menos 12 caracteres. Use uma senha exclusiva.</small>
            </label>
            <label className="inline privacy-checkbox">
              <input type="checkbox" name="privacy" required />
              <span>
                {" "}
                Li como meus dados serão usados na{" "}
                <Link href="/privacidade">política de privacidade</Link>.
              </span>
            </label>
            <button
              className="button"
              disabled={!isConfigured() || !isRegistrationOpen()}
            >
              Criar minha conta
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
