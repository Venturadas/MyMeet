# NuvemMeet

SaaS de agendas para empresas e clientes. Next.js, TypeScript, Supabase e Mercado Pago. Interface em português, azul e branco, responsiva e sem demonstração ou dados simulados.

## Uso

Clientes criam uma conta gratuita, encontram a empresa em `/empresas`, escolhem serviço/data/horário em `/agendar/[slug]` e acompanham suas reservas em `/cliente`.

Empresas pagam R$ 14,99 por Pix para obter 30 dias de acesso. Após confirmação do Mercado Pago no backend, podem criar a empresa informando somente o nome; o link é gerado automaticamente. Serviços, expediente, agendamentos, compartilhamento e análise ficam em `/empresa`.

O dashboard usa dados reais do banco: filtros de 7 dias, 30 dias, 3 meses e 1 ano; gráfico diário de atendimentos concluídos e tabela por dia. Total/concluídos/cancelados usam a data do atendimento no período escolhido, em Brasília. Futuros mostra todos os próximos atendimentos pendentes/confirmados, identificado na interface. Concluído exige o status `completed`. A tabela é paginada; os totais e o gráfico usam o período inteiro.

Ao vencer o acesso, o banco suspende novas reservas, catálogo e painel da empresa. Históricos e cancelamentos de reservas existentes permanecem protegidos e acessíveis ao titular. O Pix é renovado manualmente; não há débito automático.

## Desenvolvimento

Node.js 22+; validado com 24. Na raiz do checkout:

```sh
npm ci
npm run dev
```

Copie `.env.example` para `.env.local` sem sobrescrever configurações existentes. O aplicativo utiliza a URL e a chave pública do Supabase para autenticação e operações comuns. A chave administrativa é exclusiva do módulo de pagamento no servidor. Nenhum segredo pode usar o prefixo `NEXT_PUBLIC_`, aparecer no Git, no navegador ou nos logs.

Sem configuração do banco, as rotas públicas indicam indisponibilidade e as ações reais são bloqueadas. Não há fallback com dados fictícios.

## Banco e pagamentos

Aplique `supabase/migrations/` em ordem de nome. As duas primeiras migrations já existem no projeto original e não devem ser reaplicadas. Revise compatibilidade antes de usar outro projeto. A migration de assinaturas mantém dados existentes e não concede acesso pago automaticamente.

RLS protege contas/empresas/agendamentos. Assinaturas são consultáveis apenas pelo próprio usuário; o ledger financeiro é privado. Somente o backend privilegiado pode aplicar uma cobrança verificada. Intents persistentes, transações únicas, bloqueios e deduplicação impedem que retries acrescentem dias ou que o navegador marque um Pix como pago.

Veja [docs/PAGAMENTOS.md](docs/PAGAMENTOS.md) para credenciais, assinatura do webhook, habilitação e validação real. Até configurar a conta recebedora e confirmar o fluxo no Mercado Pago, o botão de pagamento fica indisponível. A página de retorno ou um parâmetro na URL nunca libera acesso.

## Vercel e autenticação

Use preset Next.js, Node.js 24, `npm ci` e `npm run build`. Defina a origem HTTPS final em `NEXT_PUBLIC_SITE_URL`; mantenha Site URL e callbacks `/auth/confirm` e `/auth/callback` correspondentes no Supabase. Confirmação de e-mail e senhas de pelo menos 12 caracteres permanecem obrigatórias.

`NUVEMMEET_REGISTRATION_OPEN` controla novos cadastros no servidor. `MERCADO_PAGO_BILLING_ENABLED` controla a cobrança; ambos são independentes. Não habilite pagamentos sem credenciais e webhook válidos.

## Verificação

```sh
npm run build
npm run typecheck
npm test
cd supabase/tests
npm ci
cd ../..
npm run test:db
```

Playwright verifica navegação, marca, autenticação, busca, Pix e telas de 320/390px. O runner SQL usa PostgreSQL descartável e cobre isolamento, concorrência, reservas, assinaturas, cobrança e análise. Fixtures existem somente nos testes; nenhuma é exibida como empresa ou atendimento real. Testes hospedados usam IDs isolados e removem exclusivamente seus próprios dados ao terminar. Não desative TLS para executar testes no ambiente com proxy.

## Operação e privacidade

[docs/PRIVACIDADE-OPERACAO.md](docs/PRIVACIDADE-OPERACAO.md) descreve atendimento de direitos, retenção, backups, segurança e responsabilidades. Exportação e solicitação de exclusão permanecem disponíveis. Exclusão requer tratamento administrativo; a conta/empresa não deve ser removida enquanto houver vínculos financeiros ou agendamentos que precisam de destinação.

O código reduz riscos, mas não certifica conformidade jurídica integral nem substitui a preparação operacional. Banco/Auth e aplicação usam regiões nos EUA; contratos, transferência internacional, MFA e backup/restauração precisam ser tratados pelo responsável antes da operação comercial.
