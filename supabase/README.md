# Banco de dados do MyMeet

Execute `migrations/202610110001_mymeet.sql` em um projeto Supabase novo pelo SQL Editor ou `supabase db push` após vincular o projeto. A migração é transacional, não modifica tabelas existentes e não contém dados nem credenciais. Se houver objetos com os mesmos nomes, revise a compatibilidade antes de aplicar. Não execute os testes de fixtures em um projeto real.

No aplicativo, configure apenas a URL do projeto e a chave **publishable/anon**. Nunca coloque a chave `service_role`, senha PostgreSQL ou token administrativo no navegador, Git, logs ou variáveis públicas como `NEXT_PUBLIC_*`/`VITE_*`. As permissões reais são as políticas RLS e os RPCs no banco.

## Contrato da aplicação

- `business_catalog`: catálogo público com `id`, `slug`, `name`, `description`, `timezone`, `created_at`; não expõe o ID do proprietário.
- `businesses`: uma empresa por proprietário, visível e editável somente por ele. `owner_id` não pode ser trocado.
- `services`: serviços ativos públicos; o proprietário pode ver os inativos e gerenciar sua própria empresa. Duração: 15–480 minutos, múltiplos de 15; preço em centavos.
- `business_hours`: chave composta `(business_id, weekday)`, sendo domingo `0` e sábado `6`. Um intervalo por dia, sem turnos noturnos, em múltiplos de 15 minutos. Use upsert com `onConflict: 'business_id,weekday'`.
- `profiles`: nome de exibição privado, criado pelo trigger de cadastro a partir de `raw_user_meta_data.display_name`. O usuário edita apenas o próprio nome. E-mail fica no Supabase Auth e não é disponibilizado à empresa.
- `appointments`: cliente e proprietário da empresa podem ler. Todas as escritas passam pelos RPCs. A empresa vê somente os dados do agendamento, incluindo nome informado, serviço, horário, preço e comentário compartilhado; não recebe acesso ao perfil ou e-mail do cliente. `service_name`, `customer_name` e `price_cents` são snapshots criados pelo banco.

RPCs via `supabase.rpc(nome, parâmetros)`:

| RPC | Acesso e comportamento |
| --- | --- |
| `available_slots(p_business_id, p_service_id, p_date)` | Público. Retorna `starts_at`, `ends_at` em intervalos de 15 minutos, respeitando fuso, expediente, duração e reservas. |
| `book_appointment(p_business_id, p_service_id, p_starts_at)` | Autenticado. Usa a identidade do JWT, o próprio nome e preço/duração do serviço. Retorna o agendamento. |
| `update_appointment(p_appointment_id, p_action, p_starts_at?, p_comment?)` | Empresa: `confirm`, `cancel`, `reschedule`, `complete`, `comment`. Cliente: `cancel`, `reschedule`, antes do início. Retorna o agendamento. |
| `get_my_spending()` | Autenticado. Total histórico, em centavos, dos serviços concluídos do próprio cliente. |
| `export_my_data()` | Autenticado. JSON do próprio perfil, e-mail, agendamentos e solicitações de privacidade. |
| `request_data_erasure()` | Autenticado. Cria uma solicitação privada de exclusão; chamadas repetidas retornam o mesmo UUID enquanto estiver pendente/em processamento. |

O horário deve ser futuro e até 90 dias adiante. O fuso padrão é `America/Sao_Paulo`. Reservas `pending` e `confirmed` bloqueiam o intervalo para a empresa inteira: este MVP atende uma agenda por empresa, sem profissionais paralelos. A exclusão GiST resolve a disputa entre requisições simultâneas; um conflito retorna SQLSTATE `23P01`. Trate esse erro mostrando que o horário foi reservado e atualizando a lista.

Cada cliente pode manter até 10 reservas futuras ativas. O banco serializa as requisições desse cliente antes de verificar o limite e as gravações da mesma empresa antes de disputar o horário; ultrapassar o limite retorna SQLSTATE `22023`.

Uma realocação volta a `pending`, mantém o preço/nome originalmente contratados e usa a duração atual do serviço. Serviços inativos não aceitam novas reservas ou realocações. Agendamentos cancelados ou concluídos não podem ser reabertos. A conclusão exige `confirmed` e fim do serviço no passado. Comentários são visíveis ao cliente e à empresa; não coloque informações sensíveis neles. Empresas e serviços com agendamentos não podem ser apagados; desative o serviço para preservar o histórico.

## Segurança e operação

Os RPCs `security definer` fixam `search_path`, verificam `auth.uid()` e autorização de cada ação, e os helpers privados não têm `EXECUTE` público. Valores monetários, identidade e estado não são confiados ao navegador. O dono da plataforma administra os dados através das ferramentas administrativas do Supabase, nunca com uma chave privilegiada distribuída aos hosts.

`audit_events` registra criação, alterações de estado/horário/comentário e exclusão de agendamentos, com identidade do ator e datas; não copia nome, e-mail ou conteúdo dos comentários. Somente a administração pode consultar esses registros. A política de retenção e o atendimento de pedidos de exclusão também devem considerar os identificadores pseudônimos da auditoria.

A solicitação de exclusão **não apaga dados automaticamente**. O controlador deve acompanhar `privacy_requests`, confirmar identidade, tratar os registros e retenções legais, responder ao titular e registrar a conclusão. Antes de produção, defina política de privacidade, base legal, retenção, responsabilidades com empresas/Supabase/Vercel, procedimentos de incidentes e backups; restrinja acesso administrativo, ative MFA e limite tentativas de autenticação. O código oferece controles técnicos, sem prometer certificação ou conformidade jurídica completa.

## Testes locais

Execute `cd supabase/tests && npm ci && npm test`. O runner `tests/run-local.sh` cria um PostgreSQL descartável fora do checkout e executa a migração com fixtures de Auth, sem acessar o Supabase real. Os testes verificam isolamento por usuário/empresa, privilégios, limites de horário/reservas, transições, exportação, solicitações privadas, auditoria e reservas concorrentes. Consulte `tests/run-local.sh --help` antes de usar um PostgreSQL local existente.
