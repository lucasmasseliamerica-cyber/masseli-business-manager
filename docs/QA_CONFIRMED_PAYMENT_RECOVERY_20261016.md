# NEXALVO — recuperação após pagamento confirmado

Data: 2026-10-16

Branch: `automation/nexalvo-qa-actions`

## Problema corrigido

Quando o adaptador confirmava um pagamento e `fn_create_sale` falhava, o PDV preservava o retry somente se o erro tivesse `commitUncertain`. Uma rejeição definitiva do salvamento podia deixar um pagamento já recebido sem um caminho seguro para repetir a mesma venda. Em uma futura integração com adquirente, isso também aumentaria o risco de uma segunda cobrança.

## Comportamento atual

Todo resultado de pagamento bem-sucedido agora preserva, em memória, a mesma venda e o mesmo resultado do provedor antes de exibir o erro de persistência. A ação disponível repete apenas `finalizeSuccessfulPayment` com o mesmo ID de venda; ela não chama `paymentService` e não recebe outro pagamento.

Enquanto a recuperação está pendente:

- a página registra um guard `beforeunload` para alertar sobre saída acidental;
- fechar o modal exige confirmação explícita e informa que será necessária conciliação manual;
- o retry mantém o identificador original, usando a idempotência já existente da venda;
- pagamento recusado ou não confirmado nunca entra nesse fluxo.

Também foram removidas uma chave portuguesa duplicada e duas traduções com caracteres corrompidos. A regressão agora verifica unicidade das chaves e mojibake entre letras.

## Evidência local

- regressões focadas de PDV/interface/idioma: **30/30 PASS**, zero falhas e zero skips;
- suíte estática completa do job `build-and-security`: **261/261 PASS**, zero falhas e zero skips;
- `npm run build`: PASS, 1.579 módulos transformados e sem o aviso de chave duplicada;
- `App.jsx` e `src/App.jsx`: idênticos;
- commit publicado: `491b9c3`;
- [GitHub Actions #157](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38993406844): **SUCCESS**, 12/12 jobs, preflight autenticado `PASS [OK]` e agregador **456/456 PASS**, zero falhas/skips;
- nenhuma venda, cobrança, escrita Supabase, migração ou operação financeira foi executada.

## Limites

O fluxo foi validado com resultados controlados do adaptador e regressões locais. Stripe Terminal continua desativado, e nenhuma cobrança real foi criada. Recuperação após fechamento completo do navegador exigirá reconciliação por webhook/backend e permanece parte da integração futura do adquirente.
