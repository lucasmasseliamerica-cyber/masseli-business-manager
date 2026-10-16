# NEXALVO — finalização funcional de Funcionários, Ponto e Tarefas

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma conta foi criada e nenhuma escrita foi executada no Supabase.

## Funcionalidades entregues

- O formulário de funcionário valida salário finito e não negativo, local e gestor ativos, autoatribuição e ciclos na hierarquia.
- A validação deixou de depender do texto traduzido da tela; funciona com qualquer idioma.
- Salário só é renderizado no formulário com `viewFinancials`; edição de RH continua exigindo `manageUsers`.
- Funcionários são desativados com histórico preservado; erros de gravação são mostrados e o rótulo da ação agora corresponde a “Deactivate”.
- O ponto seleciona somente local ativo e trata retorno rejeitado ou falha de atualização em entrada, saída, início e fim de pausa.
- Entrada duplicada e início duplicado de pausa continuam idempotentes; saída encerra automaticamente a pausa ativa.
- Tarefas bloqueiam cliques concorrentes, exigem funcionário ativo, data/prioridade válidas, normalizam notas e mostram falhas de gravação.
- Exclusão de tarefa exige confirmação explícita.

## Evidência local

- `qa/employee-workflow-regression.test.mjs`: **9/9 PASS**, incluindo execução real em memória do ciclo entrada → pausa → saída nas duas cópias da aplicação.
- Regressões afetadas de autenticação, papéis, salários, relatórios e segurança: **43/43 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos.
- Auditoria de dependências de runtime: 0 vulnerabilidades.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

Ponto e tarefas persistentes com sessões reais MANAGER/EMPLOYEE continuam pendentes da preparação dessas identidades. Esta entrega não cria contas e não substitui essa homologação.
