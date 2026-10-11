import Link from "next/link";
import { Logo } from "@/components/ui";
export default function Privacy() {
  return (
    <main id="main" className="container workspace stack prose">
      <Link href="/" aria-label="MyMeet, início">
        <Logo />
      </Link>
      <div className="page-intro">
        <span className="eyebrow">Privacidade por padrão</span>
        <h1>Seus dados têm um propósito.</h1>
        <p className="muted">
          Informações claras sobre o uso dos dados no MyMeet.
        </p>
      </div>
      <section className="card stack">
        <h2>O que coletamos e por quê</h2>
        <p>
          Seu nome e e-mail são usados para criar a conta, autenticar seu acesso
          e organizar os agendamentos solicitados por você. A senha é gerenciada
          pelo Supabase Auth; não é disponibilizada às empresas.
        </p>
        <p>
          Registramos serviço, valor, horário, status e comentários sobre a
          reserva. Não solicitamos CPF, endereço, informações de saúde ou dados
          de pagamento. Não inclua dados sensíveis nos campos de texto.
        </p>
      </section>
      <section className="card stack">
        <h2>Quem pode acessar</h2>
        <p>
          Você acessa seu perfil e suas reservas. A empresa recebe seu nome e os
          detalhes dos agendamentos realizados com ela, sem acesso ao seu
          e-mail, seu perfil ou reservas de outras empresas. O responsável pelo
          MyMeet tem acesso administrativo para operar o serviço e atender
          solicitações de privacidade.
        </p>
        <p>
          Supabase hospeda o banco e a autenticação; Vercel pode hospedar a
          aplicação. A região de hospedagem, transferências internacionais e
          contratos de tratamento devem ser informados pelo responsável antes do
          lançamento.
        </p>
      </section>
      <section className="card stack">
        <h2>Seus direitos e suas escolhas</h2>
        <p>
          No painel você pode exportar seus dados e registrar uma solicitação de
          exclusão. A exclusão requer análise do responsável, incluindo
          eventuais obrigações legais de retenção. A leitura desta política não
          autoriza marketing; o MVP não possui comunicação promocional nem
          rastreadores de publicidade.
        </p>
        <p>
          Cookies de sessão são usados para manter seu acesso. Você pode
          encerrar a sessão pelo botão Sair.
        </p>
      </section>
      <section className="card stack">
        <h2>Responsável e retenção</h2>
        <p>
          Responsável:{" "}
          {process.env.NEXT_PUBLIC_CONTROLLER_NAME ||
            "a ser informado antes do lançamento público"}
          .
        </p>
        <p>
          Contato de privacidade:{" "}
          {process.env.NEXT_PUBLIC_PRIVACY_CONTACT ||
            "a ser informado antes do lançamento público"}
          .
        </p>
        <p>
          A finalidade principal é executar o agendamento solicitado. A base
          legal aplicável a cada operação, os prazos de retenção e o prazo de
          resposta às solicitações precisam ser definidos pelo responsável e
          comunicados antes do uso com clientes reais. Este MVP não deve receber
          dados reais enquanto essas informações estiverem pendentes.
        </p>
      </section>
      <Link className="button button-secondary" href="/cliente">
        Acessar meus dados
      </Link>
    </main>
  );
}
