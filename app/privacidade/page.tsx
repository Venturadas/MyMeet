import type { Metadata } from "next";
export const metadata: Metadata = { title: "Privacidade" };
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
          Supabase hospeda o banco e a autenticação nos Estados Unidos, na
          região us-west-2. A aplicação é hospedada pela Vercel, com execução
          principal na região iad1, também nos Estados Unidos. Isso envolve
          processamento fora do Brasil. Os provedores tratam os dados para
          disponibilizar a infraestrutura; o responsável deve manter os
          contratos e as garantias de transferência internacional aplicáveis.
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
          Nome, conta e reservas são usados para atender ao agendamento
          solicitado e à relação de serviço, incluindo procedimentos
          preliminares pedidos pelo titular (artigo 7º, V, da LGPD). Registros
          de segurança servem para proteger o acesso e a integridade do serviço;
          eventual uso por legítimo interesse exige avaliar necessidade e os
          direitos do titular.
        </p>
        <p>
          Conta e perfil permanecem durante o uso do serviço e a análise de
          solicitações. A regra operacional do MVP limita o histórico de
          reservas encerradas e a auditoria a 12 meses, com revisão mensal pelo
          responsável. Retenção adicional exige uma obrigação ou justificativa
          aplicável, documentada. Não há descarte automático neste momento.
        </p>
        <p>
          Solicitações feitas pelo painel são registradas imediatamente. Pedidos
          de confirmação e acesso completo serão tratados observando o prazo de
          até 15 dias previsto no artigo 19 da LGPD. Correção, exclusão e outras
          solicitações são analisadas conforme o caso; você pode acompanhar o
          status no painel e entrar em contato pelo e-mail acima.
        </p>
        <p>
          O cadastro público está em preparação enquanto o envio de e-mails e a
          operação de privacidade são concluídos. Esses controles não
          representam certificação de conformidade jurídica integral.
        </p>
      </section>
      <Link className="button button-secondary" href="/cliente">
        Acessar meus dados
      </Link>
    </main>
  );
}
