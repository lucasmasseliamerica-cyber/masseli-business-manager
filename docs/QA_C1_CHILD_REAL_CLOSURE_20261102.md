# C1 — ciclo real do executor filho concluído (02/11/2026)

**PASS real: 18/18 checks e 8/8 gates.** Código `C1_CHILD_REAL_UI_CYCLE_RESTORED`, saída **0**.
O relatório sanitizado foi lido diretamente do notebook; as capturas enviadas pelo proprietário
corroboram os checks, gates e reconciliação. Não se trata de resultado CI ou browser interceptado.

[Evidência sanitizada completa e proveniência](./evidence/stock-c1-child-real-pass-20261102.json).

## Ambiente, autorização e janela

- Branch exclusiva: `automation/nexalvo-qa-actions`; Supabase TEST `msinksoilkluooxenecy`.
- Fonte executada: `c87125e09616f5166a33dbdf4de81221ef3e3716`; código validado `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`.
- Autorização condicional registrada anteriormente; proprietário confirmou nova janela exclusiva
  e disponibilidade no notebook em 02/11. Referência observada às 20:07:11 UTC (15:07:11 America/New_York).
- Prazo externo máximo: 20:27:11 UTC. Launcher usou 19 minutos incluindo campos ocultos, com início
  limitado até 20:08:11 UTC, para permanecer dentro dos 20 minutos confirmados.
- Um único launcher filho foi iniciado nesta janela. O launcher C1 normal não foi usado.
- Autenticação QA existente preenchida localmente em campos ocultos; nenhum segredo versionado.
- Digest revisado: `0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825`.
- Relatório salvo às **20:09:52.3884897 UTC / 15:09:52 America/New_York**, dentro da janela.

## Verificações por critério

| Check | Resultado |
| --- | --- |
| catalog — Catálogo e contratos | PASS |
| owner_a_b — Identidades OWNER A/B | PASS |
| permissions — Permissões | PASS |
| read_isolation — Isolamento de leitura | PASS |
| exclusive_fixture — Fixture exclusiva | PASS |
| exclusive_window — Janela exclusiva | PASS |
| snapshot — Snapshot | PASS |
| write_isolation — Isolamento de escrita — recibos históricos e revisão atual, sem replay | PASS |
| ui_adjustment — Ajuste pela interface | PASS |
| ui_transfer — Transferência pela interface | PASS |
| ui_reverse_transfer — Transferência inversa pela interface | PASS |
| persist_reload — Persistência após reload | PASS |
| ui_history — Histórico pela interface | PASS |
| unique_movements — Movimentos únicos | PASS |
| audit_history — Histórico de auditoria | PASS |
| stock_restored — Quantidade restaurada | PASS |
| cost_restored — Custo médio restaurado | PASS |
| checkpoint_integrity — Integridade dos checkpoints | PASS |

O PASS de write_isolation utiliza os dois recibos históricos de sondagens negadas do pai
e a revisão atual de segurança. Não foram repetidas sondagens de escrita.

## Oito gates

| Gate | Resultado |
| --- | --- |
| parent_integrity | PASS |
| identity_permissions | PASS |
| current_security | PASS |
| unchanged_baseline | PASS |
| exclusive_window | PASS |
| single_child_reservation | PASS |
| durable_intents | PASS |
| specific_authorization | PASS |

## Orçamento e reconciliação reais

| Medida | Observado |
| --- | --- |
| RPCs de estoque encaminhadas | 4 |
| RPCs de auditoria encaminhadas | 4 |
| Novas sondagens encaminhadas | 0 |
| Movimentos reconciliados | 6 |
| Auditorias acrescentadas | 4 |
| Histórico apagado / fixtures criadas | 0 / 0 |
| Etapa final | 4 |
| Posição 1: quantidade antes/depois | 2,000 / 2,000 |
| Posição 2: quantidade antes/depois | 2,000 / 2,000 |
| Ambas as posições: custo médio antes/depois | 0,1000 / 0,1000 |

O ciclo autorizado foi ajuste SOURCE +0,125; transferência SOURCE→TARGET 0,500;
transferência inversa 0,500; ajuste SOURCE −0,125.
Os dois passos finais são parte do ciclo previsto, não compensação automática após falha.
stock_restored=true, cost_restored=true, restored=true, parent_checkpoint_unchanged=true.

## Preservação e fingerprints

Leitura local posterior ao encerramento confirmou exatamente um pai com o SHA-256 original
confiável e duas entradas no registro privado: reserva e checkpoint filho.
O hash do filho foi recalculado e coincidiu com o relatório.

- SHA-256 do relatório salvo:
  `509128797db5c3b4b9980787a8232b8ba32ec0923dde7875a29149091d127ce2`.
- SHA-256 do filho:
  `e9cb9e3f4b46b6b996a98d4cdd02be15de06d57a1e4ff20c330d3151c2ce5b88`.
- Saída do processo: 0; resume_allowed=false.
- Checkpoints originais, reserva e exports permanecem privados no notebook, fora do Git.

**A reserva está consumida.** O campo reservation_available=true no relatório não libera novo
filho ou nova execução: a inspeção final encontrou reserva e filho persistidos.
Não apagar, mover, editar, substituir ou alterar permissões para obter outra execução.
Não repetir este ciclo, o preflight aprovado ou a recuperação histórica para gerar mais evidências.

## Alcance da aprovação e matriz

full_homologation=true refere-se somente ao escopo C1 deste executor.
Não representa homologação integral do estoque, aplicativo ou SaaS.

A matriz mantém **16/60 (26,67%)**, 15 pendentes e 29 bloqueados; estoque permanece 2/4.
O critério amplo de interface inclui cadastro/edição e perdas além de ajustes/transferências.
C1 aprova a parte de ajustes, ida/retorno, reload, histórico e reconciliação; C2/perdas e CRUD
continuam sem homologação integral. A reconciliação quantitativa/de custo já possuía aprovação
pelo ciclo B e agora recebe corroboração C1, sem crédito duplicado.
Concorrência com múltiplos operadores reais, estoque insuficiente, compras, financeiro e Stripe
não foram testados por este ciclo. Nenhuma alteração em produção/main ou migração.

## Continuidade segura

C1 encerrada: preservar o estado final e os artefatos. Próxima pendência de estoque:
preparar C2/perdas com decisão explícita sobre histórico residual, fixture elegível e orçamento
próprio. A autorização C1 e sua janela não se estendem a C2, compras, financeiro ou migrações.
Análises de código e planejamento somente leitura podem continuar sem repetir C1.
