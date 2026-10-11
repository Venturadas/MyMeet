# MyMeet

MVP de agendamento para pequenas empresas. Next.js + TypeScript + Supabase, preparado para Vercel. Interface em português, azul/branco, responsiva e com formas arredondadas.

## O que já existe

- Página inicial e demonstração interativa, com dados fictícios somente em memória.
- Cadastro, confirmação de e-mail, login, recuperação de senha e logout pelo Supabase Auth.
- Uma empresa e uma agenda por conta: nome, link, descrição, serviços, preços, duração e expediente semanal.
- Link público `/agendar/[slug]`: consulta de horários sem login; reserva exige conta.
- Painel da empresa: confirmar, cancelar, reagendar, concluir e comentar reservas.
- Painel do cliente: reservas, cancelamento/reagendamento antes do início, gasto histórico em serviços concluídos, exportação e solicitação de exclusão.
- RLS, autorização no banco, identidade/preço capturados pelo servidor e exclusão GiST contra reservas simultâneas.

O MVP usa horários de Brasília, um período de atendimento por dia e intervalos de 15 minutos, com antecedência máxima de 90 dias. Não processa pagamentos, envia lembretes ou admite profissionais atendendo em paralelo. Listas mostram os últimos 100 agendamentos; o total gasto é calculado sobre todo o histórico concluído.

## Desenvolvimento

Requer Node.js 22+ (validado com 24) e npm. Use o checkout existente; cada tarefa na nuvem já é isolada e não precisa de worktree.

```sh
cd /workspace/MyMeet
npm ci --cache /workspace/.npm
npm run dev
```

Sem variáveis do Supabase, a página inicial e `/demo` funcionam. Os painéis reais e a autenticação ficam indisponíveis, com indicação clara. Nenhuma demonstração é apresentada como reserva real.

## Conectar o seu Supabase

1. Use um projeto novo ou revise a compatibilidade com tabelas existentes. A migração não deve ser aplicada às cegas em outro aplicativo.
2. Execute `supabase/migrations/202610110001_mymeet.sql` no SQL Editor do projeto. É uma transação: falha não deve deixar instalação parcial. Nunca execute fixtures de teste no projeto real.
3. Copie `.env.example` para `.env.local` e preencha a URL do projeto e a chave **publishable** (ou chave pública `anon` legado). Preencha também `NEXT_PUBLIC_SITE_URL` com a origem exata da aplicação.
4. No Supabase Auth, ative confirmação de e-mail, configure Site URL e permita o callback `https://SEU-DOMINIO/auth/callback` (também a origem local durante desenvolvimento). Configure SMTP para o uso real, limite tentativas de autenticação e mantenha o acesso administrativo com MFA. Senhas no aplicativo exigem ao menos 12 caracteres; ajuste a política do Auth para o mesmo mínimo. Cadastros públicos começam fechados: após configurar o envio de e-mail e completar a política de privacidade, habilite signup no Supabase e defina `MYMEET_REGISTRATION_OPEN=true` no aplicativo. Esse controle existe também na Server Action; um POST manual não o contorna.
5. Recomece o servidor após configurar variáveis. Confirme a conta por e-mail no mesmo navegador que iniciou o cadastro (fluxo PKCE). Cadastre uma empresa, serviço e horário; com outra conta, reserve pelo link e confirme no painel da empresa.

Só a chave pública deve ser usada pela aplicação. **Nunca** coloque `service_role`, senha do banco ou token administrativo em variáveis `NEXT_PUBLIC_*`, Git ou navegador. Este aplicativo não precisa de chave administrativa. O proprietário do MyMeet administra os dados através do painel Supabase; os hosts não recebem acesso ao projeto.

Consulte [supabase/README.md](supabase/README.md) para regras e contratos do banco.

## Vercel

Importe `Venturadas/MyMeet`, branch `main`, com preset Next.js e Node.js 24. Instalação: `npm ci`; build: `npm run build`; diretório raiz: raiz do repositório. Configure as mesmas variáveis de `.env.example` no ambiente de produção e defina `NEXT_PUBLIC_SITE_URL` como o domínio final com HTTPS. Atualize os callbacks no Supabase Auth e faça um novo build quando mudar variáveis públicas.

Para preview, use projeto Supabase separado com dados fictícios. Não conecte previews públicos a dados reais de produção. O código está preparado para deploy; criar esse arquivo não publica o site nem conecta automaticamente um projeto Supabase.

## Verificação

```sh
npm run typecheck
npm run build
npm test
```

Os testes de navegador usam Chromium em `/usr/bin/chromium` quando disponível; em outras máquinas, instale o navegador com `npx playwright install chromium`. Verificam a demonstração, navegação, telas pequenas e bloqueio das rotas reais sem configuração.

Para testar as regras de acesso em PostgreSQL descartável:

```sh
cd supabase/tests
npm ci --cache /workspace/.npm
cd ../..
npm run test:db
```

O runner inicia um banco local e usa fixtures de `auth.users`, sem acessar o projeto Supabase real. Os testes de SQL cobrem RLS, ações autorizadas, adulteração, snapshots e concorrência. A integração de confirmação de e-mail e as reservas pelo Auth real devem ser verificadas após conectar seu projeto.

## Privacidade antes do lançamento

O cadastro coleta somente nome/e-mail. Hosts recebem nome e informações dos agendamentos realizados com sua empresa, sem acesso ao perfil, e-mail ou histórico em outras empresas. Cookies de sessão são HTTP-only, SameSite=Lax e Secure em produção. Não há publicidade nem analytics de terceiros.

O aplicativo tem exportação e **solicitação** de exclusão, não exclusão automática. O responsável deve processar as solicitações no Supabase, considerar retenções legais, anonimizar/apagar os registros aplicáveis e responder ao titular. Defina responsável e contato nas variáveis públicas correspondentes.

Antes de receber dados reais, complete a política de retenção, bases legais, contratos/responsabilidades com as empresas e provedores, região de hospedagem/transferências internacionais, atendimento dos direitos dos titulares, backups e restauração, resposta a incidentes e controles administrativos. Restrinja permissões administrativas e use MFA. Os controles implementados reduzem riscos; não certificam conformidade integral com a LGPD nem garantem ausência de invasões.

## Próximas melhorias

1. Lembretes de horário e notificações de confirmação por e-mail, com preferências claras.
2. Vários profissionais, pausas no expediente, feriados e bloqueios por data.
3. Paginação, lista de espera e política de cancelamento da empresa.
4. Automatização auditada do atendimento a solicitações de privacidade e rotinas de retenção.
5. Pagamentos e relatórios somente após validar o uso do MVP.
