# Pagamento de fornecedor — confirmação do recibo

Triagem: HTTP 200/JSON válido sem recibo de pagamento passava por supabaseRest.rpc como
sucesso. O contrato já revisado em p0_05_purchase_lifecycle_rollback_TEST.sql retorna
purchase_order_payments (id/amount), mas o chamador não validava esse resultado. A lacuna
não era migração pendente e pôde ser reproduzida sem escrita remota.

Diagnóstico original, função RPC real com HTTP interceptado: resposta null foi aceita;
teste esperava rejeição incerta e falhou. Nenhum pagamento real ou rollback foi executado.

Correção somente para fn_pay_purchase_order: exigir ID UUID, pedido correspondente,
valor positivo/finito igual ao enviado, método correspondente e status completed. Objeto
incompleto, lista, outra identidade/pedido/valor/método ou estado reverso não confirma
pagamento. Erro PAYMENT_RECEIPT_UNCONFIRMED usa o bloqueio não idempotente já existente;
não recarrega a compra como se o pagamento estivesse confirmado e não orienta pagar de novo.
Outras RPCs, request IDs, flags e SQLs não mudaram.

Teste diagnóstico convertido em regressão: recibo inválido bloqueia a segunda chamada,
sem novo HTTP; recibo completo numérico/numeric-string passa. 13 testes novos + regressões
afetadas do wrapper/chamador/compras: **50/50 PASS, zero falhas/skips**. Build Vite PASS,
1.579 módulos. Dados/HTTP sintéticos, nenhum fluxo financeiro real. Não foram repetidos
calendário, compra persistente P0.05, B/C1/C2 ou auditoria financeira geral.

Revisão dirigida: validação ocorre após resposta HTTP/JSON, antes de entregar resultado ao
hook, de refrescar saldos ou exibir sucesso. Rejeição SQL não muda de tratamento. Incerteza
não afirma rollback nem altera pedido/caixa; reconciliação deve comparar pagamento e ledger
antes de qualquer decisão. O bloqueio financeiro já existente é de memória da página, não
idempotência de servidor nem recuperação durável entre dispositivos/reinícios.

CI isolada purchase-integrity Linux/Windows executa apenas esses 50 testes e build. A seleção
[purchase-offline] não repete staff/calendário; [c2-offline] mantém jornadas remotas ignoradas.
Aplicação TEST, homologação de pagamento e quaisquer compensações continuam sem autorização.
Este patch é frontend preparado/testado isoladamente, sem promoção de critério: cobertura 16/60.
