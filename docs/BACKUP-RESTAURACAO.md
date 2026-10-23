# Backup e restauração do NuvLink

O bundle Git protege o código. Ele não recupera contas, empresas, reservas, pagamentos nem arquivos enviados. Na inspeção de 23/10/2026, a API administrativa do Supabase retornou **zero backups e PITR desativado**. Nenhum backup dos dados de produção foi criado ou restaurado nesta revisão. Não há senha de conexão ao PostgreSQL disponível neste ambiente.

O repositório agora oferece um backup PostgreSQL criptografado e um ensaio de restauração com dados inteiramente fictícios. Isso prepara o procedimento e comprova o fluxo local; a recuperação de uma cópia real de produção em ambiente separado continua pendente.

## O que a ferramenta protege

`scripts/database-backup.mjs` usa `pg_dump` em formato custom e criptografa o fluxo com **AES-256-GCM**, chave aleatória de 32 bytes e nonce novo por arquivo. Cabeçalho e conteúdo são autenticados. O backup não grava dump em texto aberto no disco. O arquivo é criado com permissão `0600`, sem sobrescrever um destino existente. Uma falha remove o arquivo parcial. A conexão de origem impõe transações somente de leitura.

O dump inclui estrutura e dados de todos os schemas acessíveis à conta de backup, incluindo Auth e metadados do Storage quando as permissões permitirem. Não é uma exportação seletiva apenas de `public`. Grants, funções, políticas RLS e constraints são mantidos. Donos de objetos são deliberadamente omitidos para permitir recuperação em uma instância separada; a atribuição de ownership/roles do ambiente de destino precisa ser revisada antes de qualquer uso operacional.

**Isso não constitui um backup completo do projeto Supabase.** Os arquivos binários do Storage não estão nas tabelas `storage.objects`. Devem ser copiados pelo mecanismo/API de Storage apropriado, com caminhos, conteúdo, integridade e permissões conferidos. Auth requer tabelas e também configuração do serviço, provedores OAuth, SMTP e URLs autorizadas; tokens/sessões e configuração de assinatura merecem tratamento operacional próprio. Registre separadamente roles globais, extensões, configurações do projeto, Edge Functions e seus segredos, integrações, domínio e configurações Vercel. Guarde segredos em cofre, nunca em Git, no chat ou neste documento.

Em um Supabase gerenciado, a conta de origem pode não ter acesso a todos os objetos internos; uma falha de `pg_dump` invalida o backup inteiro. O arquivo não deve ser considerado completo sem inventário e ensaio em projeto compatível. O dump não inclui roles globais, WAL/PITR nem credenciais dos provedores.

## Preparação pelo responsável

Use Node.js compatível com o projeto, sistema Unix e clientes PostgreSQL da mesma versão principal do servidor ou mais novos. O cliente não pode ser mais antigo que o servidor. `pg_dump`, `pg_restore` e `psql` precisam estar no `PATH`, ou defina `PG_CLIENT_BIN` para o diretório que contém esses três executáveis. `PG_BIN` do teste local aponta para o servidor e pode não conter esses clientes.

Em pasta privada fora do checkout, gere a chave uma vez, com permissões restritas. Configure `NUVLINK_BACKUP_KEY_FILE` pelo gerenciador seguro do ambiente antes de executar:

```sh
umask 077
openssl rand -out "$NUVLINK_BACKUP_KEY_FILE" 32
```

A ferramenta exige arquivo regular, de propriedade do usuário atual, com exatamente 32 bytes, sem symlink, hardlink ou acesso de grupo/outros. O caminho da chave e a URI são recebidos por variáveis de ambiente; a CLI não aceita a senha ou a URI em argumentos. Não coloque esses valores em histórico de terminal, logs, CI público, `.env` versionado ou prints. O ambiente de processo também é sensível: use uma máquina restrita, sem usuários/processos não confiáveis. Não ative `set -x`.

Cadastre a URI somente em `NUVLINK_BACKUP_DATABASE_URL` por mecanismo seguro. Conexões não locais exigem `sslmode=verify-full`; utilize CA confiável, por exemplo via parâmetro `sslrootcert` da URI. Não desabilite a verificação TLS. Para o Supabase, obtenha a conexão e as permissões corretas no painel e valide se é uma conexão direta ou pooler compatível com `pg_dump`. Não troque credenciais existentes para contornar acesso ausente. Os únicos parâmetros adicionais de URI aceitos são `sslmode` e `sslrootcert`.

Guarde uma cópia protegida da chave em cofre independente do computador e do armazenamento de backups. Sem ela, a restauração é impossível. Documente quem pode recuperar a chave e teste esse acesso. Identifique qual chave corresponde a cada arquivo sem anexar a chave ao backup. Uma futura rotação exige preservar as chaves antigas enquanto houver arquivos correspondentes.

## Criar o backup

Com as variáveis seguras já fornecidas, escolha uma pasta privada existente, fora do Git:

```sh
node scripts/database-backup.mjs backup /secure/backups/nuvlink-2026-10-23.nuvlink
```

O comando informa somente sucesso ou um código de erro controlado. Saídas SQL, linhas do banco e mensagens brutas de libpq não são impressas. A ferramenta recusa sobrescrever o destino. Não agenda execução, contrata plano, inicia PITR ou transfere dados para terceiros automaticamente.

Depois, registre horário, ambiente, versão dos clientes, tamanho e hash SHA-256 do arquivo criptografado em inventário privado; copie o arquivo para armazenamento independente com controle de acesso. GCM já detecta adulteração; o hash ajuda a detectar falhas na transferência e identificar o arquivo esperado. Confirme que o backup terminou antes de contabilizá-lo na retenção. A cópia criptografada continua sendo dado pessoal protegido e exige controle de acesso e prazo de retenção.

O responsável deve aprovar RPO/RTO e retenção antes da operação comercial. Como ponto de partida para avaliação: backup diário, cópias independentes de curto e médio prazo e teste periódico de restauração. Isso é proposta de rotina, não uma rotina ativa nem uma garantia de recuperação de 24 horas. Um volume de reservas maior pode exigir PITR e frequência superior. Nenhum plano pago foi contratado por esta alteração.

## Restaurar somente em destino local isolado

A CLI **recusa produção, hosts remotos e qualquer banco cujo nome não comece com `nuvlink_restore_`**. Não existe opção para ignorar essa proteção. Prepare previamente um banco local vazio com nome aleatório sob esse prefixo, em instância isolada. Crie antes apenas as roles globais necessárias, sem permissões de acesso a produção. Não crie tabelas de aplicação, schemas Auth/Storage ou reaplique migrações nesse destino: eles virão do dump.

Configure `NUVLINK_RESTORE_DATABASE_URL` pelo mecanismo seguro, apontando para `localhost`, `127.0.0.1` ou `::1`, e forneça o caminho da chave correta em `NUVLINK_BACKUP_KEY_FILE`:

```sh
node scripts/database-backup.mjs restore /secure/backups/nuvlink-2026-10-23.nuvlink
```

Primeiro a ferramenta descriptografa e valida integralmente a autenticação GCM. **Nenhuma conexão ou escrita de restauração ocorre antes de a autenticação terminar.** Durante essa etapa há um dump temporário em texto aberto dentro de diretório privado `0700`, arquivo `0600`, removido no bloco de limpeza tanto no sucesso quanto na falha. Reserve disco local protegido, preferencialmente criptografado; em armazenamento compartilhado ou máquina sem controle de acesso, não execute. Remoção normal de arquivo não garante apagamento físico em SSD/snapshots. Encerramento forçado da máquina/processo pode deixar resíduos temporários: inclua sua inspeção e remoção segura no procedimento de incidente.

Depois a ferramenta confere o nome retornado por `current_database()` e se existem schemas, tabelas, funções ou tipos não sistêmicos. O destino precisa permanecer exclusivo para o ensaio. A restauração usa transação única e para ao primeiro erro; não usa `--clean`, não apaga banco e não substitui objetos. Um destino já restaurado também é recusado. Se faltar role/extensão, corrija a preparação de **outro destino vazio**, sem retirar as proteções. Antes de disponibilizar uma recuperação, valide ownership, permissões, constraints, dados e comportamento de Auth/RLS/Storage no ambiente compatível.

O restore de um dump confiável pode executar funções, gatilhos e SQL do próprio arquivo. A autenticação prova integridade e posse da chave; não torna confiável um dump criado por uma origem desconhecida. Use apenas arquivos com procedência e inventário verificados, em instância isolada.

## Ensaio automatizado e seu limite

O teste `supabase/tests/backup-restore.cjs`, chamado pela suíte PostgreSQL, recebe exclusivamente a base local descartável `nuvemmeet_security_*` já preenchida com fixtures. Ele cria outro banco local aleatório `nuvlink_restore_*`, faz backup criptografado, restaura de verdade com `pg_restore` e compara todas as tabelas não sistêmicas: contagens, fingerprints de linhas, constraints, políticas e flags RLS, definições de funções e grants. Também repete consultas de isolamento de perfil/reservas entre tenants. O destino, a chave e os arquivos do ensaio são removidos ao final; o fixture de origem precisa permanecer idêntico.

São exercitadas recusa de chave exposta, arquivo adulterado, chave errada, sobrescrita de arquivo, destino inadequado e destino não vazio. Adulteração/chave errada precisam deixar o destino inalterado. Esse ensaio usa mocks locais de Auth e dos metadados Storage, não um Supabase hospedado nem os arquivos binários reais.

Execute com os clientes instalados:

```sh
PG_CLIENT_BIN=/caminho/para/postgresql/bin npm run test:db
```

Este resultado demonstra a recuperação do fixture local na versão de PostgreSQL testada. Ainda falta o responsável fornecer acesso seguro apropriado, criar a primeira cópia real, guardar chave/cópia fora da origem e restaurar essa cópia em ambiente Supabase separado com Auth/Storage/configurações reais. Registre data, escopo, duração, contagens e evidências de integridade sem anexar dados pessoais. Só esse ensaio operacional permite registrar RPO/RTO medidos e encerrar a pendência de recuperação de produção.
