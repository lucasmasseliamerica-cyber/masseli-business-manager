# NEXALVO — Continuidade entre conversas (QA/TEST)

## Retomada vigente — integração Git e lote operacional (20/10/2026)

Ler primeiro [QA_OPERATIONAL_INTEGRATION_20261020.md](./QA_OPERATIONAL_INTEGRATION_20261020.md).
`9b381e8` e `396afac` foram integrados por merge `50fc57b`, publicado na QA sem force push.
CI #187: **612/612 PASS**; código funcional `9f0fbca`: CI #188 **627/627 PASS**. Oito jobs PASS e
quatro grupos persistentes BLOCKED em cada execução; nunca 12/12 PASS. Último lote de código:
`441634a` (CSV seguro e bloqueio atualizado da matriz): CI #189 **629/629 PASS**, oito jobs PASS,
quatro grupos persistentes BLOCKED/ignorados; detalhes no relatório vigente.
As referências históricas abaixo a commit 9b ausente, CI #185 falha e bucket ausente estão superadas.

Correções: compra rápida usa RPC existente/unidade do insumo, custos/desconto/imposto da compra
consistentes com payload, seleções ativas, insumo com commit incerto travado, PDV valida composição/
preço/saldo antes do pagamento externo, CSV neutraliza fórmulas sem alterar números financeiros.
Patch de compras **não aplicado** nega `user_can=NULL`; sete testes reais em PostgreSQL descartável
provam guards/replay/concorrência/rollback, não homologação da RPC de compras no TEST.

A-Jornada está expressamente autorizada, mas execução real permanece BLOCKED por sessões QA locais,
acesso Windows e janela exclusiva/fixture verificadas. Não pedir senhas no chat, não usar service role,
não remover histórico ou reexecutar infraestrutura. Wrapper `qa/Invoke-QaPhotoJourney.ps1` recebe
credenciais por prompts ocultos. Nenhuma jornada de fotos executada neste ambiente.
Matriz **13/60 (21,67%)**, 15 pendentes e 32 bloqueados. Dependências: zero runtime, sete build.
B/C/D/E, migrações, deploy, contas, pagamentos e comercialização automática continuam desautorizados.

## A-Jornada de fotos autorizada — execução real BLOCKED

Infra Storage privada/quatro policies instaladas e preflight A/B PASS informados pelo usuário.
Não reaplicar migração/políticas. A autorização de fotos já foi concedida nesta tarefa.
[Relatório e executor Windows](./QA_PHOTO_A_JORNADA_20261020.md): commit 9b381e8 ausente neste
workspace e no remoto QA observado; nenhuma recriação. Fast-forward para 454500d preservado.
Correção local de upload incerto; 50/50 regressões afetadas, 8/8 browser HTTP simulado e build PASS.
Testes Storage remotos ainda 13/15 (2 asserções antigas); CI #185 FAIL, 2 jobs falhos e 10 ignorados.
Executor real guardado por source/CI, sessões A/B e janela exclusiva. Sem gravações TEST.
PowerShell nativo/Windows não validado nesta sessão. Nenhum check de jornada real promovido.
Cobertura comprovada permanece 13/60 (21,67%). Menções históricas a bucket ausente estão superadas
pela informação de implantação do usuário; jornadas reais ainda pendentes.


## Publicação e CI confirmadas — 20/10/2026

`8faade0`, `a472146` e `ea72a16` publicados e confirmados no histórico remoto QA, sem force push.
[CI #183](./QA_DELIVERY_CI_183_20261020.md): **594/594 TAP PASS, 0 FAIL, 0 SKIPPED** nos testes
executados; **8 jobs PASS, 4 jobs persistentes BLOCKED (SKIPPED pelo gate)**. Não são 12/12 PASS.
Autenticação Git/push resolvida por helper temporário seguro. Menções abaixo ao bloqueio de
publicação são históricas e estão superadas; API GitHub 403 não impediu observação HTML real.
[Próximo lote persistente preparado](./QA_OPERATIONAL_PERSISTENT_BATCH_01.md): nenhuma execução
autorizada/ativada, compras browser OFF. Checkout/comercialização automática congelados.

## P0 obrigatório — Stripe Terminal exclusivamente online (20/10/2026)

Política e contratos: [P0_STRIPE_TERMINAL_ONLINE_ONLY.md](./P0_STRIPE_TERMINAL_ONLINE_ONLY.md).
Terminal operacional é P0; site comercial, checkout Stripe e licença automática continuam congelados.
Modo Stripe explícito bloqueia cartão sem backend/leitor comprovados, sem confirmação manual ou offline.
Núcleo/reconciliação preparados e testes simulados não equivalem a leitor/pagamento TEST real.
Matriz **v2: 13/60 (21,67%)**, 15 PENDENTES e 32 BLOQUEADOS; oito critérios novos de Terminal,
nenhum promovido a verde. A v1 13/52 (25%) abaixo é histórica, substituída como cobertura vigente.
Sem deploy, migração, cobrança ou outra gravação TEST nesta entrega.
Validação local: **122/122 regressões afetadas e 5/5 browser HTTP simulado**, zero falhas/skips;
build PASS. [Evidência sanitizada](../qa/evidence/stripe-terminal-online-20261020.json).
Runner de fixtures Stripe TEST: BLOCKED, sem acesso/fixtures seguros; nenhuma chamada Stripe.

- [x] Política, bloqueio fail-closed e traduções dos seis estados preparados no código QA.
- [ ] Backend Stripe autenticado, tentativa durável/locks e commit financeiro idempotente.
- [ ] Webhook assinado/deduplicação e recuperação real após timeout/reinício.
- [ ] Leitor/simulador oficial, pagamentos Stripe TEST e todos os estados UI reais homologados.

## Prioridade vigente — operação real da Masseli, comercial congelado

Ler [QA_OPERATIONAL_P0_20261020.md](./QA_OPERATIONAL_P0_20261020.md) e a
[matriz operacional](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md).
Site comercial, checkout Stripe e ativação automática de licenças congelados; preservar o trabalho
da Administração Comercial. Trabalhar somente na branch QA e no TEST, sem deploy/migração/writes
persistentes até autorização específica.

Matriz v1: **13/52 critérios comprovados (25%)**, 14 PENDENTES, 25 BLOQUEADOS. Percentual de critérios,
não de código. Resultados reais anteriores mantidos; novos browser com HTTP simulado não homologam
o TEST. Leituras atuais: Storage privado ausente; RPCs de idempotência/equipe novas não expostas;
zero MANAGER ativo e um EMPLOYEE ativo sem vínculo. Não criar contas ou modificar claims.

Correções locais: RPC 5xx/408/JSON inválido fail-closed, paginação sem truncar financeiro,
cartão externo manual por padrão e moeda configurada, validações de compra/despesa, fuso/DST de
relatórios e PT mobile. Vite atualizado somente por patch 6.4.3 → 6.4.4; sete alertas build conhecidos,
zero runtime. Regressão local 365/365, quatro browser HTTP simulados, build PASS.

ATENÇÃO: quatro grupos CI antigos escrevem no TEST. Agora somente workflow_dispatch com autorização
explícita habilita esses grupos; push roda escopo seguro com quatro BLOCKED declarados no resumo.
Não chamar a nova CI de 12/12 homologação integral. Teste browser persistente P0.05 segue desativado.
Novo SQL de inventário operacional é somente leitura/preparado, ainda não executado no TEST.

**Retomada da publicação:** código local `8faade0`, validado em 365/365 regressões completas,
4/4 browser HTTP simulados também com Vite 6.4.4 e build PASS. Push default e helper temporário
do GitHub CLI recusados por autenticação; API GitHub Forbidden. Remoto observado: `cad6ad0`.
Nenhuma CI executada para esse código; #180 é somente baseline. Restabelecer credencial segura
com escrita de Contents/workflows e leitura de Actions, publicar a branch QA e acompanhar o
escopo seguro. Não reexecutar CI histórica com writes antes de publicar os guards novos.
Recuperação: `/workspace/nexalvo-audit/operational/nexalvo-operational.bundle`.

## Estado vigente — migração comercial aplicada; Edge ainda bloqueada

Ler [QA_PLATFORM_ADMIN_UI_RUNTIME_20261020.md](./QA_PLATFORM_ADMIN_UI_RUNTIME_20261020.md).
O usuário confirmou aplicação TEST de `20261016_platform_admin_TEST.sql`, pós-preflight **20/20**
e contratos **3/3**. Instruções históricas abaixo para aprovar/aplicar esse cutover estão superadas.
Não reaplicar migração, modificar claims ou executar rollback.

Leituras independentes confirmaram as três RPCs no OpenAPI, GET de empresas **200** (três/NONE),
auditoria **200** (zero eventos), ator inválido negado **403/42501** e um SUPERADMIN ativo com
perfil EMPLOYEE. Esses GETs usam credencial de servidor e não homologam a Edge.
CORS local **204 PASS**, origem desconhecida **403 PASS**, Edge **503 PLATFORM_NOT_CONFIGURED**.
Faltam gestão dos Secrets e sessão segura SUPERADMIN nesta execução. Não afirmar ausência do
marcador sem inventário nem alterar a allowlist que já permite a origem local.

Frontend agora mostra SUPERADMIN separado do papel na empresa; traduções comerciais PT/EN completas.
Runner novo `scripts/verify-platform-admin-readonly-test.mjs` usa uma sessão segura existente,
valida Auth/perfil e somente leituras Edge; emite agregado sem PII. O painel continua BLOCKED.
Preservar bloqueios de testes persistentes e homologação real dos demais perfis/fluxos.

Código publicado: `ef193dd`. [CI #180](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096)
confirmada **12/12 jobs, 539/539 PASS, 0 FAIL, 0 SKIPPED**, incluindo OWNER A/B e browser-smoke.
Regressões locais afetadas **109/109**, build PASS, varredura de segredos PASS. O painel SUPERADMIN
continua BLOCKED até resolver configuração Edge e comprovar leitura autenticada real.

## Reconciliação vigente — SUPERADMIN EMPLOYEE distinto do operador OWNER

Ler [QA_PLATFORM_ADMIN_DISTINCT_IDENTITIES_20261020.md](./QA_PLATFORM_ADMIN_DISTINCT_IDENTITIES_20261020.md).
O usuário confirmou preflight real anterior 11/12, falhando apenas na premissa de mesma identidade.
Preservar o SUPERADMIN EMPLOYEE já escolhido; não conceder outro claim, trocar a identidade nem
promovê-la a OWNER. O legado é outro OWNER ativo sem claim. O pacote agora valida e registra as
duas identidades separadamente e realiza a troca de autoridade em um COMMIT.

O rollback foi reconciliado para preservar o claim, retirar as novas RPCs atomicamente, restaurar
somente o operador capturado e manter o marcador privado ROLLED_BACK para auditoria. Instruções
históricas de remover o claim antes do rollback estão substituídas. Não executar o helper de claims.

O preflight revisado precisa de execução real 12/12. A integração SQL de leitura foi solicitada,
mas ainda não está callable nesta sessão. Não executar DDL no TEST antes desse resultado e de
aprovação específica do pacote final. Testes PostgreSQL descartáveis não são prova de implantação.

Código publicado: `cfad62d`. [CI #179](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39423217938)
confirmada **12/12 jobs, 525/525 PASS, 0 FAIL, 0 SKIPPED** pelo agregador real. Regressões locais
afetadas **80/80**, incluindo **16 PostgreSQL**, preflight local **12/12**, pós local **20/20**
e runtime local **3/3**. A migração final para conferência é `migrations/20261016_platform_admin_TEST.sql`,
SHA-256 `9f71e3e998d2c62e8d31aeb58423fde93d05ba9cd55f4fc42a29bd526292f944`.
Nenhuma escrita, claim, promoção tenant ou operação comercial foi executada no TEST nesta entrega.

## Estado mais recente — Administração Comercial, 2026-10-20

Ler [QA_PLATFORM_ADMIN_RUNTIME_20261020.md](./QA_PLATFORM_ADMIN_RUNTIME_20261020.md) antes dos
checkpoints históricos abaixo. Leitura real confirmou um SUPERADMIN assinado ativo com perfil ativo,
Edge respondendo, origem exata `http://127.0.0.1:5173` permitida e origem desconhecida negada.
O estado antigo de zero SUPERADMIN não é mais atual. O vínculo ao operador legado ainda exige SQL.

O runtime Edge retorna 503 `PLATFORM_NOT_CONFIGURED`. As três RPCs novas estão inacessíveis no
OpenAPI/probes GET de service_role (404 `PGRST202`); não concluir ausência física sem catálogo SQL.
Faltam acesso de gestão aos Secrets, acesso SQL e sessão SUPERADMIN nesta execução.
`scripts/configure-platform-admin-test.mjs` prepara a configuração sem sobrescrever origens;
`qa/sql/platform_admin_runtime_preflight_readonly_TEST.sql` diagnostica contratos e grants.
O helper foi executado somente em dry-run e bloqueou sem escrita. Não remover o gate, recriar
claims, executar cutover, rollback ou operações comerciais sem as autorizações específicas.

CI #175 (`39282742007`) e #177 (`39290656209`) foram consultadas e aparecem SUCCESS; essas execuções
precedem as correções de configuração desta entrega. Nenhuma contagem foi inferida de seus logs.

Correções publicadas em `8c11681ac9301d05411ee7d7c5b1ac2d410431ab`.
[CI #178](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39375881341)
confirmada SUCCESS: **12/12 jobs, 509/509 PASS, 0 FAIL, 0 SKIPPED** pelo agregado real.
Regressões locais afetadas **95/95 PASS**, build/bundle PASS e SQL descartável **4/4 PASS**.
Isso não remove os bloqueios de configuração, catálogo SQL e sessão SUPERADMIN descritos acima.

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
- `fn_write_audit` também aceitava eventos cliente sem proveniência visual nem limites. O hardening não aplicado fixa o fingerprint implantado, marca essas ações como `Client:` e limita ação/detalhes; identidade e empresa continuam derivadas da sessão no servidor. Auditorias transacionais das RPCs permanecem distinguíveis.
- Este checkpoint ainda aguardava os schemas `nexalvo_platform`/`nexalvo_backup`; o estado foi superado pelo checkpoint de 2026-10-18 abaixo. O export bruto continua fora do Git.
- Nenhuma escrita Supabase, migração, operação persistente, alteração em produção ou deploy foi executada. `dist/` está ignorado e não foi versionado.
- Retomada deste ponto histórico: consultar primeiro o checkpoint de 2026-10-18. Migrações TEST-only, compras persistentes, sessões MANAGER/EMPLOYEE, SMTP real, Storage/upload e adquirente continuam dependendo das autorizações ou integrações documentadas.

## Catálogo privado recebido — 2026-10-18

- O export privado bruto, SHA-256 `8f9e02c2a067962f35be60e0c1fae288a2ff6bb8197f1e58ab99ea4af4b0cf03`, passou varredura sem segredos/PII e não foi versionado. A evidência sanitizada cobre dois schemas, quatro tabelas, duas sequências, sete funções, quatro policies, 28 grants de tabela e 84 de coluna. Consulte [QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md](./QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md).
- O backup de empresa é OWNER-only, vincula `auth.uid()` ao `business_id`, exporta 30 tabelas tenant-scoped e limita 10 mil linhas/tabela, 50 mil no total e 20 MiB. Salários e financeiro fazem parte do backup completo; MANAGER/EMPLOYEE permanecem negados. O limite de bytes ocorre após materialização e requer ensaio de carga isolado.
- O plano administrativo implantado autoriza por `nexalvo_platform.operators` + perfil tenant ativo, sem verificar o claim assinado `SUPERADMIN` usado pelo backend novo. Não foi comprovada autoelevação, pois as tabelas privadas negam acesso direto; membership/claims reais não vieram no export. A migração nova agora recusa instalação enquanto o legado não for reconciliado.
- Foram preparados um preflight agregado de operadores sem IDs/e-mails, um preflight pré-aplicação do hardening com fingerprints e conjunto exato de policies, além do export privado ampliado com constraints/índices/colunas/default ACLs. Todos são estritamente somente leitura.
- `36e2c163`: evidência privada sanitizada, analisador, gates fail-closed e preflights publicados. [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726) terminou `SUCCESS`, com 12/12 jobs, 485/485 verificações raiz, zero falhas e zero skips.
- Execução real posterior: pre-apply `BLOCKED` em 3/10 fingerprints públicos; alinhamento encontrou um operador ativo/OWNER sem claim e nenhum SUPERADMIN assinado. O contador nulo foi corrigido com `IS DISTINCT FROM`; a migração mantém a baseline histórica e o rollback foi bloqueado até capturar e revisar os três corpos atuais. Não aplicar nenhum deles enquanto esse checkpoint permanecer aberto.
- `f34232e8`: correção, evidência real sanitizada, captura de drift e preflight de autoridade única publicados. [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977) terminou `SUCCESS`, 12/12 jobs, 487/487 PASS, zero falhas/skips.
- A captura completa das três funções comprovou corpos byte-idênticos ao histórico; somente os tipos de retorno foram qualificados por `public` sob `search_path=pg_catalog`. O baseline passou a verificar definição canônica, `prosrc` e atributos. O rollback foi regenerado com os corpos/ACLs exatos e guards pré/pós. Falta reexecutar o pre-apply reconciliado no TEST antes de solicitar aplicação.
- `ff1db15` publicou a reconciliação. A CI #170 teve falha isolada em `access-regression`; `7800ef1` serializou os seis arquivos que compartilhavam logins OWNER A/B, sem reduzir cobertura. [CI #171](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39123639069) terminou `SUCCESS`, 12/12 jobs e **488/488 PASS**, zero falhas/skips. O hardening está pronto para o pre-apply somente leitura de 15 checks, mas continua bloqueado para aplicação até esse resultado real.
- O texto antigo acima que dizia aguardar os schemas privados fica superado por este checkpoint. Permanecem bloqueados: metadados privados adicionais, alinhamento real operador/claim, aplicação autorizada do hardening, sessões SUPERADMIN/MANAGER/EMPLOYEE e toda operação persistente já listada.

## Hardening público aplicado no TEST — 2026-10-18

- O usuário executou com autorização específica `20261017_catalog_security_hardening_TEST.sql` exclusivamente no Supabase TEST `msinksoilkluooxenecy`; o Supabase retornou `success: true`. Não reaplicar a migração e não executar o rollback sem nova autorização e incompatibilidade comprovada.
- Uma verificação independente somente leitura confirmou: `employees.hourly_rate` e `sale_items.unit_cost_snapshot` sem SELECT direto; colunas operacionais preservadas; trigger `inventory_items_validate_tenant_references` ativo; `fn_write_audit` com prefixo `Client:`; nenhum EXECUTE anônimo em `public`, `nexalvo_platform` ou `nexalvo_backup`; nenhuma policy atribuída a `PUBLIC`; e policies `employees_select`/`users_select` limitadas a `authenticated`.
- O pós-preflight oficial não produziu agregado: PostgreSQL `42601` em quatro chamadas inválidas a `pg_catalog.position(... IN ...)`. O arquivo foi corrigido para `pg_catalog.strpos(text, substring)`, preservando transação `READ ONLY`, 16 checks e `ROLLBACK`. A evidência sanitizada está em `qa/evidence/catalog-hardening-apply-reported-20261018.json`.
- A regressão do parser, a suíte estática e o build passaram localmente. Ainda é obrigatório executar o pós-preflight corrigido diretamente no TEST e reter seu resultado real; os checks independentes não substituem esse agregado. Administração Comercial, produção, usuários, dados e demais migrações não foram alterados nesta entrega.
- Commit `97ee4356431e25a8186fb0d05aca7ca558c3d2b0`; [CI #172](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39124630797) `SUCCESS`: **12/12 jobs, 489/489 PASS, 0 FAIL, 0 SKIPPED**, com preflight autenticado `PASS [OK]`.

## Administração Comercial — pacote de autoridade única preparado em 2026-10-19

- O usuário confirmou o pós-preflight do hardening público em **16/16 PASS** e a CI #174 em
  **12/12 jobs, 489/489 PASS**. O hardening já aplicado não deve ser reaplicado.
- O estado real de Administração Comercial continua: um operador legado ativo/OWNER, nenhum claim
  assinado SUPERADMIN e preflight de autoridade em `BLOCKED_AUTHORITY_CUTOVER` 0/4.
- O pacote antigo foi substituído por
  [QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md).
  A nova migração exige fingerprints exatos, instala RPCs que revalidam o claim no banco e revoga
  operador/endpoints legados no mesmo `COMMIT`. Não há um estado confirmado em que os dois planos
  estejam utilizáveis.
- Suspensão agora está preparada como gate real em `current_business_id`, `user_can`, facades
  sensíveis, policies de empresa/configuração e export de backup. UPDATE tenant de `businesses`
  fica limitado às sete colunas de configuração; campos comerciais ficam server-only. A própria
  empresa do único SUPERADMIN não pode ser suspensa.
- Evidência local: **24/24** regressões focadas; aplicação em PostgreSQL 17 descartável; pós-preflight
  **20/20**; negação sintética OWNER/MANAGER/EMPLOYEE/operador legado **4/4**; rollback completo
  aprovado. Isso não equivale a implantação ou homologação real no TEST.
- Nenhum claim, operador, usuário, banco TEST ou Edge Function implantada foi alterado. Próxima
  sequência autorizável: (1) deploy Edge TEST, (2) claim na identidade do único operador, (3)
  preflight somente leitura, (4) autorização específica do cutover, (5) pós-preflight, (6)
  sessões reais e operações comerciais reversíveis com autorização separada.
