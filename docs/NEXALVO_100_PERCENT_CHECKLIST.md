# NEXALVO — Checklist macro/micro para 100% de conclusão
Atualizado: 2026-10-14. Fonte: Issue #1, relatórios P0.01/P0.04/P0.05, CI #112.
Escopo de trabalho: somente `automation/nexalvo-qa-actions` e Supabase TEST `msinksoilkluooxenecy`. Não modificar produção, main ou publicar deploy.

## Regras de status
- [x] = **VERDE: concluído e comprovado** por teste/execução com evidência.
- [ ] = **PENDENTE ou BLOQUEADO**; o texto identifica o motivo. Nenhuma inferência de homologação por simples abertura de tela ou mock.
- Macro concluído somente quando **todos** os seus micros obrigatórios forem concluídos, houver regressão verde e aceite humano.
- Não confundir SQL com JWT simulado, browser com RPC mockado e browser com gravação real.

## M0 — Infraestrutura, isolamento e qualidade contínua (parcial)
- [x] Branch de QA isolada e workflow TEST configurado. [CI #112](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38504160792).
- [x] CI #112: 10/10 jobs, 197/197 TAP, 0 falhas, 0 skips, incluindo 47 Playwright smoke e 109 access regression.
- [x] Supabase TEST com duas empresas OWNER e testes de isolamento HTTP/RLS; relatório P0.01.
- [x] Scripts de estoque e compras em SQL com BEGIN/ROLLBACK executados e verificados; relatório P0.04/P0.05.
- [ ] Validação de backup restaurado em ambiente isolado e plano de recuperação.
- [ ] Aceite humano da release candidata, critérios de go/no-go e checklist de publicação (sem executar publicação automaticamente).

## M1 — P0.01 Autenticação, perfis e permissões (aberto)
- [x] Matriz SQL de 20 permissões por 4 perfis: 80/80, mais 8/8 casos especiais, sob ROLLBACK. [Relatório](./P0_01_PERMISSIONS_20261012.md).
- [x] Login real de OWNER A/B e isolamento HTTP entre empresas, incluindo operações privilegiadas rejeitadas.
- [ ] **BLOQUEADO:** contas MANAGER e EMPLOYEE com credenciais independentes e segredos TEST configurados com segurança.
- [ ] Login real e testes HTTP/RLS/RPC completos para MANAGER e EMPLOYEE.
- [ ] Playwright real para botões, páginas, restrições e operações por perfil.
- [ ] Overrides personalizados, desativação e revogação de acesso durante sessão, auditoria.

## M2 — P0.02 Convites e ciclo de autenticação (aberto)
- [x] **Diagnóstico local de recuperação:** corrigido descarte do campo `message` do Supabase; 8 regressões unitárias (duas cópias App) e 3 browser com HTTP interceptado aprovadas nesta sessão. Isso não altera senha real nem comprova e-mail/login. [Evidência e limites](./P0_02_RECOVERY_P005_GATE_20261014.md).
- [ ] **BLOQUEADO — tentativa atual OWNER QA TEST:** reproduzir recuperação com link novo e login real bem-sucedido. E-mail recebido e formulário aberto foram relatados; a tentativa terminou em erro genérico, sem status/código coletado. O marco manual histórico abaixo não homologa este incidente.
- [x] Login/logout, refresh, refresh revogado após logout, credenciais inválidas e JWT malformado.
- [x] UI rejeita links de convite/recuperação expirados simulados, sem expor token.
- [ ] Convite real por e-mail, aceitação e primeiro login de QA: houve tentativas/relatos anteriores, mas ainda falta evidência inequívoca de aprovação ponta a ponta na matriz atual.
- [x] **Recuperação de senha e troca de credencial, conforme registro de teste manual anterior (06/10):** senha antiga recusada e senha nova aceitou login no Dashboard. **Evidência histórica conversacional, não reproduzida na CI TEST #112; entrega de e-mail não confirmada por artefato independente.**
- [x] **Expiração real de JWT, conforme teste anterior de 06/10:** fora da tolerância de ~30 segundos, REST 401 `JWT expired` e Auth 403. **Evidência histórica conversacional; não integrante da CI TEST #112.**
- [ ] Revogação durante sessão ativa, comportamento multi-dispositivo e regressão autenticada no TEST.

## M3 — P0.03 Vendas, pedidos, caixa e financeiro (aberto)
- [x] RPC TEST de venda/reversão idempotente, compensação financeira e replay, com CI verde.
- [x] OWNER B impedido de vender em caixa fechado, sem efeitos financeiros.
- [ ] Jornada completa de venda real pela interface, carrinho, descontos, impostos e cliente.
- [ ] Todos os métodos de pagamento, pagamentos mistos, cancelamentos e devoluções.
- [ ] Abertura/fechamento, sangria/suprimento e conciliação de caixa pela interface.
- [ ] Concorrência determinística venda vs. fechamento e falha de rede durante commit.
- [ ] Conferência de relatórios financeiros e isolamento por perfil/empresa.

## M4 — P0.04 Estoque e movimentações (aberto)
- [x] Ajuste, perda, transferência, saldo e ledger testados via SQL reversível.
- [x] Leitura segura de estoque e transações corrigida no frontend; regressão de interface.
- [ ] Cadastro/edição de itens, ajustes, perdas e transferências completos no Playwright real.
- [ ] Estoque insuficiente, unidades, locais, duplicidade e histórico vinculado pela interface.
- [ ] Concorrência de múltiplos usuários, replay e timeout de gravações.
- [ ] Conciliação de saldos/custos médios e trilha de auditoria persistente.

## M5 — P0.05 Compras e fornecedores (aberto)
- [x] **Guard local de compensação:** fallback do teste persistente agora exige pagamentos revertidos e ledger financeiro líquido zero; cinco regressões unitárias aprovadas. **Não significa compensação executada no banco.** [Evidência](./P0_02_RECOVERY_P005_GATE_20261014.md).
- [x] SQL reversível: pedido Ordered, recebimento parcial/total, pagamento, sobre-recebimento/sobrepagamento rejeitados, reversão e cancelamento.
- [x] Leitura segura de pedidos/itens e isolamento HTTP de histórico de pagamentos.
- [x] Validações negativas no formulário de compras (quantidade zero, custo negativo, desconto excessivo).
- [x] Contrato positivo de criação Ordered/Draft na UI com RPC interceptada (MOCK — não prova persistência).
- [x] Teste Playwright persistente TEST escrito, opt-in e sintaxe verificada em CI #112 (não executado).
- [ ] **BLOQUEADO:** executar criação persistente via browser com OWNER TEST e compensação controlada; runner autorizado indisponível.
- [ ] Recebimento parcial e total real via UI, pagamento e reversão, estoque restaurado e financeiro líquido zero.
- [ ] Reversão/cancelamento em erro parcial, atraso de commit, falha de rede e repetição; confirmar audit trail.
- [ ] Corrida de recebimentos simultâneos e verificação de transições proibidas.
- [ ] Decidir/testar migração de idempotência de compras em TEST; atualmente OFF/não instalada.

## M6 — P0.06 Rede, resiliência e concorrência (aberto)
- [x] Browser offline/reconexão e sessão preservada em smoke.
- [x] Testes de replay financeiro e falha simulada após commit.
- [ ] Interrupção real no envio e na resposta durante gravações de venda, estoque e compra.
- [ ] Retry seguro após timeout, prevenção de duplicidade e recuperação consistente da UI.
- [ ] Testes de contenção simultânea de operações críticas, reconciliação e telemetria.

## M7 — P0.07 Arquivos, fotos e isolamento multiempresa (aberto)
- [ ] Upload de imagens de produtos com formato, tamanho, segurança e mensagens de erro.
- [ ] Leitura/download/remoção de arquivos autorizados; isolamento real entre empresas.
- [ ] Testar URL pública/assinada, cache, revogação, substituição e exclusão.
- [ ] Permissões de Storage e políticas RLS, incluindo tentativa de acesso cruzado.

## M8 — P1 Cadastros, operação e UX (aberto)
- [ ] Produtos: criação, edição, desativação, foto, SKU, preço, receita, custos e duplicidades.
- [ ] Clientes: ação editar, nome, telefone, e-mail, notas, validação e histórico.
- [ ] Fornecedores: edição, duplicidades, exclusão/desativação e vínculos históricos.
- [ ] Funcionários: convite, perfis, permissões, ponto, pausas e desligamento.
- [ ] Tarefas: criação, atribuição, status, conclusão, edição e permissões.
- [ ] Relatórios: totais, filtros, períodos, exportação, consistência com ledger.
- [ ] Configurações: persistência, permissões, idioma, fuso, regras e preferências.
- [ ] Responsividade desktop/tablet/mobile, acessibilidade, rolagem, estados vazios e erros.
- [ ] Performance com volumes realistas, carga, paginação e degradação.
- [ ] Backup/restauração isolados e ensaio de recuperação.

## M9 — P2 Produto SaaS, lançamento e operação (aberto)
- [ ] Onboarding de empresa, usuários, localizações e configurações iniciais.
- [ ] Planos, limites, assinatura, faturamento e inadimplência.
- [ ] Administração SaaS e observabilidade sem acesso indevido a tenants.
- [ ] Suporte, logs, incidentes, monitoramento e alertas.
- [ ] Privacidade, termos, documentação de uso e operação.
- [ ] Piloto real supervisionado, correção de feedback e aceite final.
- [ ] Revisão de segurança, backups, plano de rollback e aprovação explícita para lançamento.

## Critério para 100%
Todos os macros M0–M9 precisam estar completos, com evidências reproduzíveis, regressão sem falhas/skips, testes E2E reais, isolamento entre empresas, restauração validada e aceite humano. A CI #112 NÃO constitui homologação de 100%.

## Atualização operacional
A cada tarefa concluída: (1) verificar execução real e logs; (2) trocar somente o micro correspondente para `[x]`; (3) anexar commit/CI/SQL ou evidência; (4) atualizar a Issue #1; (5) só então marcar macro completo. Não assinalar tarefas por promessa ou mock.

## Reconciliação de evidência histórica M2 (2026-10-14)

Consulta a registros de conversas anteriores encontrou resultados de 05–06/10/2026: recuperação de senha com rejeição da antiga e acesso ao Dashboard com a nova; expiração real de JWT com HTTP 401/403 após tolerância. Essas duas tarefas passam a ter marca verde **com qualificação explícita de evidência manual histórica**, não como novos testes automatizados na CI #112. Convite real/aceitação e revogação em sessão ativa não foram comprovados nessa busca. Reexecutar na instância TEST isolada para homologação formal; não confundir a instância ou identidade histórica com as fixtures atuais sem verificar. Nenhuma alteração em autenticação ou banco foi realizada nesta reconciliação.

## Auditoria transversal de testes históricos — reconciliação de 2026-10-14

**Fontes:** registros das conversas anteriores (04–11/10), Issue #1 e relatórios/CI atuais. Esta seção impede repetir testes exploratórios já feitos, mas distingue o ambiente/escopo de cada prova. Nenhum teste foi reexecutado nesta auditoria.

### M3 — Caixa e vendas: micros históricos adicionais
- [x] **Concorrência de dois pagamentos**: relato de execução em TEST em 04/10: dois pagamentos simultâneos de $6 contra saldo $10, somente um aceito, saldo $4; estorno e fechamento sem diferença. **Não equivale** a corrida de venda versus fechamento de caixa; cenário distinto, portanto esse último continua pendente.
- [x] **Venda/caixa e estorno em transação reversível**: 11/10, venda de $10, caixa aberto com $100, pagamento Cash vinculado, cancelamento/estorno; despesa de $12,50 e estorno, todos sob ROLLBACK. Também existem testes persistentes de replay financeiro na CI.
- [x] **Navegação de 13 áreas e venda por UI**: registros de 07/10 indicam login OWNER, produto/tarefa, venda Cash, replay sem duplicidade, estorno e rejeição de quantidade zero, com seis eventos de auditoria. **Ambiente histórico não homologado como CI TEST atual**; não substituir por isso a jornada E2E integral P0.03.
- [ ] **Ainda falta** cobertura sistemática de todos os meios de pagamento, split, impostos, perfis, estados e concorrência determinística de venda vs. fechamento.

### M4 — Estoque: micros históricos adicionais
- [x] **Transferência de ida e retorno, recebimento e perda**: relatos de 07/10 em TEST; no relatório atual, ajuste/perda/transferência via SQL ROLLBACK também aprovados.
- [ ] **Ainda falta** Playwright completo de cadastro, ajuste, perda, transferência e concorrência persistente com usuários reais. O ajuste estava incompleto no checkpoint histórico de 07/10, embora SQL posterior tenha passado.

### M5 — Compras: micros históricos adicionais
- [x] **Recebimento parcial/total, pagamentos parciais e rejeição de valores excedentes**: 11/10 em testes transacionais com rollback; reforçado pelo script P0.05 TEST executado em 13/10.
- [x] **EMPLOYEE bloqueado de comprar/pagar em teste de permissão**: registro de 11/10, contexto SQL/role simulado; **não equivale** a login real EMPLOYEE.
- [ ] **Ainda falta** a jornada persistente completa pela interface e compensação automática em falha, mesmo que as regras de negócio já tenham sido validadas em SQL.

### M8 — Clientes, fornecedores, relatórios e pessoas: micros históricos adicionais
- [x] **Cliente cadastrado, editado e arquivado**: 07/10, quatro campos gravados e três eventos de auditoria, segundo registro anterior. **Teste histórico**; não afirmar que toda a suíte de validação/duplicidades/isolamento por perfil esteja completa.
- [x] **Fornecedor cadastrado, editado e excluído**: 07/10, segundo registro anterior. **Teste histórico**; cenários com histórico vinculado e restrições ainda pendentes.
- [x] **Filtros de relatórios**: 07/10, seis períodos, período personalizado e datas invertidas, segundo registro anterior. **Teste histórico**; conferência exaustiva dos totais e exportações ainda pendente.
- [x] **Restrições de salário por perfil**: 11/10, OWNER permitido e MANAGER/EMPLOYEE customizado negados, com rollback; não substitui matriz de login real e interface por perfis.
- [ ] **Ainda faltam** edição e duplicidades com todos os estados, permissões reais de MANAGER/EMPLOYEE, ponto, pausas, tarefas, filtros/exportações e testes de regressão abrangentes.

### M9 — Auditoria e recuperação: micros históricos adicionais
- [x] **Edge Function de escrita e restauração**: 06/10, HTTP 200, alteração lida e restauração confirmada; duas entradas de auditoria registradas, perfil permaneceu inativo. **Teste pontual de compensação, não restauração de backup**.
- [ ] **Ainda faltam** restauração integral de backup, teste de rollback Vercel, monitoração, onboarding, planos e aceite de piloto.

### Regra de deduplicação
Antes de criar qualquer novo teste, verificar se a mesma combinação **ambiente + usuário/role + interface/API/SQL + ação + caso + resultado** já possui evidência. Se existir, reutilizar a evidência e testar apenas a lacuna específica (por exemplo, não repetir recebimento SQL já aprovado quando falta recebimento Playwright real). Testes históricos de produção não autorizam novos acessos ou alterações na produção. Não marcar como concluído um macro com base em micros parciais.

## Continuação automatizada — integração local dos guards de autenticação

- [x] Guards previamente confirmados de papel desconhecido e refresh concorrente reintegrados ao HEAD atual da QA, junto dos testes de recuperação/compensação: **33/33 checks locais, zero falhas/skips**, build e sintaxe do runner persistente aprovados. Evidências e limites em [QA_CONTINUATION_BLOCKERS_20261014.md](./QA_CONTINUATION_BLOCKERS_20261014.md). Não representa login/recuperação reais ou nova CI.
- [ ] Recuperação real OWNER QA, autenticação/isolation com perfis independentes, grants authenticated employees/sale_items e compras persistentes continuam bloqueados por configuração segura/autorizações indicadas no relatório.
- [ ] Sete entradas npm de desenvolvimento/build persistem na nova auditoria; runtime reporta zero. Não há correção compatível oferecida pela simulação nesta execução.
