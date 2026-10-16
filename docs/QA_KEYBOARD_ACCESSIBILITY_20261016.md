# NEXALVO — acessibilidade de teclado em modais e catálogos

Data: 2026-10-16. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma operação remota ou persistente foi executada.

## Correções

- Modais respondem à tecla `Escape` e removem o listener ao fechar.
- Ao abrir um modal, o foco vai para o botão de fechamento; ao fechar, retorna ao elemento anteriormente focado.
- Linhas compartilhadas com ação recebem papel de botão, entram na ordem de tabulação e respondem a `Enter` e `Espaço`.
- As linhas do catálogo de clientes usam botão semântico e continuam abrindo o detalhe pelo clique.
- As buscas de clientes e fornecedores possuem nome acessível explícito para leitores de tela.

## Evidência local

- `qa/ui-responsive-regression.test.mjs`, `qa/customer-usability-regression.test.mjs`, `qa/purchase-supplier-usability-regression.test.mjs` e `qa/security.test.mjs`: **40/40 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: **PASS**, 1.578 módulos transformados.
- `App.jsx` e `src/App.jsx`: conteúdo idêntico.

Esta entrega cobre os controles compartilhados e os catálogos alterados. Uma avaliação visual e assistiva completa em desktop, tablet e dispositivos móveis continua pendente para concluir o item amplo de acessibilidade.
