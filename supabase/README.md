# Banco de dados do NuvemMeet

Em um projeto Supabase novo, aplique os arquivos `migrations/*.sql` em ordem pelo SQL Editor ou use `supabase db push` após vincular o projeto. Em projetos já configurados, aplique somente as migrações pendentes. As migrações são transacionais e não contêm dados nem credenciais. Se houver objetos com os mesmos nomes, revise a compatibilidade antes de aplicar. Não execute os testes de fixtures em um projeto real.

No aplicativo, configure apenas a URL do projeto e a chave **publishable/anon**. Nunca coloque a chave `service_role`, senha PostgreSQL ou token administrativo no navegador, Git, logs ou variáveis públicas como `NEXT_PUBLIC_*`/`VITE_*`. As permissões reais são as políticas RLS e os RPCs no banco.

## Contrato da aplicação

- `business_catalog`: catálogo público com `id`, `slug`, `name`, `description`, `timezone`, `created_at`, categoria, cidade/UF, endereço e contatos comerciais, logo/capa e `rating_average`/`rating_count` calculados de avaliações reais de atendimentos concluídos. Não expõe o ID do proprietário. Apenas empresas com assinatura ativa aparecem.
- `businesses`: uma empresa por proprietário, visível e editável somente por ele. `owner_id` não pode ser trocado.
- `services`: serviços ativos públicos; o proprietário pode ver os inativos e gerenciar sua própria empresa. Duração: 15–480 minutos, múltiplos de 15; preço em centavos.
- `business_hours`: chave composta `(business_id, weekday)`, sendo domingo `0` e sábado `6`. Um intervalo por dia, sem turnos noturnos, em múltiplos de 15 minutos. Use o RPC `save_business_hours` para substituir a semana de forma atômica.
- `profiles`: identidade privada criada pelo trigger de cadastro. Nome de exibição, `username` opcional único (3–30 caracteres `a-z`, `0-9`, `_`), telefone opcional e caminho de avatar pertencem apenas ao próprio usuário. `save_profile` normaliza o username para minúsculas. E-mail fica no Supabase Auth e não é disponibilizado à empresa.
- `appointments`: cliente e proprietário da empresa podem ler. Todas as escritas passam pelos RPCs. A empresa vê somente os dados do agendamento, incluindo nome informado, serviço, horário, preço e comentário compartilhado; não recebe acesso ao perfil ou e-mail do cliente. `service_name`, `customer_name` e `price_cents` são snapshots criados pelo banco.

RPCs via `supabase.rpc(nome, parâmetros)`:

| RPC | Acesso e comportamento |
| --- | --- |
| `available_slots(p_business_id, p_service_id, p_date)` | Público. Retorna `starts_at`, `ends_at` em intervalos de 15 minutos, respeitando fuso, expediente, duração e reservas. |
| `save_business_hours(p_hours)` | Empresa autenticada. Array de até 7 objetos `weekday`, `start_time`, `end_time`, sem ID da empresa. Substitui a semana em uma transação; `[]` fecha todos os dias. Uma linha inválida preserva o expediente anterior. |
| `book_appointment(p_business_id, p_service_id, p_starts_at)` | Autenticado. Usa a identidade do JWT, o próprio nome e preço/duração do serviço. Retorna o agendamento. |
| `update_appointment(p_appointment_id, p_action, p_starts_at?, p_comment?)` | Empresa: `confirm`, `cancel`, `reschedule`, `complete`, `comment`. Cliente: `cancel`, `reschedule`, antes do início. Retorna o agendamento. |
| `get_my_spending()` | Autenticado. Total histórico, em centavos, dos serviços concluídos do próprio cliente. |
| `export_my_data()` | Autenticado. JSON do próprio perfil, e-mail, agendamentos, solicitações de privacidade, avaliações, favoritos, assinatura e histórico financeiro. |
| `request_data_erasure()` | Autenticado. Cria uma solicitação privada de exclusão; chamadas repetidas retornam o mesmo UUID enquanto estiver pendente/em processamento. |
| `save_profile(p_display_name, p_username, p_phone)` | Autenticado. Atualiza apenas a própria identidade textual. `null`/vazio remove os dados opcionais; telefone aceita 8–15 dígitos com `+` opcional. Foto é atualizada separadamente, sem sobrescrever uploads concorrentes. |
| `get_my_identity()` | Autenticado. Retorna `{email, profile}` exclusivamente do usuário conectado. Não aceita ID de outro usuário. |
| `customer_overview()` | Autenticado. Retorna `upcoming`, `completed`, `spending_cents`, `favorites` dos próprios registros, sem limite da listagem. Favoritos contam somente empresas atualmente públicas. |
| `save_review(p_appointment_id, p_rating, p_comment)` | Autenticado. Uma avaliação por agendamento próprio realmente `completed`; nota 1–5 e comentário de até 1000 caracteres. Autor/empresa/nome público são derivados no banco. Proibida a autoavaliação da empresa do próprio usuário. |
| `delete_review(p_review_id)` | Autenticado. Exclui somente a própria avaliação, inclusive após vencimento da empresa. |
| `toggle_favorite(p_business_id, p_favorite)` | Autenticado. Salva/remove somente o próprio favorito. Adição exige empresa pública/ativa; remoção permanece disponível após vencimento. Chamadas repetidas são idempotentes. |
| `business_client_summary(p_limit=25, p_offset=0)` | Proprietário pago. Lista clientes agrupando exclusivamente snapshots da própria agenda; nome, contagens, último atendimento concluído, próximo horário e chave opaca restrita à empresa. Não retorna perfil, UUID de conta, e-mail, telefone ou avatar. Limite 1–100, offset 0–100000. |
| `business_review_summary()` | Proprietário pago. Média, total e distribuição de notas 1–5 dos próprios atendimentos realmente concluídos. |

`reviews` e `favorites` têm leitura privada restrita ao próprio cliente e nenhuma escrita direta. `business_reviews_public` expõe somente ID da avaliação, empresa, nota, comentário, nome público e datas; não expõe agendamento nem conta. O nome público é o username escolhido ou o primeiro nome do perfil, copiado na avaliação. O usuário deve ser informado sobre essa publicação antes de avaliar; não publique dados sensíveis em comentários.

`business_professionals` permite até 20 registros por empresa paga; proprietário edita nome, título e atividade. `business_professionals_public` mostra somente os ativos. Profissionais são apresentação da equipe: este MVP continua com uma agenda única por empresa, sem atribuição ou reservas paralelas por profissional. `business_gallery_public` mostra no máximo 12 imagens reais em ordem. Vencimento oculta equipe, galeria e avaliações da descoberta pública sem apagar seus registros. `customer_favorites` usa `security_invoker` para aplicar RLS ao cliente e associa somente empresas do catálogo ativo.

## Imagens e Storage

A migração `202610140001_profiles_reviews.sql` cria buckets `company-images` (público, conteúdo comercial) e `user-avatars` (privado), ambos limitados a WEBP e 2 MiB por arquivo. O aplicativo decodifica/reencoda o raster no servidor antes do upload; extensão/MIME do cliente não basta. Nunca envie documento, dado de cliente ou informação sensível ao bucket comercial público.

Objetos comerciais usam `business_uuid/object_uuid.webp`: não incluem UUID do proprietário. Avatares usam `user_uuid/object_uuid.webp` e exigem leitura autenticada do próprio titular. As políticas Storage validam os caminhos, identidade e assinatura ativa para empresa, impedem sobrescrita/renomeação e bloqueiam remoção de objetos ainda referenciados. A autorização real depende do JWT do usuário, não de uma chave privilegiada no navegador. O bucket público disponibiliza os arquivos comerciais por URL; ocultar a empresa do catálogo não revoga URLs já compartilhadas.

| RPC de mídia | Contrato |
| --- | --- |
| `attach_company_image(p_kind, p_path, p_record_id=null)` | Proprietário pago. Tipos `logo`, `cover`, `gallery`, `professional`; exige objeto existente no próprio diretório. Profissional exige seu ID; os demais tipos não aceitam ID. Galeria limitada a 12. Retorna `{id,path,previous_path}`. |
| `remove_company_image(p_kind, p_record_id=null)` | Proprietário pago. Remove vínculo de logo/capa, foto de profissional ou item de galeria e retorna o caminho anterior. Posições da galeria continuam consecutivas. |
| `reorder_company_gallery(p_ids)` | Proprietário pago. Permutação completa, sem duplicatas, de todos os IDs da própria galeria. Operação atômica. |
| `company_media_path_in_use(p_path)` | Proprietário pago. Consulta referências exclusivamente no próprio diretório para limpeza do arquivo substituído. A política de DELETE continua sendo a autorização final. |
| `set_avatar(p_path)` | Próprio titular. Vincula objeto já enviado ao próprio diretório privado; `null` remove foto. Retorna caminho anterior. |

Bloqueios de empresa/perfil serializam uploads e vínculos. Limites de 64 objetos comerciais e 8 avatares por titular incluem arquivos em preparação e órfãos para impedir uploads diretos ilimitados. Arquivos anteriores devem ser removidos somente quando deixarem de ser referenciados; o aplicativo trata upload e vínculo separadamente e limpa somente caminhos autorizados. A exportação pessoal inclui os próprios novos campos, avaliações e favoritos e preserva o histórico financeiro completo. Solicitações de exclusão também devem tratar objetos privados e avaliações, respeitando retenção financeira necessária.

O horário deve ser futuro e até 90 dias adiante. O fuso padrão é `America/Sao_Paulo`. Reservas `pending` e `confirmed` bloqueiam o intervalo para a empresa inteira: este MVP atende uma agenda por empresa, sem profissionais paralelos. A exclusão GiST resolve a disputa entre requisições simultâneas; um conflito retorna SQLSTATE `23P01`. Trate esse erro mostrando que o horário foi reservado e atualizando a lista.

Cada cliente pode manter até 10 reservas futuras ativas. O banco serializa as requisições desse cliente antes de verificar o limite e as gravações da mesma empresa antes de disputar o horário; ultrapassar o limite retorna SQLSTATE `22023`.

Uma realocação volta a `pending`, mantém o preço/nome originalmente contratados e usa a duração atual do serviço. Serviços inativos não aceitam novas reservas ou realocações. Agendamentos cancelados ou concluídos não podem ser reabertos. A conclusão exige `confirmed` e fim do serviço no passado. Comentários são visíveis ao cliente e à empresa; não coloque informações sensíveis neles. Empresas e serviços com agendamentos não podem ser apagados; desative o serviço para preservar o histórico.

## Segurança e operação

Os RPCs `security definer` fixam `search_path`, verificam `auth.uid()` e autorização de cada ação, e os helpers privados não têm `EXECUTE` público. Valores monetários, identidade e estado não são confiados ao navegador. O dono da plataforma administra os dados através das ferramentas administrativas do Supabase, nunca com uma chave privilegiada distribuída aos hosts.

`audit_events` registra criação, alterações de estado/horário/comentário e exclusão de agendamentos, com identidade do ator e datas; não copia nome, e-mail ou conteúdo dos comentários. Somente a administração pode consultar esses registros. A política de retenção e o atendimento de pedidos de exclusão também devem considerar os identificadores pseudônimos da auditoria.

A solicitação de exclusão **não apaga dados automaticamente**. O controlador deve acompanhar `privacy_requests`, confirmar identidade, tratar os registros e retenções legais, responder ao titular e registrar a conclusão. Antes de produção, defina política de privacidade, base legal, retenção, responsabilidades com empresas/Supabase/Vercel, procedimentos de incidentes e backups; restrinja acesso administrativo, ative MFA e limite tentativas de autenticação. O código oferece controles técnicos, sem prometer certificação ou conformidade jurídica completa.

## Testes locais

Execute `cd supabase/tests && npm ci && npm test`. O runner `tests/run-local.sh` cria um PostgreSQL descartável fora do checkout e executa as migrações com fixtures de Auth e emulação mínima das tabelas Storage, sem acessar o Supabase real. Os testes verificam isolamento por usuário/empresa, privilégios, limites de horário/reservas, transições, exportação, solicitações privadas, auditoria, reservas concorrentes, avaliações reais, favoritos e políticas de imagem. Conexões independentes também disputam a última vaga dos limites de objetos comerciais, avatares e profissionais, verificando que apenas uma vence. Limite/MIME do bucket e controles SQL são verificados; upload HTTP, reencodificação raster e assinatura de URL devem ser validados nos testes da aplicação. Consulte `tests/run-local.sh --help` antes de usar um PostgreSQL local existente.
