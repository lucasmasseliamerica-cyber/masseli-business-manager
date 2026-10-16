# NEXALVO — Recibos de vendas canceladas

Data: 2026-10-16

## Correção

- O histórico permite reimprimir o recibo de uma venda cancelada.
- O recibo identifica `REVERSED` ou `PAYMENT FAILED` e informa a data/hora da reversão quando disponível.
- O comprovante de cartão cancelado mostra `REVERSED IN NEXALVO`, evitando afirmar que o processador externo realizou um reembolso.
- Ticket de cozinha continua indisponível para venda cancelada, evitando encaminhar novamente um pedido estornado para produção.
- A geração e a prévia continuam somente leitura e não executam RPC, venda, estorno, estoque ou financeiro.

## Evidências locais

```text
node --test qa/sales-receipt-regression.test.mjs qa/pos-usability-regression.test.mjs qa/report-accuracy-regression.test.mjs qa/reports-financial-permission.test.mjs qa/security.test.mjs
```

Resultado: **39/39 PASS**, 0 falhas, 0 skips.

```text
npm run build
```

Resultado: **PASS**, 1.578 módulos transformados. O aviso conhecido do chunk principal acima de 500 kB permanece.

## Limites

`REVERSED IN NEXALVO` comprova somente o estado registrado pelo aplicativo. A integração com adquirente/Stripe Terminal ainda não existe e nenhum reembolso externo é alegado por esta interface. A impressão física depende do navegador e da impressora configurada pelo operador.
