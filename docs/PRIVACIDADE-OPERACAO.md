# Operação de privacidade do MyMeet

Responsável informado: Richard. Contato: richardsamiaventura@gmail.com. O cadastro público deve permanecer fechado até SMTP, atendimento dos direitos, retenção, contratos e segurança administrativa estarem preparados. O código não certifica conformidade integral com a LGPD.

## Rotina do responsável

Todos os dias úteis, abra `privacy_requests` no painel Supabase com sua conta administrativa e confira pedidos pendentes. Registre `processing` quando iniciar e `completed` somente após executar o tratamento e responder ao titular. O usuário vê o status no próprio painel. Hosts e outros clientes não podem acessar esses pedidos.

Confirme a identidade com a sessão/conta e o e-mail já cadastrado; não solicite cópias de documentos por padrão. A exportação autenticada do painel atende ao acesso básico. Pedidos completos de confirmação/acesso devem observar o prazo de até 15 dias do artigo 19 da LGPD. Outros direitos exigem análise aplicável, sem prazos fictícios ou garantias de exclusão instantânea.

Para correção, o titular pode alterar o próprio nome para reservas futuras. Correções de histórico precisam ser verificadas administrativamente; preserve a integridade de registros necessários e a trilha de operação, limitando dados pessoais adicionais.

## Exclusão

Antes de processar, confira reservas futuras, a eventual empresa do titular e retenções justificadas. Não marque como concluído apenas porque a solicitação foi recebida.

- Para um cliente, avalie cancelamento das reservas futuras, anonimização do nome capturado nos agendamentos, remoção de comentários pessoais e dissociação dos identificadores da auditoria. Excluir somente o usuário no Auth **não** remove os nomes capturados em reservas antigas.
- Para o proprietário de uma empresa, resolva primeiro os atendimentos e a destinação da empresa/histórico. O banco impede apagar a conta que ainda é proprietária de uma empresa e impede apagar empresas/serviços com reservas. Não desative esses controles para fazer uma exclusão passar.
- Apague a conta pelo Supabase Auth somente quando as relações e dados aplicáveis tiverem sido tratados. Revogue o acesso e confira que perfil, registros pessoais e associações indevidas não permaneceram. Limite qualquer procedimento aos IDs do titular confirmado.
- Documente a justificativa e o prazo de uma retenção legal excepcional e responda ao titular. Proteja também os registros administrativos; não copie senhas, tokens ou documentos desnecessários para observações.

## Retenção

A regra inicial do MVP é revisar mensalmente reservas encerradas e auditoria com mais de 12 meses, excluindo/anonimizando o que já não é necessário. Contas/perfis permanecem enquanto ativos ou durante análise de solicitação. Não há job automático; a revisão é responsabilidade operacional. Não execute purga genérica em reservas futuras, registros de outros titulares ou dados que tenham retenção legal documentada. A exclusão de uma reserva gera uma entrada de auditoria: a rotina também deve tratar esse registro e a auditoria antiga.

Antes de abrir para clientes, registre e ajuste esses prazos às obrigações reais das empresas atendidas, incluindo contratos e histórico necessário. Reavalie as finalidades e minimize campos livres que possam receber dados sensíveis.

## Hospedagem e segurança

Banco/Auth: Supabase `us-west-2`, Estados Unidos. Aplicação: Vercel `iad1`, Estados Unidos. Revise contratos dos provedores e garantias de transferência internacional; não declare hospedagem brasileira. Defina responsabilidades de MyMeet e empresas sobre atendimento e dados das reservas.

Ative MFA para as contas administrativas Supabase/Vercel/GitHub, limite quem tem acesso e preserve as políticas RLS. Nunca entregue `service_role` aos hosts. Configure uma rotina de backup protegido e teste a restauração em ambiente separado antes de operar com dados reais; um backup só é útil se a restauração funcionar. A disponibilidade/retencão dos backups do provedor depende do plano contratado e não foi certificada por estes testes.

Na consulta de 13/10/2026 ao endpoint de backups do projeto, não havia backups disponíveis e PITR estava desativado. As migrações versionadas recuperam a estrutura, mas não os dados dos clientes. Essa pendência precisa ser resolvida antes de uso com dados reais; nenhuma contratação ou teste de restauração de backup de produção foi realizado.

Em caso de incidente, restrinja acessos e registre fatos, impacto, titulares afetados e medidas. Avalie as comunicações exigidas pela LGPD e regulamentação aplicável. Nunca inclua credenciais nas comunicações ou logs. Use dados fictícios em testes e previews.

## Abrir o cadastro

Após envio de e-mail validado e preparação operacional acima, habilite signup no Supabase mantendo confirmação de e-mail, senhas de 12 caracteres e limites de tentativas. Defina `MYMEET_REGISTRATION_OPEN=true` na Vercel e publique um novo build. Primeiro teste cadastro/confirmar/login e recuperação de senha com uma conta de teste autorizada. Não desabilite a confirmação de e-mail para contornar falhas SMTP.
