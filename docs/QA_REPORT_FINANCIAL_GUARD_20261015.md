# NEXALVO — proteção financeira em Reports

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`; nenhuma escrita no Supabase, migração, conta, convite, compra persistente ou deploy.

## Problema corrigido

Um usuário com override `viewReports=true` e `viewFinancials=false` conseguia abrir Reports. A tela ocultava alguns painéis, mas ainda renderizava P&L, receita, margens, ticket médio, valor de estoque, custo de perdas, valores por produto/canal/local/meio de pagamento, descontos, compras por fornecedor e contas a pagar.

## Comportamento atual

- Métricas e exports financeiros exigem `viewFinancials`.
- Sem essa permissão, Reports mantém somente indicadores operacionais: volumes de pedidos, produtos por quantidade, transações por canal/local/meio de pagamento, estoque crítico, produção e dados laborais não financeiros.
- A cópia raiz `App.jsx` permanece idêntica a `src/App.jsx`.
- O controle de interface reduz exposição visual, mas não substitui RLS, grants ou autorização das APIs.

## Evidência local

- `node --test qa/security.test.mjs qa/auth-core-regression.test.mjs qa/reports-financial-permission.test.mjs`: **26/26 PASS**, 0 FAIL, 0 SKIPPED.
- `qa/reports-financial-permission.test.mjs`: **5/5 PASS** em ambas as cópias do aplicativo.
- `npm run build`: PASS, 1.578 módulos; permanece o aviso conhecido do bundle principal acima de 500 kB.
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilidades de runtime.

A validação com sessão MANAGER/EMPLOYEE real permanece pendente até as contas TEST e os quatro secrets protegidos estarem disponíveis.
