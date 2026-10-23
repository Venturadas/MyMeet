# Operação e release do NuvLink

Este procedimento não contrata serviços, ativa cobranças ou concede autorização para alterar dados reais. Use as integrações já autorizadas; nunca envie tokens pelo chat. Preserve a origem pública atual e a identidade NuvLink.

## Ambiente e preflight

Node.js 24, instalação por `npm ci`, aplicação Next.js e Supabase hospedado. As variáveis estão em `.env.example`; credenciais administrativas permanecem exclusivamente no servidor. O domínio de produção precisa ser uma origem HTTPS sem caminho, query ou credenciais embutidas. Callbacks do Auth devem corresponder a essa origem.

Execute `npm run check:env` em runner protegido com as variáveis do ambiente alvo. A saída contém somente nomes e códigos de erro; não imprima `env`, arquivos `.env` nem respostas administrativas completas. O comando recusa configuração ausente, chave administrativa pública, origem inválida, flags incorretas e cobrança/cadastro incompletos. Sem credenciais locais o resultado esperado é falha, não prontidão. `--development` permite HTTP apenas em loopback. O preflight não testa a validade de credenciais nem comprova SMTP/Pix.

`MERCADO_PAGO_BILLING_ENABLED=false` pausa novas cobranças mantendo a consulta de pagamentos e a reconciliação de webhooks já existentes quando as credenciais estão presentes. Não rotacione credenciais nem mude flags de produção sem autorização. Uma flag habilitada não comprova o teste bancário do titular.

## Saúde, logs e alertas

- `GET /api/health`: processo HTTP ativo, resposta sem cache e revisão do Git quando informada pela Vercel. Não depende de sessão ou banco.
- `GET /api/ready`: consulta anônima somente de leitura ao catálogo, sem devolver seus registros. Retorna 200 ou 503 genérico, sem cache. O prazo da consulta é de três segundos; não use esse endpoint para provar autenticação, e-mail, Storage, pagamento ou recuperação de desastre.
- Falhas inesperadas de cobrança, webhook, mídia e dependência geram JSON com evento permitido, motivo controlado, horário e UUID. Não são registrados corpo, sessão, URL de pagamento, identidade ou resposta bruta do provedor. Falhas financeiras e de readiness devolvem `X-Request-ID` para correlação.

Configure monitor externo para os dois endpoints na origem de produção e encaminhe falhas persistentes ao responsável. A indisponibilidade do catálogo e falhas financeiras repetidas merecem investigação; diferencie incidentes de tentativas inválidas recusadas normalmente. Defina frequência, janela de alerta, retenção e responsável conforme o tráfego e o contrato reais. Esta release fornece os sinais, mas **não configura monitor externo, canal de alerta ou plantão automaticamente**. Nenhum SLO ou capacidade de escala foi medido.

Requisições Supabase são limitadas no servidor e cancelamentos do chamador são preservados. Retentativas precisam compartilhar o prazo total; escritas não podem ser repetidas automaticamente sem a idempotência já implementada. No Pix, uma falha após envio não autoriza criar outro pagamento: reutilize o intent persistido e siga `docs/PAGAMENTOS.md`. Para notificações perdidas e intents ambíguos, consulte o recurso autoritativo e registre a intervenção sem anexar dados pessoais aos logs. Não efetue cobrança ou estorno como teste automático.

## Preparar e promover

1. Compare a revisão candidata com `origin/main`, preserve mudanças remotas e faça instalação reproduzível. Execute os checks de `docs/CI.md`, incluindo a restauração de fixture local. Confira o check remoto do SHA exato e revise o diagnóstico de prontidão.
2. Verifique o esquema real e o histórico hospedado. As quatro migrações históricas já foram aplicadas apesar do registro incompleto. A migração de mensagens da marca também já consta no provedor. **Não reaplique essas migrações.** Uma nova migração aditiva deve ser revisada e validada isoladamente antes de sua aplicação única; não use a suíte descartável contra produção.
3. Antes de promoção comercial, encerre os P1 do parecer: cópia real protegida e restauração em ambiente separado; validação bancária pelo titular; validações autenticadas em homologação apropriada. Nenhum desses itens é substituído pelo build ou por mocks.
4. Se a revisão exigir nova RPC, disponibilize somente essa migração incremental compatível antes do código que a utiliza. Uma migração exclusivamente aditiva pode coexistir com a versão anterior; preserve RLS e grants. Não conceda assinatura nem altere registros para testar.
5. Use o projeto Vercel existente, build `npm ci` + `npm run build`, Node 24 e variáveis do ambiente correto. Revise o preview, execute preflight protegido e promova somente a revisão aprovada dentro da autorização vigente. Não publique snapshots antigos sobre a produção atual.

Após promoção, confirme no GitHub/Vercel o SHA, deployment READY e alias correto. Consulte `/api/health`, `/api/ready`, início, busca, login e proteção de `/cliente` e `/empresa` sem escrita. Valide uma sessão de homologação autorizada, não uma conta real improvisada. Monitore erros correlacionados e a entrega dos webhooks existentes sem criar pagamento.

## Rollback e recuperação

Registre antes da promoção o deployment anterior e a revisão de fallback aprovada. Faça rollback da aplicação pelo projeto Vercel existente somente após conferir que a revisão mantém correções de segurança e é compatível com o esquema atual. A revisão de produção anterior a esta preparação usa Next.js 16.4.0, com advisory de indisponibilidade em Server Actions; voltar a ela reabre esse risco. Prefira correção progressiva ou um fallback que mantenha Next.js 16.4.3.

Para o contexto mínimo de agenda, a RPC aditiva pode permanecer no banco durante rollback da aplicação; não remova tabelas, não reverta dados e não reaplique migrações históricas. Uma reversão de código não desfaz pagamentos, reservas ou eventos recebidos durante o incidente. Confirme idempotência e reconcilie pelo ledger/recurso autoritativo.

Incidente de corrupção/perda de dados exige recuperação separada, não um `git reset` ou upload antigo. Siga `docs/BACKUP-RESTAURACAO.md`: restaure cópia autenticada em destino isolado, confira integridade, RLS, Auth, Storage e alterações posteriores antes de qualquer plano de cutover. A CLI fornecida recusa restauração remota e sobrescrita. Qualquer substituição de produção exige plano específico aprovado; este runbook não a executa.
