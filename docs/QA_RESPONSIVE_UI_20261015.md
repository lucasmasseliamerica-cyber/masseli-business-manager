# NEXALVO — rolagem, responsividade e controles compartilhados

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhum deploy ou escrita de dados foi realizado.

## Correções entregues

- Modais usam altura dinâmica do dispositivo, mantêm cabeçalho/fechar visíveis e rolam somente o conteúdo; a página de fundo fica bloqueada enquanto o modal está aberto.
- Conteúdo de modal respeita a área segura inferior em dispositivos móveis.
- `GhostButton` agora encaminha `disabled`, `type` e largura total. Antes, vários botões pareciam desabilitados, mas continuavam clicáveis.
- Inputs e selects não ultrapassam a largura disponível; o estilo adicional de `Select` deixa de ser descartado.
- Formulários de duas/ três colunas passam para uma coluna em telas estreitas; indicadores de quatro colunas passam para duas.
- Cabeçalhos empilham título e ação no celular, fazendo o botão ocupar a largura disponível.
- Sidebar desktop pode rolar em telas de pouca altura; navegação inferior e notificações respeitam safe areas.
- Textos longos quebram linha em listas e cartões; valores zero deixam de desaparecer.
- Mensagens compartilhadas de confirmação e estado vazio passam pela tradução.
- Diálogos e notificações receberam papéis ARIA básicos.

## Evidência local

- `qa/ui-responsive-regression.test.mjs`: **11/11 PASS**, 0 FAIL, 0 SKIPPED.
- Regressões afetadas dos módulos entregues nesta sequência: **77/77 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos; CSS Tailwind recompilado.
- Auditoria de dependências de runtime: 0 vulnerabilidades.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

A inspeção visual autenticada em dispositivos reais, navegação por teclado completa e leitores de tela continuam no item amplo de UX. Estes checks comprovam a estrutura responsiva e os comportamentos compartilhados, sem declarar a revisão visual final.
