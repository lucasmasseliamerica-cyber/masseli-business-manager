# NEXALVO — finalização funcional de Estoque

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhum ajuste, perda, transferência ou outra escrita foi executada no Supabase.

## Funcionalidades entregues

- O cabeçalho de Estoque não expõe mais a avaliação financeira para usuários sem `viewFinancials`; esses usuários veem somente a quantidade de itens ativos.
- Recebimento manual, contagem física e perda rejeitam `NaN`, infinito, valores vazios e quantidades negativas também no fallback local.
- O fallback de contagem não converte silenciosamente valor negativo em zero.
- Transferências com resposta de commit incerta bloqueiam reenvio na mesma tela e exigem atualização/verificação do histórico.
- Histórico de movimentações permite filtrar por tipo e expandir além das 20 entradas mais recentes.
- Custos do histórico continuam ausentes quando `viewFinancials` está negado.

## Evidência local

- `qa/inventory-usability-regression.test.mjs`: **9/9 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

As operações autenticadas e persistentes continuam dependentes das sessões TEST e não foram simuladas como homologação real nesta entrega.
