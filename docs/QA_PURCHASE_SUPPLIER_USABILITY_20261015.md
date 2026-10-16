# NEXALVO — finalização funcional de Compras e Fornecedores

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma compra, migração ou escrita foi executada no Supabase.

## Funcionalidades entregues

- O formulário de pedido valida fornecedor e local ativos, método de pagamento vigente, datas coerentes, quantidades, custos, desconto e imposto antes de persistir.
- Valores digitados deixam de ser silenciosamente convertidos durante a edição; entradas vazias, infinitas ou inválidas são apresentadas e rejeitadas de forma explícita.
- Uma resposta remota com commit incerto bloqueia novo envio na mesma tela e exige atualização antes de qualquer nova tentativa.
- Usuários sem `viewFinancials` continuam podendo receber produtos, mas não veem totais nem custos unitários. Histórico e ação de pagamento continuam disponíveis somente a quem possui a permissão financeira explícita `paySuppliers`.
- O cadastro de fornecedor rejeita nome/e-mail duplicados e URL de site inválida, normaliza espaços e preserva o histórico ao desativar um fornecedor usado.
- Falhas ao desativar ou excluir fornecedor agora são tratadas na interface em vez de gerar rejeição não capturada.

## Evidência local

- `qa/purchase-supplier-usability-regression.test.mjs`: **11/11 PASS**, 0 FAIL, 0 SKIPPED.
- Regressões afetadas de compras, permissões financeiras, PDV, estoque e segurança: **48/48 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos.
- Auditoria de dependências de runtime: 0 vulnerabilidades.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

O teste persistente P0.05 permanece desativado. Criação, recebimento, pagamento e reversão reais pela interface ainda exigem a autorização específica já documentada.
