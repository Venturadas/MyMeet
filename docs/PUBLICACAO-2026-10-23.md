# Publicação autorizada — 23/10/2026

O titular autorizou explicitamente aplicar e publicar as correções do PR #1 após conhecer as pendências operacionais. O PR foi integrado por merge, preservando o histórico, sem force push ou reset.

## Release verificada

- Aplicação: https://nuvemmeet.vercel.app.
- PR integrado: https://github.com/Venturadas/MyMeet/pull/1.
- Merge da aplicação: `f9db6d63c4f623fc8d1fb4d9713249233fcdd6d4`.
- Primeiro deployment desta release: `dpl_94tLAHufoKd9BD8XUJemExZjcSLR`, produção, **READY**, alias público atribuído; build de aproximadamente 66 segundos.
- `/api/health` confirmou `revision: f9db6d63c4f6` e `status: ok`; `/api/ready` respondeu 200 com `status: ready`. Ambos sem cache.
- A árvore da aplicação no merge é idêntica à revisão `7962989`, aprovada no [CI do PR](https://github.com/Venturadas/MyMeet/actions/runs/39999207425): 52 testes Playwright, 387 assertions PostgreSQL, lint, tipos, build e auditoria de produção sem advisories conhecidos. O [CI da main](https://github.com/Venturadas/MyMeet/actions/runs/40000505375) registra a execução após o merge.

Este registro e as correções de estado na documentação não alteram o código da aplicação. Um deployment posterior disparado por este commit de documentação pode apresentar outro SHA em `/api/health` mantendo o mesmo código verificado.

## Banco

Foi aplicada somente `20261023175308_existing_appointment_access.sql`: nova função e seus grants, sem DML sobre contas, empresas, reservas, assinaturas ou pagamentos. As migrações históricas não foram reaplicadas.

O provedor inicialmente registrou a execução com seu horário `20261023180519`. Apenas esse registro recém-criado foi reconciliado para a versão canônica do arquivo, `20261023175308`; o registro anterior da marca permaneceu intacto. Não se alterou o histórico incompleto das quatro migrações antigas.

Pós-verificação: função com filtro `owner_id=auth.uid()`, `search_path=''`, retorno de somente id/nome/fuso, execução anônima negada e chamada sem identidade recusada com `42501`. RLS permaneceu habilitado e as contagens dos registros existentes permaneceram iguais às do preflight. Nenhum usuário real foi configurado para executar esses testes.

## Conferência em produção

Smoke no navegador real em 1440px e 390px, 14 verificações: início, login, busca, planos e privacidade responderam; sem overflow, erros de console ou exceções de JavaScript. `/cliente` e `/empresa` redirecionaram para login sem sessão. O harness bloqueou métodos de escrita e não registrou tentativas de POST. A consulta anônima de billing/status foi recusada com 401 e resposta privada sem cache.

Não foi realizada validação autenticada de um usuário real ou pagamento. O resultado de readiness comprova uma consulta anônima ao catálogo, não o fluxo inteiro de SMTP, Auth, Storage ou Pix.

A leitura centralizada dos erros de runtime não foi concluída: o conector Vercel retornou 403 e o CLI rejeitou o formato de credencial intermediada da nuvem antes de consultar a API. O acesso administrativo autorizado usado para acompanhar o deployment funcionou. Não foram alteradas credenciais para contornar essa limitação. Portanto, zero erros no smoke do navegador não é uma afirmação de ausência de erros em todos os logs do servidor. Os advisors do banco continuam indicando as categorias já analisadas na revisão, incluindo RPCs deliberadas com autorização explícita e views públicas restritas; não foram tratados como corrigidos automaticamente.

## Pendências mantidas

Continuam sem comprovação a primeira cópia real protegida e sua restauração isolada completa, incluindo Auth/Storage, a validação bancária de Pix/webhook pelo titular e os fluxos autenticados em homologação apropriada. A publicação das correções não configura backup agendado, monitor externo, alertas ou plantão. Nenhuma cobrança, pagamento, concessão de assinatura ou mudança de flag foi feita nesta publicação.

O procedimento de implantação e rollback está em [OPERACAO-NUVLINK.md](OPERACAO-NUVLINK.md). A função aditiva pode permanecer durante rollback da aplicação; não reverta dados ou reaplique migrações históricas. A revisão anterior usa Next.js 16.4.0 e reabre o advisory corrigido; prefira correção progressiva ou fallback que preserve 16.4.3.
