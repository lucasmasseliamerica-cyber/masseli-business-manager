# NEXALVO — Continuidade entre conversas (QA/TEST)

## Propósito
Este arquivo é o ponto de entrada para retomar o NEXALVO em uma nova conversa do ChatGPT. Não é um retrato imutável nem prova de homologação: **sempre consultar os dados atuais no GitHub**.

## Identificação e limites obrigatórios
- Repositório: `lucasmasseliamerica-cyber/masseli-business-manager`.
- Branch permitida para alterações: `automation/nexalvo-qa-actions`.
- Supabase autorizado: TEST `msinksoilkluooxenecy` exclusivamente.
- **Proibido** acessar ou modificar Supabase produção `ebhlfghbdfqgrgmtzpti`; modificar `main`; publicar deploy; executar migrações destrutivas; criar custos; expor segredos no chat ou repositório.
- Não alterar usuários reais, permissões ou dados fora do TEST; preferir verificações reversíveis e fixtures isoladas.
- Não declarar 100% homologado antes de testes completos e homologação humana.

## Fontes de verdade — ordem de leitura
1. [Issue #1 — fila P0 → P1 → P2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/issues/1): ler corpo e comentários recentes; não presumir que checkboxes estejam atualizados.
2. [Relatório P0.01](./P0_01_PERMISSIONS_20261012.md): ler versão atual na branch de QA.
3. [GitHub Actions](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions): identificar a **última execução real na branch de QA**, seu commit, jobs, logs, testes e skips. Não confundir última execução com última execução aprovada.
4. Histórico de commits da branch de QA, testes em `qa/` e workflows em `.github/workflows/`.
5. Este arquivo: protocolo e ponteiro; nunca substitui evidência atual.

## Protocolo de retomada
1. Confirmar acesso ao repositório e à branch autorizada; verificar SHA atual.
2. Ler Issue #1, comentários recentes, relatório P0.01 e evidências da última execução do Actions.
3. Produzir uma tabela: concluído e comprovado / falhou / bloqueado / não testado, com links verificáveis.
4. Selecionar a primeira tarefa P0 viável e segura; em bloqueios de credenciais ou decisões, avançar em outras verificações seguras sem simular aprovação.
5. Implementar mudanças pequenas **somente** na branch autorizada; executar verificações e regressão sem skips; registrar commit, run, resultados e pendências no relatório apropriado.
6. Para cada resultado, indicar se foi efetivamente executado nesta sessão ou apenas lido de histórico.
7. Nunca confundir testes simulados de JWT/SQL com sessões reais MANAGER/EMPLOYEE.

## Pendências estruturais conhecidas (revalidar na retomada)
- P0.1: login e autorização reais MANAGER/EMPLOYEE com segredos exclusivos de TEST.
- P0.2: convites, recuperação, expiração e revogação efetivas.
- P0.3–P0.6: jornadas completas de vendas/caixa, estoque, compras e interrupções reais de rede.
- P0.7: isolamento de arquivos/imagens multiempresa.
- P1/P2: seguir a fila da Issue #1.
- As falhas anteriores de custo negativo/desconto excessivo foram corrigidas e verificadas em Actions #96; não tratá-las como pendências atuais sem nova evidência.
- O teste positivo de pedido e rascunho pela interface usa interceptação/mock, não comprova persistência de pedido real no TEST.

## Marco histórico registrado na Issue #1 (revalidar a cada retomada)
- [GitHub Actions #105](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38497772341): 10/10 jobs concluídos com sucesso; Issue #1 registra 195/195 TAP, zero falhas e skips, Playwright 47/47.
- Commit `961168412280382d5a0a9bc01352b3701d171e1a`: cenários de formulário Ordered e Draft usando RPC simulada. Não houve pedido real persistido nesses testes.
- Próxima lacuna P0.05: ciclo real de compra persistida com compensação segura; concorrência determinística e validações P0.01/P0.02 permanecem abertas.
- Esta seção é um checkpoint histórico, **não** garantia de que #105 continue sendo a última execução. Conferir Actions e comentários atuais antes de atuar.

## Prompt curto para uma conversa nova
> Continue o NEXALVO lendo `docs/NEXALVO_HANDOFF.md` na branch `automation/nexalvo-qa-actions`, Issue #1, `docs/P0_01_PERMISSIONS_20261012.md` e a última execução do GitHub Actions. Trabalhe P0 → P1 → P2 somente na branch de QA e Supabase TEST. Respeite integralmente as restrições do handoff. Execute apenas tarefas seguras, registre commits/runs e informe bloqueios reais, sem declarar homologação prematura.

## Manutenção
Atualizar os relatórios de QA e a Issue #1 a cada unidade de trabalho. Atualizar este arquivo apenas quando mudarem o protocolo, as fontes ou os bloqueios estruturais; não gravar tokens, senhas, chaves, PII ou logs sensíveis.

## Latest published continuation — CI #116

Source `83bac13b201916a8504e44b827e369be437da3ce`, [run #116](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38674528976): Success; all ten job logs were independently recontados, **231/231 TAP**, zero falhas/skips. See [delivery](./QA_DELIVERY_CI_116.md) and [secure A/B setup/preflight](./QA_SECURE_CREDENTIALS_PREFLIGHT.md). This supersedes earlier local-only publication status. Persistent purchase browser remains OFF and requires real recovery/login, live preflight and separate explicit controlled authorization. The online Windows notebook is not connected to this Linux session; do not infer global availability from this limitation. Recheck HEAD and newest run before continuing.

## Current candidate — 2026-10-15

Read [CI #126 attempt 2 delivery](./QA_DELIVERY_CI_126_ATTEMPT2_20261015.md), [real-role preflight](./QA_REAL_ROLE_PREFLIGHT.md), [current automation delivery](./QA_AUTOMATION_CI_124_20261015.md) and [CI #121 expense replay delivery](./QA_DELIVERY_EXPENSE_REPLAY_CI_121_20261015.md). After the employee B fixture was created in TEST, CI #126 attempt 2 removed the OWNER A/B preflight blocker. Commits `edead39` and `ba4e7d4` prepared a standalone fail-closed MANAGER/EMPLOYEE preflight and a manual-only QA workflow. [CI #128](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38777105413) passed **282/282, 0 FAIL, 0 SKIPPED**, 12/12 standard jobs; the live role workflow was not dispatched. Independent live MANAGER/EMPLOYEE sessions, SMTP flows and the deployed security catalog remain open. Runtime dependencies remain at zero findings; seven build/dev findings remain tracked. Catalog execution, P0.03 SQL/proofs and persistent P0.05 require their documented access or authorization.

The [real-role account plan](./QA_REAL_ROLE_ACCOUNT_PLAN.md) now prepares a sanitized read-only deployed-schema discovery plus separate, manual TEST-only application apply/compensation scripts. The default path leaves the six historical MANAGER/EMPLOYEE profiles untouched and uses two dedicated Auth identities because their dependencies and prior state have not yet been exported. No Auth or application write has been executed. Run and review the discovery output first; Auth invitations/acceptance, application-row creation, protected Environment secrets and the manual live preflight remain separate human-authorized steps.

## Checkpoint corrente — 2026-10-16

- Branch/HEAD publicado antes deste checkpoint: `automation/nexalvo-qa-actions` em `4f824016e596e1f2d84bf9f6eed9fde02946e319`; `main` permaneceu em `9e0b8183501519ff7c1d4112d38bdec61aeb45d9`.
- CI #144 (`38899806097`): 12/12 jobs, browser-smoke 51/51, preflight e agregador aprovados.
- `91873eb`: edição, desativação e reativação de insumos; ledger/histórico preservados; duplicidades, receitas ativas e locais de transferência protegidos. Regressões focadas 47/47 e build PASS. CI #145 (`38901696232`) terminou `SUCCESS`. Veja [QA_INVENTORY_CATALOG_20261016.md](./QA_INVENTORY_CATALOG_20261016.md).
- `4f82401`: recibos cancelados identificam reversão/falha, não alegam reembolso externo e não permitem ticket de cozinha. Regressões focadas 39/39 e build PASS. CI #146 (`38901920673`) bloqueou por rede no preflight (`NETWORK_PRODUCT_OWN_B`); a reexecução integral manual CI #148 (`38919769170`) terminou `SUCCESS`.
- Nenhuma escrita Supabase, migração, operação persistente, alteração em produção ou deploy foi executada. Somente `dist/` está não rastreado localmente e não deve ser versionado.
- Retomada: verificar CI #146/12 jobs e registrar o resultado. Depois seguir a primeira lacuna segura do checklist. Migrações TEST-only, compras persistentes, catálogo implantado, sessões MANAGER/EMPLOYEE, SMTP real, Storage/upload e adquirente continuam dependendo das autorizações ou integrações documentadas.
