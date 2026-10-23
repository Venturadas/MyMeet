# Integração contínua do NuvLink

O workflow `.github/workflows/checks.yml` executa em pushes e pull requests, com Node.js 24 e Ubuntu 24.04. Os dois arquivos de lock são usados por `npm ci`; o cache contém somente pacotes npm. O job tem permissão de leitura do repositório e não recebe segredos de produção. Uma execução mais nova da mesma referência cancela a anterior.

## Verificações obrigatórias

1. Instalação reproduzível da aplicação por `npm ci`.
2. `npm audit --omit=dev --audit-level=high`: advisories altos/críticos nas dependências de produção interrompem o job. A análise contextual de exposição ainda deve acompanhar a correção; o comando não certifica ausência de vulnerabilidades desconhecidas.
3. `npm run lint`, sem avisos permitidos.
4. `npm run typecheck`.
5. `npm run build`.
6. Instalação do Chromium e `npm test`, incluindo regressões de autenticação, cobrança, mídia e interface.
7. `npm ci --prefix supabase/tests`.
8. `npm run test:db`, que cria PostgreSQL descartável e valida políticas, isolamento, concorrência, transações e a restauração criptografada de uma fixture sintética.

Nenhum teste foi removido ou convertido em aprovação opcional. As falhas de qualquer comando bloqueiam o job.

## Isolamento e diagnósticos

O ambiente de CI esvazia as configurações públicas do Supabase e a URL externa do Playwright; cadastro e cobrança ficam desabilitados. Os testes de navegador usam o servidor local, com dados sintéticos exclusivamente nas fixtures de teste. O runner de banco recusa URLs remotas e bancos que não tenham o nome de teste exigido. O drill de restauração exige um alvo localhost novo, vazio e com nome `nuvlink_restore_*`.

O PostgreSQL embarcado fornece o servidor descartável. `pg_dump` e `pg_restore` versão 17 são usados via `PG_CLIENT_BIN`, compatíveis com o servidor. O workflow procura `/usr/lib/postgresql/17/bin` e, quando necessário, instala o cliente pelo repositório oficial PGDG. Essa instalação não provisiona nem acessa o banco hospedado da aplicação.

Quando um job falha, somente `test-results/` e `playwright-report/` são preservados por cinco dias. Eles contêm capturas e traces dos testes locais desconectados. Chaves, arquivos `.env`, dumps, backups, diretórios temporários do banco e logs externos não fazem parte do upload. Não reaproveite esse passo de artefatos em homologação conectada com contas reais sem antes remover cookies, tokens e dados pessoais dos relatórios.

## Execução local e ambiente publicado

Use os mesmos comandos do workflow em Node.js 24. Para os testes SQL, instale as dependências de `supabase/tests` e disponibilize clientes PostgreSQL 17 em `PATH` ou em `PG_CLIENT_BIN`; um servidor PostgreSQL 15+ próprio pode ser selecionado por `PG_BIN` conforme `supabase/tests/run-local.sh --help`. Não forneça a URL de produção a esses testes.

O build de CI é deliberadamente desconectado e não demonstra que as credenciais do ambiente publicado estejam configuradas. O preflight `npm run check:env` deve ser executado separadamente em um ambiente protegido com as variáveis reais da release, sem imprimi-las. Não adicione os valores ao workflow, a argumentos de comandos ou aos artefatos. Uma configuração válida também não substitui a validação de uma sessão real, do serviço de e-mail ou do webhook bancário pelo titular.

Um workflow criado ou alterado localmente não é evidência de execução remota. Antes da aprovação, confira no GitHub o check da revisão exata, seu estado concluído e todos os passos. Configurar esse check como obrigatório para merge depende das regras e permissões administrativas do repositório; a existência do arquivo YAML não impõe essa proteção sozinha. O workflow não promove deployments, não aplica migrações e não restaura backups de produção.
