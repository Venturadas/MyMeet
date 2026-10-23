# Revisão de prontidão — 23/10/2026

**Atualização posterior à revisão:** o titular autorizou aplicar e publicar as correções. O PR #1 foi integrado à `main`, a migração nova foi aplicada uma única vez e a produção foi verificada. O registro está em [PUBLICACAO-2026-10-23.md](PUBLICACAO-2026-10-23.md). O diagnóstico abaixo preserva o estado da revisão anterior à autorização; a publicação não encerra as pendências de recuperação real, Pix e homologação conectada.

**Parecer: não pronto para prontidão comercial comprovada.** Há correções verificáveis e uma release preparada para revisão, mas a recuperação dos dados reais, o Pix/webhook bancário e fluxos autenticados hospedados nesta revisão continuam sem validação completa. Não houve cobrança, pagamento, reaplicação de migração nem alteração de registros reais nesta preparação.

## Escopo e linha de base

Base: `266a206f97439a8036453178b9a602e8b48b5b64`, após a identidade e o redesign NuvLink. Repositório `Venturadas/MyMeet`, aplicação Next.js App Router/React/TypeScript, Supabase Auth/Postgres/Storage e Pix Mercado Pago. Clientes são gratuitos; empresa paga R$14,99 por 30 dias, renovação manual. Nenhuma funcionalidade foi reconstruída.

Foram lidos AGENTS.md, guias da versão instalada do Next.js, README e documentação de pagamentos, revisão histórica e privacidade. Autenticação validada no servidor, recuperação com autorização vinculada à sessão, reautenticação para credenciais, RLS, RPCs privilegiadas, uploads, origens e contratos financeiros foram revisados. Isso é revisão técnica com testes delimitados, não certificação de segurança ou LGPD.

Linha de base local: `npm ci`, build e análise de tipos passaram; **45 testes Playwright e 354 assertions PostgreSQL** passaram antes das correções. Os testes SQL usam PostgreSQL real descartável com Auth/Storage sintéticos; os testes de interface privada usam componentes reais com fixtures isoladas. Eles não demonstram uma sessão real no Supabase hospedado.

## Diagnóstico e tratamento

| Prioridade | Evidência e impacto | Tratamento |
| --- | --- | --- |
| P1 corrigido na candidata | Next.js 16.4.0 afetado por GHSA-p3m5-59mp-jv5r; Server Actions existem no projeto, portanto a indisponibilidade é relevante. Outros advisories do pacote envolviam Sharp já mitigado pela versão 0.35.5 ou `use cache` não encontrado. | Patch restrito do Next.js para 16.4.3; `npm audit --omit=dev` sem vulnerabilidades conhecidas. |
| P1 corrigido na candidata | Dependências Supabase sem prazo explícito e falhas financeiras sem correlação dificultavam contenção e diagnóstico. | Prazo/cancelamento no transporte, health/readiness distintos e logs controlados sem dados pessoais. Testes de falha de rede, cancelamento e redação. |
| P1 corrigido na candidata | A página da empresa redirecionava todas as abas ao vencer a assinatura, embora o contrato SQL preserve consulta e execução de compromissos existentes. | Contexto mínimo da própria agenda e acesso limitado ao histórico, mantendo recursos pagos e reagendamento bloqueados. A migração incremental `20261023175308_existing_appointment_access.sql` foi validada apenas localmente; exige revisão e aplicação única antes de publicar esse código. |
| **P1 aberto** | API administrativa Supabase em 23/10: zero backups disponíveis e PITR desativado. Backups externos não foram comprovados. | Implementados backup criptografado e restauração real de fixture local. Ainda falta primeira cópia real, armazenamento/chave independentes e restauração operacional incluindo Auth/Storage. |
| **P1 aberto** | Billing e cadastro constam habilitados em produção; a entrega bancária real, recebedor e ativação via webhook permanecem sem comprovação do titular. | Nenhuma transação real foi criada. Procedimento de validação está em PAGAMENTOS.md. A possibilidade de pausar novas cobranças preserva reconciliação; nenhuma flag foi alterada nesta revisão. |
| **P1 de validação aberto** | Não foi identificado ambiente separado autorizado para repetir cadastro, confirmação/recuperação de e-mail e reserva autenticada ponta a ponta. Evidência histórica de 15/10 não prova esta candidata. | Mocks, servidor local e SQL passaram; falta homologação conectada com SMTP/Auth/Storage e dados próprios descartáveis autorizados. Não usar contas reais para contornar esse bloqueio. |
| P2 | Sem prova de monitor externo, alertas/plantão ou reconciliação periódica de pagamentos antigos com notificação perdida. | Endpoints e eventos preparados; runbook descreve configuração e intervenção. Nenhum monitor foi contratado/configurado ou SLO inventado. |
| P2 | Proteção de senha vazada desativada no provedor; MFA administrativo, retenção, contratos e atendimento de direitos não foram comprovados nesta revisão. | Preservados controles existentes; responsável deve verificar recursos/plano e registrar evidência operacional. Não foram modificadas credenciais. |

Não foi confirmado P0 na inspeção delimitada. Isso não significa ausência de falhas desconhecidas. Os advisors de views [`SECURITY DEFINER`](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) foram comparados às definições reais: são projeções públicas explícitas, com barreira de segurança e filtro de empresa disponível. Não foram alterados cegamente para `security_invoker`. As tabelas privadas sem política são negadas por padrão e as RPCs públicas de disponibilidade são intencionais; a autorização real e os grants precisam ser avaliados com a cobertura de isolamento.

## Evidências e limites

Após as correções operacionais iniciais, **50 testes Playwright e 381 assertions PostgreSQL** passaram. Na revisão final, o banco passou **387 assertions**, incluindo a RPC restrita da agenda expirada. O ensaio criptografou uma base sintética, restaurou em outro banco vazio e comparou dados, constraints, funções, grants e RLS; chaves incorretas, adulteração e sobrescrita foram recusadas. A suíte final local executou 52 testes: 51 passaram e um teste de interação falhou porque procurava o botão dentro de um menu ainda fechado. O teste foi corrigido para abrir o menu; os sete testes operacionais passaram em seguida, incluindo a página real da agenda expirada e o SDK real com deadline compartilhado. Nenhum teste foi removido ou teve sua expectativa de negócio enfraquecida. A execução completa do SHA enviado deve ser conferida no check remoto do PR.

| Comando final local | Resultado |
| --- | --- |
| `npm ci` | Passou, instalação limpa pelos locks. |
| `npm run lint` | Passou, zero avisos. |
| `npm run typecheck` | Passou. |
| `npm run build` | Passou, Next.js 16.4.3. |
| `npm audit --omit=dev --json` | Zero advisories conhecidos em produção. |
| `npm test -- --workers=1` | 51/52 na primeira execução; falha de interação do teste descrita acima. |
| `npx playwright test tests/operations.spec.ts --workers=1` | 7/7 após correção; SDK real, permissões de navegação e renderização real com fixture. |
| `PG_CLIENT_BIN=… npm run test:db` | 387 assertions, restauração local real incluída. |
| `git diff --check` e `bash -n supabase/tests/run-local.sh` | Passaram. |

O preflight local `npm run check:env` foi executado e **recusou** o ambiente sem chaves de aplicação e com origem incompatível; esse resultado é proteção funcionando, não ambiente configurado. O inventário remoto confirmou nomes/targets de variáveis sem reproduzir valores. Ainda é necessário executar o preflight com as variáveis reais em runner protegido; uma inspeção de nomes não prova validade das credenciais.

As consultas a produção foram somente de leitura: histórico/configuração de migrações, backups, configuração Auth filtrada, definições de views, nomes de variáveis, flags não secretas e HTTP público. Foram preservados dados e migrações existentes. O registro hospedado de migrações contém somente a migração de mensagens da marca; a estrutura histórica existe e não deve ser reaplicada.

O PostgreSQL hospedado informou versão 17.11. As consultas de detecção do changelog de 25/09 não identificaram índices `ltree`/GiST sobre floats nem operadores customizados afetados. Nenhum REINDEX/upgrade foi executado.

Uma amostra sequencial, com um cliente HTTP sem sessão e seis GETs, registrou 0,40–2,20s incluindo rede. Início, login e busca responderam; painéis retornaram redirecionamento de streaming para login sem área privada; billing/status recusou anônimo com 401 e no-store. Essa amostra não é teste de carga nem demonstra capacidade de escala.

Os checks reproduzíveis e o isolamento estão em [CI.md](CI.md). A confirmação do commit, PR e checks remotos deve ser registrada na entrega da revisão exata. YAML local não equivale a GitHub Actions aprovado. O snapshot de produção anterior continua sendo evidência da revisão anterior, não deployment desta candidata.

## Implantação e encerramento

Siga [OPERACAO-NUVLINK.md](OPERACAO-NUVLINK.md) para preflight, promoção, validação sem escrita e rollback, e [BACKUP-RESTAURACAO.md](BACKUP-RESTAURACAO.md) para recuperação. A release deve permanecer em revisão enquanto houver P1 aberto. Os critérios para encerrar são: checks da revisão exata aprovados, aplicação incremental compatível revisada, prova de recuperação de cópia real em ambiente separado e validações conectadas/bancárias apropriadas. Não apresentar esses passos pendentes como executados.
