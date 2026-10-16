# NEXALVO — finalização funcional de Clientes

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhum cliente ou dado do Supabase foi alterado durante a validação.

## Funcionalidades entregues

- Criação e edição usam a mesma validação para nome, telefone, e-mail e aniversário.
- Telefone aceita de 7 a 15 dígitos; e-mail malformado, data impossível e aniversário futuro são rejeitados.
- Telefone e e-mail de outro cliente ativo são bloqueados; edição do próprio registro continua permitida; nome igual sem outro contato permanece apenas como aviso para pessoas homônimas.
- Nome, telefone, e-mail, aniversário e observações são normalizados antes da persistência.
- Edição mantém o histórico associado ao mesmo ID do cliente.
- Arquivamento e restauração verificam permissão e mostram falhas de persistência na própria interface; restauração também impede reativar um contato que passou a pertencer a outro cliente ativo.
- Histórico do cliente deixa de mostrar valor e meio de pagamento sem `viewFinancials`.

## Evidência local

- `qa/customer-usability-regression.test.mjs`: **7/7 PASS**, 0 FAIL, 0 SKIPPED. A suíte executa diretamente o validador com casos válidos e inválidos nas duas cópias da aplicação.
- Regressões afetadas de Clientes, PDV, proteção financeira e segurança: **30/30 PASS**, 0 FAIL, 0 SKIPPED.
- Build Vite: PASS, 1.578 módulos.
- `App.jsx` e `src/App.jsx` permanecem idênticos.

Persistência autenticada e isolamento por perfis reais permanecem parte da homologação pendente; não foram tratados como aprovados por estes testes locais.
