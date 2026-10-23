import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, CalendarDays, Check, ChevronDown } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { signIn, signUp, sendReset } from "@/lib/actions";
import { isConfigured, isRegistrationOpen } from "@/lib/supabase";
import { Notices } from "@/components/notices";
import { safeAuthDestination } from "@/lib/auth-navigation";
import { FormSubmit } from "@/components/form-submit";

export const metadata: Metadata = { title: "Entrar" };

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    next?: string | string[];
    form?: string;
  }>;
}) {
  const params = await searchParams;
  const configured = isConfigured();
  const registrationOpen = isRegistrationOpen();
  const next = safeAuthDestination(params.next);

  return (
    <main id="main" className="auth-page">
      <aside className="auth-context" aria-label="Sua agenda no NuvLink">
        <span className="entry-icon">
          <CalendarDays size={25} aria-hidden="true" />
        </span>
        <h2>Seu tempo merece uma agenda simples.</h2>
        <p>
          Encontre serviços, acompanhe seus horários e conecte-se com os seus
          negócios preferidos.
        </p>
        <Image
          src="/brand/logo-icon.png"
          width={220}
          height={220}
          sizes="220px"
          alt=""
          className="auth-cloud"
        />
        <p className="auth-context-note">
          <Check size={17} aria-hidden="true" /> Conta de cliente sempre
          gratuita.
        </p>
      </aside>
      <div className="auth-panel stack">
        <Link className="brand-link" href="/" aria-label="NuvLink, início">
          <BrandLogo />
        </Link>
        <div className="page-intro">
          <h1>Entre no NuvLink</h1>
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
          <FormSubmit
            className="full-width"
            pendingLabel="Entrando…"
            disabled={!configured}
          >
            Entrar
          </FormSubmit>
        </form>
        <details className="auth-details" open={params.form === "recovery"}>
          <summary>
            Esqueci minha senha <ChevronDown size={17} aria-hidden="true" />
          </summary>
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
            <FormSubmit
              secondary
              pendingLabel="Enviando recuperação…"
              disabled={!configured}
            >
              Enviar recuperação
            </FormSubmit>
          </form>
        </details>
        <details className="auth-details" open={params.form === "signup"}>
          <summary>
            Crie sua conta grátis <ChevronDown size={17} aria-hidden="true" />
          </summary>
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
                aria-describedby="signup-password-help"
                required
              />
              <small id="signup-password-help">
                Pelo menos 12 caracteres. Use uma senha exclusiva.
              </small>
            </label>
            <label className="inline privacy-checkbox">
              <input type="checkbox" name="privacy" required />
              <span>
                Li a <Link href="/privacidade">política de privacidade</Link>.
              </span>
            </label>
            <FormSubmit
              className="full-width"
              pendingLabel="Criando conta…"
              disabled={!configured || !registrationOpen}
            >
              Criar conta grátis
            </FormSubmit>
          </form>
          <p className="muted auth-note">
            Para receber reservas na sua empresa, escolha um{" "}
            <Link href="/planos">plano</Link>.
          </p>
        </details>
        <Link className="auth-back" href="/empresas">
          <ArrowLeft size={16} aria-hidden="true" /> Encontrar uma empresa
        </Link>
      </div>
    </main>
  );
}
