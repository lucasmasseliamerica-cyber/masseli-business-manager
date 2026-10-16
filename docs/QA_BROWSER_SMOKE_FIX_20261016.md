# NEXALVO — correção do browser-smoke P0.05

Data: 2026-10-16

## Diagnóstico

As execuções `38896873657`, `38897125118` e `38897385032` falharam no job `browser-smoke`. A execução `38897125118` registrou 48 testes aprovados e 3 falhas. Essa contagem é compatível com uma falha folha dentro do grupo P0.05, propagada para o grupo e para o teste-pai.

A reprodução headless controlada executou quantidade zero, custo negativo, desconto excessivo, pedido válido e rascunho válido. Todos passaram, os casos inválidos fizeram zero chamadas de criação e os dois casos válidos produziram o payload esperado em uma chamada interceptada.

O subfluxo anterior interceptava somente fornecedor e criação, mas continuava consumindo localização, item, saldo e histórico do tenant compartilhado. Um estado mutável de fixture podia, portanto, alterar um teste destinado a validar apenas o formulário.

## Correção

O browser-smoke continua fazendo login real como OWNER B. Apenas a página separada dedicada à validação do formulário P0.05 passou a interceptar todas as dependências mutáveis: fornecedor, localização, item, saldo e histórico. Cada rota confirma hostname TEST e empresa B antes de responder. As chamadas de criação continuam abortadas nos casos inválidos e simuladas nos casos válidos, portanto o teste não grava compras.

O preflight autenticado continua responsável por comprovar as fixtures e o isolamento reais antes de liberar o job. O teste persistente P0.05 permanece desativado.
