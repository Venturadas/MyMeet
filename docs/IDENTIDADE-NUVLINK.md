# Identidade NuvLink

NuvLink é o nome oficial do produto. A marca usa a nuvem azul e o lettering da imagem aprovada pelo responsável. A frase institucional preferida é **Encontre. Agende. Conecte.** A descrição é: “NuvLink conecta clientes e negócios por meio de agendamentos simples, rápidos e online.”

Esta migração continua o aplicativo existente. A mudança de identidade não muda preços, autenticação, agendamentos, pagamentos, permissões ou dados de usuários e empresas.

## Uso da marca

Use o componente compartilhado `BrandLogo` nas interfaces. As variantes atendem à marca horizontal, símbolo, apresentação compacta e fundos claros ou escuros. Preserve a proporção; reduza o símbolo em espaços restritos em vez de comprimir o lettering. O texto alternativo ou nome acessível deve identificar NuvLink, sem anunciar duas vezes a mesma marca quando houver texto adjacente.

Os arquivos reutilizáveis ficam em `public/brand/`, com nomes estáveis como `logo-full`, `logo-icon`, `logo-light` e `logo-dark`. A nuvem é a origem dos favicons, ícone Apple e ícones de aplicativo. Não reutilize imagens antigas ou redesenhe a nuvem em cada tela.

| Cor | Valor de referência | Uso |
| --- | --- | --- |
| Azul-marinho | `#0B2D6B` | Marca escura e elementos com texto branco que exijam contraste |
| Azul principal | `#2F80FF` | Destaque visual da marca |
| Azul claro | `#EAF4FF` | Superfícies suaves |
| Branco | `#FFFFFF` | Superfície principal |

Reutilize os tokens de `app/globals.css`; mantenha aliases necessários aos componentes existentes para evitar duplicação. A escolha de um tom para botões, textos ou foco deve considerar contraste com o fundo, além da cor de referência da logo. E-mails usam estilos inline equivalentes, pois não carregam o CSS do aplicativo.

## Navegador, compartilhamento e aplicativo

Títulos, descrição, Open Graph, cartão social, nome curto e nome do manifest devem usar NuvLink. Favicons e ícones devem usar a nuvem aprovada, em tamanhos adequados e com proporção preservada. Criar um manifest e ícones não implica suporte offline ou uma instalação PWA validada; essas capacidades só devem ser anunciadas após implementação e testes próprios.

## E-mails de autenticação

Os templates versionados estão em `supabase/templates/`: confirmação de cadastro, recuperação de senha e alteração de e-mail. O cabeçalho usa a nuvem por URL HTTPS absoluta e o nome NuvLink em texto, mantendo a identificação mesmo se o cliente de e-mail bloquear imagens externas.

A origem atual do ícone é `https://nuvemmeet.vercel.app/brand/logo-icon.png`. Publique e verifique esse arquivo antes de aplicar os templates no Supabase hospedado. A URL antiga continua sendo a origem real; trocar a marca não cria outro domínio. Atualize a origem dos assets somente junto de uma migração de domínio validada.

Os assuntos e o nome de exibição do remetente também devem usar NuvLink. Alterar arquivos locais não aplica automaticamente templates no Supabase hospedado: publique apenas os campos de apresentação necessários na configuração de Auth, sem alterar credenciais SMTP, remetente/endereço real, Site URL, callbacks ou políticas. Não envie mensagens nem crie contas reais para validar branding.

Preserve integralmente as expressões Go (`{{ .SiteURL }}`, `{{ .TokenHash }}`, `{{ .RedirectTo | urlquery }}` e `{{ .NewEmail }}`), os tipos dos fluxos e os links de autenticação. Não substitua o link seguro por uma URL fixa nem use dados pessoais em URLs de imagens.

## Identificadores técnicos preservados

Os nomes anteriores NuvemMeet e MyMeet não devem aparecer como marca em telas ou mensagens novas. As ocorrências técnicas abaixo são exceções deliberadas e devem ser preservadas até uma migração própria, com análise de impacto:

| Identificador existente | Motivo |
| --- | --- |
| Repositório `Venturadas/MyMeet` e caminhos locais de checkout | Mudar a marca não exige renomear o repositório ou mover arquivos de trabalho. |
| `https://nuvemmeet.vercel.app` e URLs que usam essa origem | Site publicado, callbacks e integrações continuam dependendo do domínio real. |
| Projeto Supabase `hxzivecxzpawfipvnlew` | Identidade do banco/Auth existente; não recriar projeto nem substituir dados. |
| `NUVEMMEET_REGISTRATION_OPEN` | Variável de ambiente já configurada que controla o cadastro no servidor. Renomear sem migração da configuração poderia fechar o cadastro. |
| `MYMEET_SMTP_APP_PASSWORD` na configuração do ambiente cloud | Nome do vínculo de segredo já existente. Não é texto público nem motivo para alterar a credencial. |
| Schema `nuvemmeet_private` e nomes em SQL histórico | Contratos do banco existente. As quatro migrações antigas já foram aplicadas; não editar nem reaplicar para mudar a marca. |
| Cookie `nuvemmeet-recovery` e domínio de prova `NuvemMeet/password-recovery/v1` | Autorização de recuperação de senha existente. Mudá-los altera a validação de sessões/provas e exige análise de segurança separada. |
| URLs técnicas em testes, caminhos de relatórios, hashes e deployments históricos | Referências reais usadas em verificação e rastreabilidade, sem exibição como identidade atual. |

O registro de migrações do projeto hospedado pode estar vazio apesar de as quatro migrações já estarem presentes na estrutura real. Não interprete esse registro isoladamente como autorização para reaplicar SQL, recriar tabelas ou mexer em contas, empresas, reservas e pagamentos.

A migração incremental `20261023145242_nuvlink_subscription_messages.sql` atualiza somente a frase de assinatura exibida por duas funções para NuvLink. As definições são comparadas antes e depois para preservar integralmente a lógica, assinaturas, proprietários, permissões, `SECURITY DEFINER` e `search_path`. As quatro migrações históricas permanecem intactas. Essa migração de apresentação foi aplicada e conferida no projeto hospedado; o histórico remoto contém sua versão própria e não substitui a verificação da estrutura anterior.

## Revisões e continuidade

`docs/REVISAO-2026-10-15.md` é um registro histórico, anterior à mudança de marca. Seus resultados são daquela revisão; não comprovam validação atual de Pix bancário, webhook, backup/restauração ou fluxos conectados após esta migração. Preserve os fatos, endereços e identificadores históricos ao atualizar a documentação.

Em novas telas, mensagens, downloads e metadados, use exclusivamente NuvLink e o componente/arquivos compartilhados. Antes de finalizar uma alteração, procure referências às marcas antigas e classifique cada ocorrência entre texto público a corrigir e contrato técnico a preservar. Confira login, cadastro, navegação pública e privada, telas pequenas, e-mails, favicon e metadados conforme o alcance real da alteração. Registre limitações de testes sem anunciar funcionalidades não verificadas.
