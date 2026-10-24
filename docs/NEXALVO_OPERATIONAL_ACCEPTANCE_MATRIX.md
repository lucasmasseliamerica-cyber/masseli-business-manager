# NEXALVO — Matriz de aceitação operacional v2

**C1 vigente (24/10/2026):** [executor filho e procedimento dedicado](./QA_C1_CHILD_EXECUTOR_20261024.md).
Código **4f8e908d987fced2a2dc3ddc5914b408d5a5881e**, [CI #225](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/40143125326):
**1.001/1.001 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED**.
PowerShell 5.1/7 e preflight geral autenticado PASS; [evidência](./evidence/stock-c1-child-executor-ci225-20261024.json).
Executor dedicado, reserva única local, pai imutável, intenção durável, quatro operações/seis
movimentos/quatro auditorias e recuperação sem replay preparados/testados em ambientes isolados.
**C1 real continua BLOCKED**: captura/revisão de segurança atual, preflight do filho com pai real,
janela exclusiva e nova autorização específica. Checkpoint original não acessado nesta sessão.
A recuperação já encerrada PASS não deve ser repetida; A/B e histórico preservados.
Local: 691/691 + browser 34/34, build PASS; nenhuma mutação C1 no TEST. Compras: SELECT de escala/contratos
preparado, escala atual TEST não comprovada. Nenhuma migração ou compra executada.
Macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados; nenhum critério macro promovido por CI/mocks.

**Histórico — baseline CI217 (23/10/2026):** recuperação do pai PASS e planejador puro preparados;
executor ainda não existia naquele lote. O pacote atual acima substitui esse bloqueio de código,
sem liberar gravação ou homologar a jornada real.

**Histórico C1 (23/10/2026):** [interrupção após sondagens e recuperação somente leitura](./QA_C1_STARTUP_RECOVERY_20261023.md).
Código original C1_EXECUTION_UNCONFIRMED, PROBES_CONFIRMED, zero estoque/auditoria; baseline2/2/custos0,1 informado pelo usuário.
Runtime/diagnóstico e recuperação sem promoção de ciclo corrigidos no QA; [CI #215](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39958446001): **827/827 PASS**, zero FAIL/SKIP nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED**.
**C1 permanece BLOCKED:** recuperação autenticada original e jornadas UI não comprovadas nesta sessão; nenhum novo ciclo/probe autorizado.
A/B preservadas. Macro **16/60 (26,67%)**, 15 pendentes e29 bloqueados, sem novos checks verdes.

**Histórico C1 (22/10/2026):** [leitor seguro de perdas e diagnóstico sanitizado](./QA_C1_READ_REJECTION_20261022.md) corrigidos no QA. A execução real ainda aguarda novo catálogo/preflight; nenhuma movimentação ou novo critério operacional aprovado. Macro **16/60 (26,67%)** preservada.

**Histórico da reconciliação C1 (22/10/2026):** [contrato de auditoria pós-cutover](./QA_C1_AUDIT_CONTRACT_20261022.md) preparado e testado; nenhum movimento real executado. Novo catálogo/autenticação/janela ainda necessários. Cobertura macro permanece **16/60 (26,67%)**, sem promoção de critérios.

**Histórico C1 anterior à reconciliação (22/10/2026):** patch instalado, fixture exclusiva e preflight real 5/5 foram informados pelo proprietário; a autorização C1 específica foi recebida. [Executor e evidências](./QA_C1_STOCK_20261022.md). C1 real ainda bloqueada nesta sessão por credenciais, acesso Windows e janela exclusiva; o contrato de auditoria atual exige novo catálogo somente leitura. O critério combinado de Estoque abaixo também inclui C2/perdas, que continua sem autorização. Nenhuma contagem macro foi promovida. Código C1 `9ec21c609a196a4a30e9028e02faf4a581b29962`: [CI #209](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39800164617), 760/760 PASS nos testes executados, 9 jobs PASS e 4 persistentes BLOCKED pelo gate. CI e browser simulado não comprovam C1 real.


Cobertura comprovada: **16/60 critérios (26.67%)**; 15 PENDENTES e 29 BLOQUEADOS.
Este percentual mede os critérios explícitos abaixo, não linhas de código, quantidade de testes ou probabilidade de o aplicativo estar pronto.
Critérios API/SQL concluídos não homologam a jornada UI correspondente. SQL com JWT simulado está identificado. CI #180 é baseline histórica; nenhuma escrita foi repetida nesta auditoria.
Escopo ampliado pelo requisito P0 Terminal online-only: oito novos critérios. A v1 tinha 13/52 (25%); a mudança de denominador não é regressão. Nenhum teste simulado promove estes novos critérios a concluído.
Site comercial, checkout Stripe e ativação automática de licença estão congelados e fora deste denominador. Administração Comercial aprovada permanece preservada.

| Módulo | Estado | Critérios comprovados | Cobertura |
| --- | --- | --- | --- |
| Vendas/PDV | PENDENTE | 2/4 | 50% |
| P0 Stripe Terminal exclusivamente online | BLOQUEADO | 0/8 | 0% |
| Produtos e fotos | BLOQUEADO | 1/4 | 25% |
| Estoque | BLOQUEADO | 2/4 | 50% |
| Compras e fornecedores | BLOQUEADO | 2/4 | 50% |
| Financeiro/caixa/despesas | BLOQUEADO | 1/4 | 25% |
| Clientes | BLOQUEADO | 1/4 | 25% |
| Funcionários/ponto/tarefas | BLOQUEADO | 1/4 | 25% |
| Configurações/unidades | BLOQUEADO | 0/4 | 0% |
| Permissões/multiempresa | BLOQUEADO | 2/4 | 50% |
| Autenticação | BLOQUEADO | 1/4 | 25% |
| Relatórios | BLOQUEADO | 0/4 | 0% |
| Estabilidade/rede | PENDENTE | 3/4 | 75% |
| Impressão/backup/recuperação | BLOQUEADO | 0/4 | 0% |

## B-Jornada #1253 — conciliação de evidências reais

Resultado: **PASS, 17/17 (100%)**, 0 FAIL e 0 BLOCKED.
[Fonte sanitizada informada pelo usuário](../docs/evidence/sale-b-1253-reported-real-evidence-20261021.json): 14 checks da execução original + 3 da recuperação autenticada somente leitura.
Os relatórios originais não foram reescritos. A recuperação isolada continua sem homologar UI/replay/probes; esses checks vieram explicitamente da execução original. Nenhuma operação ou checkpoint foi reexecutado/alterado para a conciliação.
O percentual B mede somente a venda QA Other de USD0,49 e seu estorno. Não representa 100% do aplicativo. Os 17 microchecks detalham os critérios macro existentes e não aumentam o denominador de 60.

| Check B | Estado | Evidência |
| --- | --- | --- |
| catalog: Catálogo e contratos de segurança | PASS | Execução original real, campo checks informado pelo usuário |
| owner_a_b: Identidade OWNER A/B e empresas | PASS | Execução original real, campo checks informado pelo usuário |
| permissions: Permissões exigidas | PASS | Execução original real, campo checks informado pelo usuário |
| read_isolation: Isolamento de leitura | PASS | Execução original real, campo checks informado pelo usuário |
| exclusive_fixture: Fixture exclusiva e elegibilidade | PASS | Execução original real, campo checks informado pelo usuário |
| snapshot: Snapshot original | PASS | Execução original real, campo checks informado pelo usuário |
| ui_totals: Totais, desconto e imposto exibidos no PDV | PASS | Execução original real, campo checks informado pelo usuário |
| ui_translation: Estados de cancelamento PT/EN | PASS | Execução original real, campo checks informado pelo usuário |
| same_id_replay: Replay do mesmo ID após perda da resposta | PASS | Execução original real, campo checks informado pelo usuário |
| persist_reload: Persistência e reconsulta após reload | PASS | Execução original real, campo checks informado pelo usuário |
| write_isolation: Negação das probes de escrita B/anônimo | PASS | Execução original real, campo checks informado pelo usuário |
| stock_deduction: Baixa de estoque após a venda | PASS | Execução original real, campo checks informado pelo usuário |
| single_income: Receita única da venda | PASS | Execução original real, campo checks informado pelo usuário |
| ui_reversal: Cancelamento pela interface e reconsulta | PASS | Execução original real, campo checks informado pelo usuário |
| history_preserved: Histórico e auditorias preservados | PASS | Recuperação real autenticada somente leitura |
| stock_and_cost_restored: Quantidade e custo médio restaurados | PASS | Recuperação real autenticada somente leitura |
| financial_net_zero: Receita e compensação únicas, líquido zero | PASS | Recuperação real autenticada somente leitura |

## Critérios e evidências

### Vendas/PDV

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| RPC: venda, replay por ID e estorno com financeiro líquido zero | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): replay-financial; registros históricos isolados da CI #180 |
| UI: venda, desconto/imposto, reconsulta após reload e cancelamento | CONCLUÍDO | [USER_CONFIRMED_JOURNEY](../docs/evidence/sale-b-1253-reported-real-evidence-20261021.json): B #1253: 14 checks originais PASS, incluindo totais, PT/EN, reload, replay e cancelamento pela UI; três invariantes finais confirmados por recuperação real somente leitura. Escopo: um item QA, Other, USD0,49 e configuração tributária vigente; não homologa todos os pagamentos |
| Todos os pagamentos operacionais e recibos conferidos | PENDENTE | Cartão externo implementado; validar recebimento real sem cobrança pela aplicação |
| Pagamento misto e regras de devolução homologados | PENDENTE | Decisão/implementação de split e aceite operacional das devoluções |

### P0 Stripe Terminal exclusivamente online

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Antes da cobrança: backend Stripe autenticado e leitor disponível, sem fallback manual | BLOQUEADO | Adapter/backend não implantado; modo Stripe bloqueia cartão; prova real Stripe TEST pendente |
| Offline desabilitado explicitamente em todas as integrações Terminal | BLOQUEADO | Inspecionar configuração real SDK/leitor; não há SDK nem fila offline implementados |
| Timeout/queda/reinício preservam tentativa desconhecida e proíbem novo PaymentIntent | BLOQUEADO | Persistência backend/locks e recuperação real autorizada ainda pendentes; núcleo simulado preparado |
| Stripe confirma e backend grava venda/estoque/financeiro uma única vez | BLOQUEADO | Preparar/revisar migração, RPC privada e integração Stripe; sem escrita ou aplicação autorizada |
| Recusa/cancelamento/reconexão conciliados no mesmo PaymentIntent | BLOQUEADO | Leitor simulado Stripe e pagamentos TEST controlados dependem de configuração e autorização |
| Webhook assinado duplicado/fora de ordem e concorrência não duplicam efeitos | BLOQUEADO | Endpoint, segredo seguro de assinatura, deduplicação persistente e testes TEST pendentes |
| PDV: seis estados PT/EN e aprovação somente após confirmação backend real | BLOQUEADO | Desconectado/bloqueio exercitados em browser simulado; demais estados reais dependem do backend |
| Wi-Fi/Ethernet/celular validados por modelo, região e firmware compatíveis | PENDENTE | Definir modelos da operação e comprovar compatibilidade; Wi-Fi sozinho não prova cobrança online |

### Produtos e fotos

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| UI: criar, editar/desativar produto e reconsultar persistência | BLOQUEADO | Autorização de CRUD TEST isolado e compensação |
| Receita/composição e custo conferidos com baixa por local | PENDENTE | Jornada real de composição, venda e conciliação |
| Storage privado: upload/substituição/remoção e isolamento | CONCLUÍDO | [USER_CONFIRMED_JOURNEY](../docs/evidence/photo-a-journey-user-confirmed-20261021.json): Usuário confirmou REAL_PHOTO_JOURNEY_RESTORED, dois uploads, isolamento A/B/anon, restauração e zero objetos residuais, com consulta SQL independente; não reexecutado nesta sessão |
| Foto real reaparece no catálogo/PDV depois do reload | BLOQUEADO | A-Jornada confirmou edição/reload de foto, mas não a exibição no PDV de produto vendável; critério combinado ainda não homologado |

### Estoque

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| RPC: ajuste/perda/transferência e saldos sob ROLLBACK | CONCLUÍDO | [REAL_SQL_ROLLBACK](../docs/P0_04_05_SQL_LIFECYCLE_20261013.md): P0.04 executado no TEST com contexto SQL JWT simulado; não prova login ou UI |
| UI: cadastro/edição, ajuste/perda/transferência e histórico | BLOQUEADO | C preparada: catálogo TEST atual, fixtures C exclusivas sem histórico, credenciais OWNER A/B seguras e autorização própria; patch de precisão e retenção de perda exigem revisão separada |
| Contenção concorrente e estoque insuficiente em sessões reais | PENDENTE | Locks de transferências opostas comprovados em PostgreSQL descartável; falta prova autenticada de múltiplos operadores no TEST |
| Reconciliação de quantidade e custo médio após ciclo completo | CONCLUÍDO | [USER_CONFIRMED_JOURNEY](../docs/evidence/sale-b-1253-reported-real-evidence-20261021.json): Ciclo B #1253: SALE -0,25 e REVERSAL +0,25, saldo1/custo0,10 restaurados, histórico preservado e checkpoint inalterado, confirmados pelo usuário com SQL e recuperação autenticada. Não homologa ajustes/perdas/transferências pela UI |

### Compras e fornecedores

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| RPC: receber parcial/total, pagar/reverter e cancelar rascunho | CONCLUÍDO | [REAL_SQL_ROLLBACK](../docs/P0_04_05_SQL_LIFECYCLE_20261013.md): P0.05 TEST sob ROLLBACK com JWT SQL simulado; não é browser persistente |
| UI: fornecedor/pedido, recebimento, pagamento e reversão | BLOQUEADO | Preflight vigente e autorização específica; compra persistente continua desativada |
| Idempotência de criação implantada e homologada | BLOQUEADO | Aprovar migração 20261012_purchase_order_idempotency_TEST.sql |
| HTTP: perda de resposta após commit de compra e compensação | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): network-after-commit histórico; não equivale à jornada UI P0.05 |

### Financeiro/caixa/despesas

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Venda/estorno produz lançamentos únicos e líquido zero | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): replay-financial histórico com leitura posterior do ledger |
| UI: abrir, movimentar, fechar e conciliar caixa | BLOQUEADO | Autorização para caixa exclusivo QA e restauração/fechamento |
| Despesa Cash e valores especiais protegidos no backend | BLOQUEADO | Aprovar finite_guard e expense_cash_normalization; validar pré/pós e compensação |
| Despesa idempotente resiste a timeout e reenvio | BLOQUEADO | Aprovar expense_idempotency; flag continua OFF |

### Clientes

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| UI: criar/editar contatos e notas, reload e arquivamento | BLOQUEADO | Autorização de CRUD QA; browser HTTP simulado não prova banco TEST |
| Duplicidades e validação de dados no fluxo real | PENDENTE | Validar concorrência/duplicidades e persistência com usuários QA |
| Histórico/fidelidade e estorno de pontos reconciliados | PENDENTE | Jornada real com cliente e operação financeira autorizada |
| Leitura de clientes isolada entre empresas OWNER A/B | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): access-regression/p0-isolation-matrix inclui customers |

### Funcionários/ponto/tarefas

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Salários sem SELECT direto após hardening público | CONCLUÍDO | [USER_CONFIRMED_SQL](../docs/NEXALVO_100_PERCENT_CHECKLIST.md): Pós-preflight público real 16/16 confirmado; teste por perfil real ainda separado |
| Sessões MANAGER/EMPLOYEE independentes e vínculos ativos | BLOQUEADO | Inventário atual: zero MANAGER ativo; um EMPLOYEE ativo sem employee_id |
| Gestão segura de perfis e permissões sem escalonamento | BLOQUEADO | Aprovar staff-user-service preparado; RPC nova não exposta no TEST |
| UI: funcionário, ponto/pausa e tarefa persistidos/reconsultados | BLOQUEADO | Perfis/vínculos prontos e autorização de dados QA isolados |

### Configurações/unidades

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Salvar dados/listas da empresa e conferir após reload | BLOQUEADO | Autorização e snapshot de configuração com compensação exata |
| Operação e saldos em duas unidades da mesma empresa | BLOQUEADO | Fixtures de duas unidades e jornada de movimento autorizada |
| Moeda/fuso/impostos aplicados a todos os módulos | PENDENTE | Integração real e datas de fronteira; código de moeda do cartão corrigido |
| PT/EN e preferências de impressão em uso operacional | PENDENTE | Revisão de todas as telas e impressora; mobile PDV validado com HTTP simulado |

### Permissões/multiempresa

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| OWNER A/B: identidade, fixtures e isolamento HTTP | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): authenticated-preflight e access-regression completos |
| Hardening público: colunas sensíveis/RLS e EXECUTE anon | CONCLUÍDO | [USER_CONFIRMED_SQL](../docs/NEXALVO_100_PERCENT_CHECKLIST.md): Pós-preflight real 16/16; não comprova toda a matriz de perfis |
| Matriz real OWNER/MANAGER/EMPLOYEE em UI/API/RPC | BLOQUEADO | Sessões independentes e vínculos QA ainda indisponíveis |
| Overrides e revogação sem escalonamento por manageUsers | BLOQUEADO | Aplicar substituição OWNER-safe preparada e homologar perfis reais |

### Autenticação

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| OWNER: login/logout, refresh e rejeição de sessão revogada | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): auth-lifecycle e browser-smoke reais OWNER A/B |
| Recuperação real: e-mail, nova senha e login posterior | BLOQUEADO | Acesso ao fluxo de e-mail/sessão QA existente e autorização de troca controlada |
| Convite real e primeiro login de identidade existente | BLOQUEADO | Decisão/ação autorizada de convite; não criar contas/e-mails nesta fase |
| Revogação durante sessão e múltiplos dispositivos | PENDENTE | Jornada real de duas sessões; preservar outras identidades QA |

### Relatórios

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Histórico completo além de 500 registros sem totais parciais | PENDENTE | Paginação e teto explícito corrigidos; homologar volume real isolado |
| Receita/custos/despesas/caixa conciliados com ledger real | BLOQUEADO | Jornada financeira QA autorizada e critérios de período/estorno |
| Filtros/exportações respeitam perfis e salários/custos | BLOQUEADO | MANAGER/EMPLOYEE reais e conjunto de dados representativo |
| Fuso, intervalos e comparação anterior conferidos na UI | PENDENTE | Cenários de virada de dia/mês com fuso da empresa distinto do navegador |

### Estabilidade/rede

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Browser OWNER: offline/reconexão preserva sessão e restaura tela | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): browser-smoke histórico com usuário TEST real |
| 502/504/408/JSON truncado não duplicam operações reais | PENDENTE | Regressão e latch corrigidos; falta fault injection real autorizada |
| Retry de venda mantém ID e não duplica lançamentos | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): replay-financial e network-after-commit históricos |
| Duas empresas sobrepostas no PostgreSQL preservam isolamento | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): two-tenant-concurrency histórico com confirmação de sobreposição |

### Impressão/backup/recuperação

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| Recibo fiel e impressão/exportação no navegador operacional | PENDENTE | Documento/adapter exercitados no browser isolado; validar registro TEST real |
| Impressora física da operação e segunda via | BLOQUEADO | Hardware/driver e aceite da impressão na Masseli |
| Backup restaurado integralmente em ambiente isolado | BLOQUEADO | Acesso seguro ao export e autorização de destino descartável; sem produção |
| Recuperação de falha/monitoramento e plano de contingência | PENDENTE | Error Boundary existe; falta ensaio operacional e monitoramento de incidentes |

Gerar novamente: `node qa/operational-readiness.mjs --write`. Nenhuma consulta ou escrita no Supabase é executada por esse comando.
