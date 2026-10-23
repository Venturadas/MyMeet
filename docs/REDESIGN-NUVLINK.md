# Redesign NuvLink — 23/10/2026

O projeto existente recebeu uma linguagem visual comum baseada nas referências desktop e mobile fornecidas pelo titular, adaptada à logo e à identidade NuvLink já aprovadas. Não houve recriação do produto, migração de dados, alteração de credenciais ou mudança nas regras de assinatura, reservas e pagamentos.

## Componentes e estilos

Criados:

- `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `StatusBadge` e `Skeleton` em `components/ui.tsx`.
- `NavigationMenu`: disclosure acessível com links nativos, fechamento por Escape/clique externo e retorno de foco. Serve às opções da conta e ao menu Mais.
- `app/loading.tsx`: skeleton global, com alternativa sem animação para movimento reduzido.
- `shell.css`, `customer.css`, `discovery.css`, `business.css` e `entry.css`: composições de cada área sobre os tokens e controles comuns.

Reaproveitados e evoluídos: `AppShell`, `BrandLogo`, `MediaImage`, `Appointments`, `FormSubmit`, `PublicRating`, `PublicFavorite`, `PublicCompanyDetails`, `SlotPicker`, `BusinessAnalytics`, `BusinessShare`, formulários da empresa, galeria, toasts e `PixCheckout`.

O antigo menu recolhido dos workspaces foi substituído pela navegação inferior no celular. Estilos da antiga sidebar e da antiga landing page foram removidos. Não foram criadas variantes duplicadas de cards para desktop e mobile. A nuvem e os arquivos de marca da entrega anterior foram preservados; não há imagens novas pesadas ou fontes remotas.

## Design tokens

A fonte principal existente, Arial/Helvetica, foi mantida. Os tokens vivem em `app/globals.css`:

| Papel | Valor/contrato |
| --- | --- |
| Azul da marca | `--brand-primary: #2F80FF` |
| Azul de ações com texto branco | `--brand-action: #1764D9` |
| Marinho e sidebar | `--brand-dark: #0B2D6B`; `--brand-navy-deep: #06234B` |
| Superfície secundária e fundo | `#EAF4FF`; `#F7FAFE` |
| Texto e texto secundário | `#122B4C`; `#52657D` |
| Sucesso, atenção e erro | Tokens semânticos de texto/fundo, compartilhados por badges e toasts |
| Espaçamento | Escala de 4, 8, 12, 16, 20, 24, 28, 32, 40 e 48 px |
| Bordas | 10/12 px nos controles, 16 px nos cards e 24 px nos heroes |
| Toque e movimento | Alvo de 44 px; transições de 180 ms; movimento reduzido respeitado |
| Tipografia | Títulos de página 26–32 px; seções 19–22 px; corpo 14–16 px |

Lucide React, com versão fixada no lockfile, é a única biblioteca de ícones da interface. Estrelas e símbolos de ação em texto foram substituídos por ícones dessa biblioteca. O emoji de saudação continua limitado ao texto informal.

## Telas e arquivos principais

| Área | Entrega |
| --- | --- |
| `components/app-shell.tsx`, `app/shell.css` | Sidebar marinho fixa de 216 px a partir de 1024 px; item ativo; Sair na base; topbar com conta real e dropdown. Header leve e quatro destinos na navegação inferior em telas menores, com safe-area e Mais contendo as demais áreas. |
| `app/cliente/page.tsx`, `components/appointments.tsx` | Hero com nome real, nuvem aprovada e busca; próximo horário; agenda de hoje em Brasília; próximos agendamentos; resumo real. Listas compactas com empresa/logo, serviço, data, hora, preço, status, mensagens e ações. |
| Cliente: agendamentos, favoritas, avaliações, perfil e configurações | Mesmos componentes, formulários e estados. Filtros Próximos, Concluídos, Cancelados e Histórico. Avaliação, edição, exclusão, exportação e solicitação de exclusão foram preservadas. |
| `app/empresas/page.tsx` | Busca por nome com termo preservado, resultados reais, logos/iniciais, nota real, localização, paginação, erro com nova tentativa e estado vazio. |
| `app/agendar/[slug]/page.tsx`, `components/public-company-details.tsx` | Navegação comum, identidade e capa reais, links de seção, contatos, serviços, equipe, galeria, avaliações e reserva em duas etapas visuais. O login mantém o retorno ao serviço/data escolhidos. |
| `app/reagendar/[id]/page.tsx` | Mesmo sistema visual para data e horários, mantendo autorização e valor original. |
| `app/empresa/page.tsx`, componentes da empresa | Indicadores compactos, períodos existentes, gráfico e relatório diário recolhível; agenda, serviços, clientes, avaliações, perfil, galeria e configurações. Perfil organizado em imagens, identidade, localização, contatos, profissionais e compartilhamento. |
| `app/page.tsx` | Home pública com busca como ação principal, nuvem NuvLink e apresentação compacta do plano empresarial. |
| Login, cadastro e recuperação | Mesma marca, controles, foco e feedback. Contexto visual no desktop e formulário simples no celular. As ações, callbacks e verificações de recuperação não foram alterados. |
| Planos e Pix | Apresentação do preço e renovação manual; estados de assinatura e código Pix com a mesma identidade. Integração financeira preservada. |
| Privacidade, 404, erro e loading | Hierarquia, links de seção, orientação, nova tentativa ou retorno e skeleton coerentes com o produto. |

## UX, responsividade e desempenho

- Desktop e mobile compartilham os componentes, mas usam navegação própria. A barra inferior fica somente abaixo de 1024 px; o conteúdo reserva espaço para ela.
- Menus de agendamentos expandem dentro da lista, evitando sobrepor formulários ou ficar atrás da navegação inferior.
- O relatório diário da empresa pode ser aberto quando necessário, mantendo o dashboard inicial mais curto. Os cabeçalhos de tabela têm abreviações em telas pequenas.
- Sem logo/foto, são usadas iniciais ou ícone neutro. Imagens quebradas mantêm o fallback já existente.
- O perfil do cliente é buscado uma vez e reutilizado no cabeçalho e no formulário. Empresas dos agendamentos são consultadas em lote, sem uma consulta por linha; as consultas independentes da home rodam em paralelo.
- Foram mantidos processamento e compressão de mídia, lazy loading, privacidade dos avatares e as consultas paginadas. Não há biblioteca de gráficos ou de componentes adicional; gráficos continuam SVG.
- Formulários mantêm labels, foco visível, validação, estados pendentes e bloqueios existentes. Toasts respeitam foco, expiração e movimento reduzido; no workspace mobile aparecem acima da navegação.

## Verificação e limites

`npm run build`, `npm run typecheck` e a suíte Playwright validam a entrega. A suíte inclui os 36 testes existentes e nove novos testes de regressão de interface. Na execução conjunta, 44 passaram e um cenário de navegação atingiu o limite de 30 segundos; a repetição isolada desse cenário passou em 2,7 segundos, sem alterar suas verificações.

O CSS de produção foi medido em 55.940 bytes, aproximadamente 10,6 KB comprimidos com gzip. Uma checagem adicional do componente cliente `NavigationMenu` no Chromium confirmou abertura por teclado, fechamento por Escape, retorno de foco, clique externo e fechamento ao seguir um link.

Os testes novos percorrem 320, 360, 390, 430, 768, 1024, 1280, 1440 e 1920 px, verificando transbordamento, navegação, teclado, listas, formulários e seleção de horários. Foram capturadas e inspecionadas imagens de celular e desktop de cliente, agenda, empresa, perfil, serviços e perfil público, além de home e login reais no servidor local.

Os cenários privados usam **componentes e CSS reais com dados isolados de teste**, sem sessão ou acesso ao banco hospedado. Eles demonstram layout e controles nativos, não uma jornada autenticada completa com contas reais. Os arquivos de fixtures ficam em `tests/`; não existe rota de demonstração no produto. Os endpoints financeiros e os limites de autenticação continuam cobertos pelos testes existentes sem gerar cobranças.

## Decisões e pendências reais

- O banco não possui status `in_progress`. A interface usa os estados existentes e não cria “Em andamento” artificialmente.
- A busca existente é por nome. Filtros por categoria, localização, avaliação ou disponibilidade exigem evolução funcional própria e não foram simulados.
- Não existe central persistente de notificações. O ícone do cliente leva às informações reais sobre notificações nas configurações, sem contador fictício. Os toasts existentes foram mantidos.
- Profissionais são apresentação da equipe; não foi criada disponibilidade paralela por profissional.
- Permanecem a validação do Pix/webhook pelo titular, backup/restauração do banco e preparação operacional de privacidade/MFA. Nenhuma dessas pendências foi tratada como pré-requisito para mudar CSS.
- Recomenda-se uma homologação autenticada com o titular em celular real para confirmar preferências de uso e testar ações com seus próprios dados. Não houve criação de conta, reserva, pagamento ou envio de e-mail na produção para realizar QA visual.

Repositório, domínio, contratos de schema/cookies e nomes técnicos de integração continuam preservados conforme `docs/IDENTIDADE-NUVLINK.md`.
