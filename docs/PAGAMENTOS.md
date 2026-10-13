# Pagamentos do NuvemMeet

O plano empresa custa **R$ 14,99 por 30 dias**, pago por **Pix** no Mercado Pago. Clientes agendam gratuitamente. Nesta versão a renovação é manual: não há débito automático, cartão cadastrado nem assinatura recorrente do Mercado Pago. Ao vencer, o banco suspende o painel da empresa e novas reservas, preservando os agendamentos existentes.

## Ativação em produção

1. Aplique as migrations na ordem e execute os testes de banco antes de habilitar cobranças.
2. Crie/acesse a aplicação de produção na sua própria conta Mercado Pago e habilite Pix para o recebimento. O cadastro da conta recebedora e sua chave Pix devem estar regulares no Mercado Pago.
3. Cadastre o webhook HTTPS `https://SEU-DOMINIO/api/billing/webhook`, com o evento **Pagamentos**. Guarde a chave secreta de assinatura fornecida pelo Mercado Pago.
4. Configure apenas no servidor/Vercel: `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `SUPABASE_SERVICE_ROLE_KEY`. Nenhuma dessas variáveis pode começar com `NEXT_PUBLIC_`, ir para Git, chats ou arquivos públicos. As credenciais de acesso devem pertencer à mesma conta recebedora.
5. Configure `NEXT_PUBLIC_SITE_URL` com a origem HTTPS final, sem caminho, query ou fragmento. Mantenha `MERCADO_PAGO_BILLING_ENABLED=false` enquanto os passos anteriores estiverem incompletos.
6. Após configurar credenciais e webhook, habilite `MERCADO_PAGO_BILLING_ENABLED=true` e publique novamente. Valide um pagamento real de R$ 14,99 autorizado pelo responsável; confirme o webhook, o ID da transação, o horário do pagamento e o vencimento no banco. Verifique também reenvio do evento e reembolso. Não marque o ambiente como validado comercialmente apenas porque a tela de Pix abre.

As páginas públicas continuam mostrando o plano sem cobrar enquanto a integração estiver desabilitada. Não há bypass administrativo no frontend, ativação por URL de retorno ou simulação de pagamento.

`MERCADO_PAGO_BILLING_ENABLED` pausa a criação de novas cobranças. Com credenciais completas, a consulta autenticada de status continua validando a conta recebedora, e o webhook continua reconciliando pagamentos e estornos já existentes. Pausar vendas não impede tratar o histórico financeiro.

## Fluxo e dados

- `POST /api/billing/checkout` exige sessão validada no Supabase, e-mail confirmado e origem HTTPS autorizada. A requisição não aceita preço, ID de usuário, empresa ou referência do navegador.
- Antes do contato com o Mercado Pago, um intent persistente é criado no banco e vinculado ao usuário. A empresa pode ainda não existir; o vínculo é preenchido quando ela é criada. O UUID do intent é tanto `external_reference` quanto `X-Idempotency-Key`. Nova tentativa de uma resposta perdida reutiliza esse mesmo intent e essa mesma cobrança.
- O servidor cria um pagamento Pix em `POST /v1/payments`, com valor fixo, e-mail do usuário confirmado, expiração persistida e URL de notificação fixa. O QR Code e o código copia-e-cola são devolvidos apenas ao dono da cobrança, sem expor o corpo completo do provedor.
- O webhook valida `data.id` da URL, `x-request-id` e `x-signature` com HMAC SHA-256 e tolerância de cinco minutos. Depois consulta o pagamento atual diretamente em `GET /v1/payments/{id}`.
- Antes de aplicar o pagamento, o servidor confirma conta recebedora via `/users/me`, `collector_id`, `live_mode=true`, método `pix`, valor 1499 centavos, moeda BRL e referência persistida. Não confia em `status` enviado pelo navegador ou pelo corpo da notificação.
- A ativação no banco é atômica e restrita ao servidor privilegiado. Salva usuário/empresa, transação única, status, horário original de aprovação, atualização do provedor e vencimento. Eventos repetidos não acrescentam dias; eventos antigos não voltam o estado; reembolso/estorno não revoga outra cobrança ainda válida.
- O período é calculado a partir da data real de pagamento e, quando houver cobertura anterior válida, do vencimento anterior. Um webhook aprovado entregue com atraso não cria 30 dias novos a partir do momento da entrega.
- `GET /api/billing/status` exige login, consulta somente a cobrança do usuário e reconcilia com o Mercado Pago. A resposta é privada e não pode ser cacheada. Uma indisponibilidade do provedor não ativa o plano nem inventa estado.

## Operação

Não remover intents ambíguos manualmente para forçar um pagamento novo: retente o mesmo checkout. Se a resposta inicial nunca chegou e a referência continua sem ID de transação após expirar, o sistema bloqueia uma nova cobrança; o responsável deve consultar a referência no Mercado Pago e reconciliar o resultado antes de liberar nova tentativa. Não editar `business_subscriptions` para simular que o Pix foi pago. Credenciais ficam somente no servidor. Revogue e substitua credenciais comprometidas; nunca registre corpos de webhook, respostas completas, código Pix, e-mail ou tokens nos logs.

Além do webhook, a consulta autenticada de status reconcilia uma confirmação quando o comprador retorna à página. Para recuperar indisponibilidades prolongadas, retente as notificações pelo painel Mercado Pago e consulte o intent existente; adote reconciliação agendada e alertas de entrega antes de escalar a operação.

## Referências técnicas

- [Mercado Pago — API de criação de pagamento](https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post)
- [Mercado Pago — API de consulta de pagamento](https://www.mercadopago.com.br/developers/pt/reference/payments/_payments_id/get)
- [Mercado Pago — Webhooks e assinatura](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks)
- [SDK oficial Node: campos da requisição](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/payment/create/types.ts)
- [SDK oficial Node: resposta Pix e QR](https://github.com/mercadopago/sdk-nodejs/blob/master/src/clients/payment/commonTypes.ts)

O código usa `fetch` no servidor e `node:crypto`; não precisa incluir o SDK Mercado Pago no bundle do navegador.
