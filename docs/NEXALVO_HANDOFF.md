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

## Checkpoint corrente — 2026-10-17

- Branch/HEAD publicado antes deste checkpoint: `automation/nexalvo-qa-actions` em `4f824016e596e1f2d84bf9f6eed9fde02946e319`; `main` permaneceu em `9e0b8183501519ff7c1d4112d38bdec61aeb45d9`.
- CI #144 (`38899806097`): 12/12 jobs, browser-smoke 51/51, preflight e agregador aprovados.
- `91873eb`: edição, desativação e reativação de insumos; ledger/histórico preservados; duplicidades, receitas ativas e locais de transferência protegidos. Regressões focadas 47/47 e build PASS. CI #145 (`38901696232`) terminou `SUCCESS`. Veja [QA_INVENTORY_CATALOG_20261016.md](./QA_INVENTORY_CATALOG_20261016.md).
- `4f82401`: recibos cancelados identificam reversão/falha, não alegam reembolso externo e não permitem ticket de cozinha. Regressões focadas 39/39 e build PASS. CI #146 (`38901920673`) bloqueou por rede no preflight (`NETWORK_PRODUCT_OWN_B`); a reexecução integral manual CI #148 (`38919769170`) terminou `SUCCESS`.
- `446f1a5`: busca normalizada, categorias e estado vazio filtrado no catálogo do PDV. Regressões focadas 35/35 e build PASS. CI #149 (`38940941700`) terminou `SUCCESS`, com 12/12 jobs concluídos e nenhum job falho ou ignorado.
- `93180da`: busca normalizada e filtros de status no catálogo de fornecedores. Regressões focadas 31/31 e build PASS. CI #150 (`38941347138`) terminou `SUCCESS`, com 12/12 jobs concluídos e nenhum job falho ou ignorado.
- `d1331ab` e `f6e657b`: foco/teclado em modais e catálogos, mais validação finita de movimentação e fechamento antes dos RPCs de caixa. Regressões focadas 40/40 e 36/36; builds PASS. CI #151 (`38941725408`) terminou `SUCCESS`, com 12/12 jobs concluídos e nenhum job falho ou ignorado.
- `c8c72c0`: completou navegação por teclado em cartões, histórico de caixa, compras de clientes e tarefas. Regressões focadas 47/47 e build PASS. CI #152 (`38942054159`) terminou `SUCCESS`, com 12/12 jobs concluídos e nenhum job falho ou ignorado.
- `75ea300` e `21f776d`: dividiram o bundle (aplicação principal de 587,61 kB para 426,97 kB) e corrigiram a cobertura do workflow para `vite.config.js` e as regressões recentes de estoque, recibos e caixa. CI #153 (`38942670524`) terminou `SUCCESS`, com 12/12 jobs, zero falhas e zero ignorados.
- `4f252b0`: a Administração Comercial recebeu backend preparado: Edge Function com revalidação Auth e claim SUPERADMIN, allowlist CORS, limite de projeto, RPC transacional idempotente, concessão/revogação de licença, ativação/suspensão e auditoria em schema privado. [CI #154](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38945618369) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 431/431 PASS, zero falhas/skips. Consulte [QA_PLATFORM_ADMIN_BACKEND_20261016.md](./QA_PLATFORM_ADMIN_BACKEND_20261016.md). Nada foi aplicado ou publicado; migração, identidade SUPERADMIN real e bloqueio RLS global de empresa suspensa continuam pendentes.
- `ad5b13d`: fotos de produtos receberam integração privada preparada em código e SQL: upload validado, prévia, substituição/remoção, URL assinada curta, compensação e políticas por empresa/permissão. [CI #155](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38992693110) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 446/446 PASS, zero falhas/skips. Consulte [QA_PRODUCT_IMAGE_STORAGE_20261016.md](./QA_PRODUCT_IMAGE_STORAGE_20261016.md). O bucket/políticas não foram criados e nenhum upload real foi executado.
- `acaec47`: a raiz React recebeu recuperação acessível PT/EN, remontagem sem retry de operações e sinal local sanitizado para futura observabilidade. [CI #156](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38992980203) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 450/450 PASS, zero falhas/skips. Consulte [QA_APP_CRASH_RECOVERY_20261016.md](./QA_APP_CRASH_RECOVERY_20261016.md). Telemetria externa e alertas continuam pendentes.
- `491b9c3`: o PDV passou a preservar toda venda cujo pagamento já foi confirmado quando o salvamento falha, oferecendo retry sem nova cobrança e saída com confirmação de conciliação. [CI #157](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38993406844) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 456/456 PASS, zero falhas/skips. Consulte [QA_CONFIRMED_PAYMENT_RECOVERY_20261016.md](./QA_CONFIRMED_PAYMENT_RECOVERY_20261016.md). Stripe Terminal/webhook e cobrança real continuam pendentes.
- `364fbab`: o inventário executável agora compara 25 tabelas e 40 RPCs usados pelo app/serviços com um export TEST somente leitura, controla dependências/autorização das migrações, exige confirmação externa do project ref e preserva histórico nos novos rollbacks. A idempotência de compras deixou de depender de MD5 e compara o JSON canônico completo. O backend ausente de `manage-staff-user` foi preparado com autorização tenant, proteção de OWNER, auditoria atômica e compensação que respeita commit incerto. [CI #158](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39026778999) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 469/469 PASS, zero falhas/skips. Consulte [QA_FINAL_HOMOLOGATION_PACKAGE_20261017.md](./QA_FINAL_HOMOLOGATION_PACKAGE_20261017.md). O catálogo implantado, migrações, Edge Functions e operações reais continuam bloqueados até os gates documentados.
- `cd49a77`: o export TEST confirmou 31/31 tabelas com RLS, 53 policies, 58 funções, 48 `SECURITY DEFINER` e 568 grants. As 25 tabelas e 39 RPCs implantadas do contrato têm presença/assinaturas compatíveis, sem acesso `anon` demonstrado; `fn_manage_staff_profile` permanece preparada. O analisador foi corrigido para o envelope real, foi criado o export integral de segurança e o rollback Admin passou a preservar também request history. [CI #159](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39028110925) terminou `SUCCESS`, com 12/12 jobs, preflight autenticado PASS e agregador 470/470 PASS, zero falhas/skips. Consulte [QA_REAL_CATALOG_REVIEW_20261017.md](./QA_REAL_CATALOG_REVIEW_20261017.md).
- Segundo export integral recebido fora do Git, SHA-256 `a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f`, com zero achados na varredura de segredos/PII. A evidência sanitizada confirmou 3.547 grants de coluna, 114 índices, 196 constraints, cinco triggers, 21 policies `public`, zero EXECUTE/tabela para `anon` e zero CREATE de roles de API em `public`. Foram comprovados bypass de salário/RH, custo de `sale_items`, leitura ampla de perfis e FK de fornecedor sem tenant guard; frontend e patch TEST-only reversível foram preparados, sem aplicação. A escrita de funcionários usa `updated_at` como versão de concorrência e solicita somente `id` no retorno, preservando edição de salário sem reabrir leitura direta. **281/281 regressões estáticas**, build, bundles e runtime audit passaram localmente. Consulte [auditoria definitiva](./QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md). A CI desta entrega deve ser confirmada pelo run do commit publicado.
- A definição integral também comprovou escalonamento indireto na RPC legada `fn_save_user_profile`: um não-OWNER com `manageUsers` pode conceder overrides a outra conta. O pacote não implantado `staff-user-service` agora revoga o endpoint legado quando instala a RPC OWNER-safe e mantém rollback exato da ACL. Aplicação da migração e publicação da Edge Function continuam bloqueadas por autorização específica.
- A auditoria ainda aguarda os schemas referenciados `nexalvo_platform`/`nexalvo_backup` e os valores de `role_default_permissions`; consultas somente leitura específicas foram preparadas. O export bruto não foi versionado.
- Nenhuma escrita Supabase, migração, operação persistente, alteração em produção ou deploy foi executada. `dist/` está ignorado e não foi versionado.
- Retomada: obter e revisar o segundo export somente leitura de definições integrais antes de qualquer migração. Migrações TEST-only, compras persistentes, sessões MANAGER/EMPLOYEE, SMTP real, Storage/upload e adquirente continuam dependendo das autorizações ou integrações documentadas.
