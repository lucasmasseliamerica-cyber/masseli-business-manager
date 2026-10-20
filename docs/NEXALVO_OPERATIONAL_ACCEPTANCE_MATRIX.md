# NEXALVO — Matriz de aceitação operacional v1

Cobertura comprovada: **13/52 critérios (25%)**; 14 PENDENTES e 25 BLOQUEADOS.
Este percentual mede os critérios explícitos abaixo, não linhas de código, quantidade de testes ou probabilidade de o aplicativo estar pronto.
Critérios API/SQL concluídos não homologam a jornada UI correspondente. SQL com JWT simulado está identificado. CI #180 é baseline histórica; nenhuma escrita foi repetida nesta auditoria.
Site comercial, checkout Stripe e ativação automática de licença estão congelados e fora deste denominador. Administração Comercial aprovada permanece preservada.

| Módulo | Estado | Critérios comprovados | Cobertura |
| --- | --- | --- | --- |
| Vendas/PDV | BLOQUEADO | 1/4 | 25% |
| Produtos e fotos | BLOQUEADO | 0/4 | 0% |
| Estoque | BLOQUEADO | 1/4 | 25% |
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

## Critérios e evidências

### Vendas/PDV

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| RPC: venda, replay por ID e estorno com financeiro líquido zero | CONCLUÍDO | [REAL_API_CI](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096): replay-financial; registros históricos isolados da CI #180 |
| UI: venda, desconto/imposto, reconsulta após reload e cancelamento | BLOQUEADO | Autorização específica para venda TEST isolada, caixa/fixture e compensação |
| Todos os pagamentos operacionais e recibos conferidos | PENDENTE | Cartão externo implementado; validar recebimento real sem cobrança pela aplicação |
| Pagamento misto e regras de devolução homologados | PENDENTE | Decisão/implementação de split e aceite operacional das devoluções |

### Produtos e fotos

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| UI: criar, editar/desativar produto e reconsultar persistência | BLOQUEADO | Autorização de CRUD TEST isolado e compensação |
| Receita/composição e custo conferidos com baixa por local | PENDENTE | Jornada real de composição, venda e conciliação |
| Storage privado: upload/substituição/remoção e isolamento | BLOQUEADO | Bucket ausente; aprovar migração Storage e teste de objetos isolados |
| Foto real reaparece no catálogo/PDV depois do reload | BLOQUEADO | Storage configurado e autorização de upload vinculado a produto QA |

### Estoque

| Critério | Estado | Evidência ou bloqueio |
| --- | --- | --- |
| RPC: ajuste/perda/transferência e saldos sob ROLLBACK | CONCLUÍDO | [REAL_SQL_ROLLBACK](../docs/P0_04_05_SQL_LIFECYCLE_20261013.md): P0.04 executado no TEST com contexto SQL JWT simulado; não prova login ou UI |
| UI: cadastro/edição, ajuste/perda/transferência e histórico | BLOQUEADO | Autorização para movimentações isoladas e restauração dos saldos/custos |
| Contenção concorrente e estoque insuficiente em sessões reais | PENDENTE | Prova de múltiplos operadores sobre as mesmas posições |
| Reconciliação de quantidade e custo médio após ciclo completo | BLOQUEADO | Jornada real autorizada e captura dos saldos antes/depois |

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
