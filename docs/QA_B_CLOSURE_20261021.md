# B-Jornada #1253 — conclusão por conciliação de evidências reais

**PASS por conciliação: 17/17 verificações (100% do escopo B), zero FAIL e zero BLOCKED.**
Quatorze resultados PASS foram fornecidos no campo checks da execução original no Windows; os três resultados finais vieram da recuperação autenticada somente leitura da mesma venda, informada pelo usuário. Nenhuma operação persistente foi repetida para produzir este aceite.

## Fontes e limites da comprovação

- [Evidências recebidas e sanitizadas](./evidence/sale-b-1253-reported-real-evidence-20261021.json): campo checks original preservado, resumo de recuperação e confirmações anteriores de fixture/SQL.
- [Conciliação reproduzível](./evidence/sale-b-1253-reconciliation-20261021.json): origem de cada PASS, SHA-256 do arquivo sanitizado e critérios macro promovidos.
- [Matriz operacional atualizada](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md).
- Proveniência: relatos reais e campos JSON fornecidos pelo usuário, sem observação direta desta sessão Linux. Os JSON completos e os SHAs exatos das execuções Windows não foram fornecidos; não foram inventados. A referência 032fa87 identifica o último executor validado, não atesta qual SHA foi usado no Windows.
- Não foram recebidos, lidos ou modificados o checkpoint original, senhas, tokens, URLs assinadas ou dados pessoais. O hash versionado identifica apenas as evidências sanitizadas.

## Matriz dos 17 checks

| Check | Execução original | Recuperação usada na conciliação | Resultado final |
| --- | --- | --- | --- |
| catalog — Catálogo e contratos de segurança | PASS | — | PASS |
| owner_a_b — Identidade OWNER A/B e empresas | PASS | — | PASS |
| permissions — Permissões exigidas | PASS | — | PASS |
| read_isolation — Isolamento de leitura | PASS | — | PASS |
| exclusive_fixture — Fixture exclusiva e elegibilidade | PASS | — | PASS |
| snapshot — Snapshot original | PASS | — | PASS |
| ui_totals — Totais, desconto e imposto exibidos no PDV | PASS | — | PASS |
| ui_translation — Estados de cancelamento PT/EN | PASS | — | PASS |
| same_id_replay — Replay do mesmo ID após perda da resposta | PASS | — | PASS |
| persist_reload — Persistência e reconsulta após reload | PASS | — | PASS |
| write_isolation — Negação das probes de escrita B/anônimo | PASS | — | PASS |
| stock_deduction — Baixa de estoque após a venda | PASS | — | PASS |
| single_income — Receita única da venda | PASS | — | PASS |
| ui_reversal — Cancelamento pela interface e reconsulta | PASS | — | PASS |
| history_preserved — Histórico e auditorias preservados | BLOCKED | PASS | PASS |
| stock_and_cost_restored — Quantidade e custo médio restaurados | BLOCKED | PASS | PASS |
| financial_net_zero — Receita e compensação únicas, líquido zero | BLOCKED | PASS | PASS |

O traço significa que o aceite utiliza o resultado original; não simula nem reconstrói um resultado de recuperação. UI, tradução, replay, reload, baixa, receita única, cancelamento e isolamento de escrita estão PASS porque seus campos originais foram explicitamente fornecidos. A recuperação não reexecutou a interface, o replay ou as probes de escrita.

## Estado restaurado confirmado

- recovery_status=PASS, restored=true, recovery_checkpoint_unchanged=true.
- history_preserved, stock_and_cost_restored e financial_net_zero: PASS.
- Três auditorias observadas; uma receita e uma compensação; net_cents=0.
- Confirmações anteriores: venda cancelled, USD0,49/0,49, SALE -0,25 e REVERSAL +0,25, quantidade1 e custo médio0,10 antes/depois, conforme fixture e SQL relatados.
- Nesta recuperação: sale_ids_forwarded=0 e reversal_requests_forwarded=0. Esses contadores não descrevem a execução original e não são usados para provar replay.
- Histórico da venda cancelada, itens, movimentos e auditorias continuam preservados. Não foram apagados para restaurar os saldos.

Os resultados originais continuam com o código SALE_AUDIT_NOT_CONFIRMED e os três checks finais BLOCKED. A recuperação continua com READONLY_CANCELLED_SALE_CONFIRMED_NOT_FULL_HOMOLOGATION; seu resultado isolado não virou um novo relatório REAL_SALE_JOURNEY_REVERSED. O PASS deste documento é uma avaliação separada, obtida ao conciliar as duas evidências reais.

## Percentuais e pendências

B #1253: **17/17 (100%)** no escopo restrito de um produto QA, uma venda Other de USD0,49, configuração tributária vigente, replay do mesmo ID e um estorno oficial. Não prova outros pagamentos, outras receitas/locais, operações comerciais, Manager/Employee ou Stripe.

Aplicativo: **16/60 critérios macro (26,67%)**, 15 PENDENTES e 29 BLOQUEADOS. Denominador preservado; os 17 checks B não foram adicionados como 17 novas funcionalidades.

Promovidos somente dois critérios existentes: jornada UI de vendas e reconciliação de quantidade/custo no ciclo completo B. Financeiro líquido zero, retry por ID e OWNER A/B já tinham critérios macro aprovados e receberam corroboração, sem crédito duplicado.

Continuam pendentes/bloqueados fora da B:
- Outros meios de pagamento, recibos/impressão, split e regras de devolução.
- Ajustes, perdas, transferências, concorrência de estoque e duas unidades.
- Compras persistentes, caixa/despesas, idempotência e migrações pendentes.
- Perfis reais MANAGER/EMPLOYEE e overrides; demais CRUDs, configurações, relatórios, autenticação, backup e hardware.
- Stripe Terminal exclusivamente online, sujeito à preparação e autorização próprias.
- Quatro grupos persistentes da CI continuam desativados/BLOCKED; não foram liberados por este aceite B.

Próxima prioridade: preparar o escopo C de estoque já planejado, com duas unidades/insumo QA, snapshot, compensação e verificações finais. Sua execução persistente continua dependente de pré-requisitos e autorização específica; nenhuma foi executada neste fechamento.

## Validação e entrega

Código de conciliação: **62c90fa51ad37c86151d80fc59fd5f1c578e41fe**. Avaliador offline: node qa/sale-journey-acceptance.mjs. Gerador da matriz: node qa/operational-readiness.mjs --write. Ambos leem somente evidências sanitizadas locais, sem acessar Supabase ou checkpoint.

46/46 regressões locais PASS, zero falhas/skips; build PASS. Novas regressões impedem promover UI/replay/probes usando somente recuperação, sobrescrever FAIL, aceitar outro projeto/pedido ou ignorar checkpoint alterado/ledger duplicado/contadores de mutação.

[CI #203](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39719354496):
**685/685 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes
BLOCKED/ignorados pelo gate**. [Evidência da CI](./evidence/sale-b-closure-ci-203-20261021.json).
A CI executou regressões e seus checks habituais; não repetiu a venda, estorno ou recuperação B.

Nenhum App, RPC, função SQL, migração, política, claim, produção ou main foi alterado. Não é necessário repetir venda, estorno, compensação ou recuperação para encerrar B com as evidências já fornecidas.
