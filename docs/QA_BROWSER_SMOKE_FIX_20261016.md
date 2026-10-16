# NEXALVO — correção do browser-smoke P0.05

Data: 2026-10-16

## Diagnóstico

As execuções `38896873657`, `38897125118` e `38897385032` falharam no job `browser-smoke`. A execução `38897125118` registrou 48 testes aprovados e 3 falhas. Essa contagem é compatível com uma falha folha dentro do grupo P0.05, propagada para o grupo e para o teste-pai.

A reprodução headless controlada executou quantidade zero, custo negativo, desconto excessivo, pedido válido e rascunho válido. Todos passaram, os casos inválidos fizeram zero chamadas de criação e os dois casos válidos produziram o payload esperado em uma chamada interceptada.

O subfluxo anterior interceptava somente fornecedor e criação, mas continuava consumindo localização, item, saldo e histórico do tenant compartilhado. Um estado mutável de fixture podia, portanto, alterar um teste destinado a validar apenas o formulário.

## Correção

O browser-smoke continua fazendo login real como OWNER B. Apenas a página separada dedicada à validação do formulário P0.05 passou a interceptar todas as dependências mutáveis: fornecedor, localização, item, saldo e histórico. Cada rota confirma hostname TEST e empresa B antes de responder. As chamadas de criação continuam abortadas nos casos inválidos e simuladas nos casos válidos, portanto o teste não grava compras.

O preflight autenticado continua responsável por comprovar as fixtures e o isolamento reais antes de liberar o job. O teste persistente P0.05 permanece desativado.

## Continuação após CI #141

A CI #141 aprovou build, segurança e preflight autenticado, mas o `browser-smoke` continuou falhando. Isso prova que a dependência de fixtures não era a única causa. O workflow agora publica apenas os títulos TAP `not ok` como anotações sanitizadas; nenhuma variável, credencial ou payload é incluído. A próxima execução deve identificar os subtestes exatos mesmo quando o download dos logs exigir autenticação.

A primeira execução diagnóstica (#142) expôs somente o teste-pai porque os resultados TAP aninhados são indentados. O filtro foi ajustado para aceitar espaços à esquerda e publicar também o grupo e o caso folha.

A CI #143 identificou os dois casos folha reais. O teste de desconto abria o PDV com carrinho vazio e, portanto, atingia corretamente a validação anterior de produto ausente; agora adiciona uma linha válida antes de testar desconto maior que o subtotal. O teste de compra esperava a mensagem antiga `Select a supplier`, enquanto a aplicação passou a exigir explicitamente `Select an active supplier`; a asserção foi atualizada para o contrato atual. Ambas as correções mantêm a exigência de zero chamadas RPC.
