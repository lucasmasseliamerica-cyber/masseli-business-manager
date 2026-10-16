# NEXALVO — acessibilidade de teclado em modais e catálogos

Data: 2026-10-16. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma operação remota ou persistente foi executada.

## Correções

- Modais respondem à tecla `Escape` e removem o listener ao fechar.
- Ao abrir um modal, o foco vai para o botão de fechamento; ao fechar, retorna ao elemento anteriormente focado.
- Linhas compartilhadas com ação recebem papel de botão, entram na ordem de tabulação e respondem a `Enter` e `Espaço`.
- Cartões acionáveis compartilhados recebem o mesmo comportamento de teclado.
- Linhas de clientes, histórico de caixa, compras do cliente e edição de tarefas usam botões semânticos e continuam abrindo seus detalhes pelo clique.
- As buscas de clientes e fornecedores possuem nome acessível explícito para leitores de tela.

## Evidência local

- Regressões direcionadas de interface, clientes, fornecedores, caixa e segurança: **47/47 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: **PASS**, 1.578 módulos transformados.
- `App.jsx` e `src/App.jsx`: conteúdo idêntico.

Esta entrega cobre os controles compartilhados e os catálogos alterados. Uma avaliação visual e assistiva completa em desktop, tablet e dispositivos móveis continua pendente para concluir o item amplo de acessibilidade.
