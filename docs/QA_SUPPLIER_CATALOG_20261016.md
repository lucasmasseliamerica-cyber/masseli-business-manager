# NEXALVO — busca e filtros do catálogo de fornecedores

Data: 2026-10-16. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma escrita no Supabase, migração, compra persistente ou alteração de produção foi executada.

## Entrega

- O catálogo de fornecedores abre mostrando fornecedores ativos, sem misturar registros desativados na operação cotidiana.
- O usuário pode alternar entre ativos, inativos e todos os fornecedores.
- A busca cobre nome, contato, telefone, e-mail e produtos fornecidos.
- A comparação normaliza maiúsculas e acentos; por exemplo, uma consulta sem acento encontra o mesmo texto cadastrado com acento.
- Um resultado vazio diferencia a ausência de cadastros da ausência de correspondência para os filtros atuais.
- As permissões já existentes para criar, editar, consultar dados financeiros e preservar histórico não foram alteradas.

## Evidência local

- `qa/purchase-supplier-usability-regression.test.mjs`, `qa/ui-responsive-regression.test.mjs` e `qa/security.test.mjs`: **31/31 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: **PASS**, 1.578 módulos transformados.
- `App.jsx` e `src/App.jsx`: conteúdo idêntico validado pela regressão.

Esta evidência cobre o comportamento local e as regressões estáticas afetadas. Persistência autenticada, perfis reais MANAGER/EMPLOYEE e a jornada persistente P0.05 continuam sujeitos aos gates já documentados.
