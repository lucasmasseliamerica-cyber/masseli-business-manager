# NEXALVO — precisão de cálculos e filtros dos Relatórios

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Revisão local, sem escrita no Supabase.

## Correções entregues

- Receita e lucro agora usam vendas líquidas antes do imposto; imposto coletado é exibido e exportado separadamente, pois representa passivo fiscal e não receita da empresa.
- Linhas antigas sem `subtotal` usam fallback compatível de `total - tax`.
- Tendência, agrupamentos por canal/local/pagamento e desempenho de funcionário usam a mesma definição de receita líquida.
- Receita por produto distribui proporcionalmente o desconto da venda, evitando percentuais baseados em denominadores incompatíveis.
- “Top Customers” calcula pedidos, gasto e última compra somente dentro do período selecionado; compras anteriores e canceladas deixam de contaminar o ranking.
- Tempos médios de preparo e atendimento ignoram vendas canceladas, timestamps inválidos e durações negativas.
- O período personalizado rejeita datas vazias, impossíveis ou invertidas e mostra o intervalo sem conversão UTC que altere o dia exibido.

## Evidência local

- `qa/report-accuracy-regression.test.mjs`: **7/7 PASS**, com cenários aritméticos executados diretamente contra as funções das duas cópias da aplicação.
- Regressões afetadas de relatórios, clientes, funcionários e segurança: **35/35 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos.
- Auditoria de dependências de runtime: 0 vulnerabilidades.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

A conferência contra um fechamento contábil real e volumes históricos do TEST ainda depende de dados/aceite de homologação. Esta entrega comprova as fórmulas com fixtures determinísticas e preserva o gate `viewFinancials`.
