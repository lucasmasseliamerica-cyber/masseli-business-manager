# NEXALVO — Checklist macro/micro para 100% de conclusão
Atualizado: 2026-10-18. Fonte: Issue #1, relatórios P0.01/P0.04/P0.05, CI #116, CI #118, CI #121–#126, [CI #126 tentativa 2](./QA_DELIVERY_CI_126_ATTEMPT2_20261015.md), CI #159, [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726), [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977), [auditoria definitiva do catálogo público](./QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md) e [auditoria privada](./QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md).
Escopo de trabalho: somente `automation/nexalvo-qa-actions` e Supabase TEST `msinksoilkluooxenecy`. Não modificar produção, main ou publicar deploy.

## Regras de status
- [x] = **VERDE: concluído e comprovado** por teste/execução com evidência.
- [ ] = **PENDENTE ou BLOQUEADO**; o texto identifica o motivo. Nenhuma inferência de homologação por simples abertura de tela ou mock.
- Macro concluído somente quando **todos** os seus micros obrigatórios forem concluídos, houver regressão verde e aceite humano.
- Não confundir SQL com JWT simulado, browser com RPC mockado e browser com gravação real.

## M0 — Infraestrutura, isolamento e qualidade contínua (parcial)
- [x] Branch de QA isolada e workflow TEST configurado. Última baseline integral: [CI #159](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39028110925).
- [x] CI #159: 12/12 jobs, 470/470 TAP, 0 falhas, 0 skips; preflight OWNER A/B e todos os produtores autenticados aprovados.
- [x] Pacote integrado de homologação preparado: manifesto com hashes/dependências, comparação de catálogo somente leitura, confirmação externa obrigatória do TEST, runner Windows sem escrita, backend versionado de gestão de equipe e rollbacks que preservam histórico. **274/274 regressões estáticas**, build e auditoria runtime aprovados localmente; CI #158 integralmente verde. [Evidência](./QA_FINAL_HOMOLOGATION_PACKAGE_20261017.md).
- [x] Primeiro catálogo real TEST revisado: 31/31 tabelas com RLS, 53 policies, 58 funções, 48 `SECURITY DEFINER`, 568 grants; 25/25 tabelas do contrato e 39 RPCs implantadas têm presença/assinaturas compatíveis, sem acesso `anon` demonstrado. CI #159 aprovou 470/470. [Evidência](./QA_REAL_CATALOG_REVIEW_20261017.md).
- [x] Segundo export público sanitizado e revisado: 58/58 corpos, 53/53 policies, 568 grants de tabela, 3.547 de coluna, 114 índices, 196 constraints e cinco triggers. O original passou varredura de segredos e não foi versionado. [Evidência](./QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md).
- [x] Export privado sanitizado e revisado: dois schemas, quatro tabelas privadas com RLS/negação direta, duas sequências, sete funções (seis definers), cinco wrappers compatíveis, zero acesso `anon` e zero leitura/escrita direta de `authenticated`. O gate OWNER/tenant do backup e os locks de provisionamento foram confirmados. [Evidência](./QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md).
- [x] [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726): 12/12 jobs e 485/485 verificações raiz aprovadas, zero falhas/skips, incluindo preflight autenticado, regressões de catálogo privado e browser smoke.
- [ ] **BLOQUEADO:** o plano implantado usa `nexalvo_platform.operators`, enquanto o backend novo usa claim Auth assinado `SUPERADMIN`. Executar o preflight agregado de alinhamento e decidir migração/retirada antes de instalar Administração Comercial; a migração preparada agora recusa coexistência silenciosa.
- [ ] **PREFLIGHT REAL BLOCKED (7/10):** os fingerprints de `fn_read_employees_secure`, `fn_read_sale_items_secure` e `fn_write_audit` divergiram do catálogo histórico. A captura dos corpos atuais é somente leitura; migração e rollback continuam bloqueados até comparação semântica e regeneração pela mesma baseline.
- [x] Bug do contador administrativo corrigido: claim ausente/JSON `null` agora conta como operador sem `SUPERADMIN`. O resultado real correto é 1 operador ativo sem claim e `authority_models_aligned=false`; há regressões específicas para os dois casos nulos.
- [x] [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977): 12/12 jobs, 487/487 verificações raiz, zero falhas/skips; preflight autenticado e browser smoke aprovados no commit `f34232e8`.
- [ ] **PROVA ADICIONAL:** reexecutar o export privado ampliado para colunas, constraints, índices, grants de uso e default privileges; a versão recebida não continha esses metadados. Reter também fingerprint da matriz global atual.
- [ ] **PREPARADO, NÃO APLICADO:** hardening TEST-only corrige leitura direta de salários/RH e custo de `sale_items`, escopo de perfis, referência fornecedor-item entre empresas, policies `public`, grants de triggers e default EXECUTE. Preflight pré-aplicação fixa cinco fingerprints e as 21 policies. O rollback histórico teve os corpos originais comparados por hash, mas agora falha fechado até ser regenerado com a baseline atual. Exige reconciliação, autorização específica, preflight pós-aplicação e MANAGER/EMPLOYEE reais.
- [ ] **ALTA, CORREÇÃO PREPARADA:** `fn_save_user_profile` implantada permite escalonamento indireto de overrides entre duas contas não-OWNER com `manageUsers`. O pacote `staff-user-service` agora fixa o fingerprint legado, instala a substituição OWNER-safe e revoga o EXECUTE autenticado legado. Migração + Edge Function ainda exigem autorização e homologação real no TEST.
- [ ] **MÉDIA, CORREÇÃO PREPARADA:** `fn_write_audit` aceita ação/detalhes arbitrários do cliente sem distinguir essas entradas de auditorias transacionais. O hardening passa a marcar `Client:`, limitar tamanho e manter identidade/tenant server-side. Exige aplicação e preflight no TEST.
- [x] Supabase TEST com duas empresas OWNER e testes de isolamento HTTP/RLS; relatório P0.01.
- [x] Scripts de estoque e compras em SQL com BEGIN/ROLLBACK executados e verificados; relatório P0.04/P0.05.
- [x] Gate de dependências publicado: runtime exige zero alertas moderados ou superiores; auditoria completa falha para pacote/advisory novo, severidade crítica ou aumento sobre o teto conhecido. CI #124 aprovou o gate.
- [ ] Sete alertas de build/desenvolvimento permanecem (5 altos, 2 moderados); migração Tailwind 4 e regressão visual continuam pendentes, sem `npm audit fix --force`.
- [ ] Validação de backup restaurado em ambiente isolado e plano de recuperação.
- [ ] Aceite humano da release candidata, critérios de go/no-go e checklist de publicação (sem executar publicação automaticamente).

## M1 — P0.01 Autenticação, perfis e permissões (aberto)
- [x] Matriz SQL de 20 permissões por 4 perfis: 80/80, mais 8/8 casos especiais, sob ROLLBACK. [Relatório](./P0_01_PERMISSIONS_20261012.md).
- [x] Login real de OWNER A/B e isolamento HTTP entre empresas, incluindo operações privilegiadas rejeitadas.
- [x] Preflight OWNER A/B completo após fixture Employee B: employees e sale_items por facade/SELECT direto, negação cruzada, estoque e isolamento de compra. CI #126 tentativa 2.
- [ ] **BLOQUEADO:** contas MANAGER e EMPLOYEE com credenciais independentes e segredos TEST configurados com segurança.
- [ ] Login real e testes HTTP/RLS/RPC completos para MANAGER e EMPLOYEE.
- [ ] Playwright real para botões, páginas, restrições e operações por perfil.
- [ ] Overrides personalizados, desativação e revogação de acesso durante sessão, auditoria.
- [x] Runner somente leitura MANAGER/EMPLOYEE e sete regressões fail-closed preparados em `edead39`; [CI #127](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38776559766) aprovou os guards. [Procedimento](./QA_REAL_ROLE_PREFLIGHT.md).
- [x] Workflow manual de perfis restrito à branch QA e Environment TEST publicado em `ba4e7d4`; oitavo guard e [CI #128](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38777105413) aprovados. A execução live não foi disparada.
- [x] Plano TEST-only para duas identidades independentes e dois vínculos ativos preparado com descoberta somente leitura, aplicação idempotente, auditoria e compensação exata; cinco regressões locais aprovadas. [Procedimento](./QA_REAL_ROLE_ACCOUNT_PLAN.md). Nenhum SQL, convite ou alteração de senha foi executado.
- [ ] **BLOQUEADO:** o primeiro catálogo confirmou estrutura/RPCs gerais, mas a descoberta específica de Auth, vínculos, constraints e dependências MANAGER/EMPLOYEE ainda precisa ser executada e revisada antes de qualquer vínculo. Nenhuma identidade ou linha foi alterada.
- [ ] **BLOQUEADO:** execução real do runner de perfis depende das duas contas TEST ativas, ligadas a employees distintos da empresa A, e quatro segredos armazenados no GitHub Environment. O runner live continua fora da CI padrão.

## M2 — P0.02 Convites e ciclo de autenticação (aberto)
- [x] **Diagnóstico local de recuperação:** mensagens/status/códigos sanitizados, destino restrito ao TEST, chave pública validada, resposta 2xx verificada e sessão normal anterior removida após sucesso. **14/14 regressões unitárias e 4/4 browser com HTTP interceptado** aprovadas; isso não altera senha real nem comprova e-mail/login. [Evidência corrente](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [ ] **BLOQUEADO — tentativa atual OWNER QA TEST:** reproduzir recuperação com link novo e login real bem-sucedido. E-mail recebido e formulário aberto foram relatados; a tentativa terminou em erro genérico, sem status/código coletado. O marco manual histórico abaixo não homologa este incidente.
- [x] Login/logout, refresh, refresh revogado após logout, credenciais inválidas e JWT malformado.
- [x] UI rejeita links de convite/recuperação expirados simulados, sem expor token.
- [ ] Convite real por e-mail, aceitação e primeiro login de QA: houve tentativas/relatos anteriores, mas ainda falta evidência inequívoca de aprovação ponta a ponta na matriz atual.
- [x] **Recuperação de senha e troca de credencial, conforme registro de teste manual anterior (06/10):** senha antiga recusada e senha nova aceitou login no Dashboard. **Evidência histórica conversacional, ainda não reproduzida na matriz QA atual; entrega de e-mail não confirmada por artefato independente.**
- [x] **Expiração real de JWT, conforme teste anterior de 06/10:** fora da tolerância de ~30 segundos, REST 401 `JWT expired` e Auth 403. **Evidência histórica conversacional; não equivale à homologação da matriz atual.**
- [ ] Revogação durante sessão ativa, comportamento multi-dispositivo e regressão autenticada no TEST.

## M3 — P0.03 Vendas, pedidos, caixa e financeiro (aberto)
- [x] RPC TEST de venda/reversão idempotente, compensação financeira e replay, com CI verde.
- [x] OWNER B impedido de vender em caixa fechado, sem efeitos financeiros.
- [x] **Correção preparada e revisão estática de despesa Cash:** normalização do meio de pagamento, lock do caixa, isolamento antes de mutações, saldo por tipo contábil, rejeição de valores/saldos especiais e audit log atômico; 6/6 regressões locais. O artefato é TEST-only e **não foi aplicado**. [Relatório](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [ ] **BLOQUEADO:** executar a prova SQL `BEGIN/ROLLBACK` somente depois de autorização para aplicar a correção no TEST; confirmar também a fórmula implantada de fechamento/reversão e os grants efetivos.
- [ ] **PREPARADO, AINDA NÃO HOMOLOGADO:** wrapper `fn_create_expense_idempotent`, chave empresa/request ID, payload completo, frontend opt-in e provas rollback foram publicados em `6ab4f48`. Migração não aplicada, flag desligada e replay/concorrência reais no TEST pendentes; o RPC implantado continua sem essa garantia.
- [ ] Jornada completa de venda real pela interface, carrinho, descontos, impostos e cliente.
- [x] PDV utilizável aprimorado: cartões visuais com inclusão rápida e quantidade, fotos HTTPS com fallback, validação finita de descontos/impostos, seletores ativos e recuperação de falha do adaptador de cartão. **37/37 regressões afetadas** e build local aprovados. [Evidência](./QA_POS_USABILITY_20261015.md). Upload para Storage e venda persistente real continuam pendentes.
- [x] Catálogo rápido do PDV possui busca por nome/SKU/categoria sem sensibilidade a acentos, filtro combinável e limpeza de estado vazio. **35/35 regressões afetadas** e build local aprovados. [Evidência](./QA_POS_USABILITY_20261015.md). A jornada persistente permanece pendente.
- [x] Recibos históricos de vendas canceladas identificam reversão/falha e seu horário; comprovante de cartão não afirma reembolso do processador, e ticket de cozinha permanece bloqueado após cancelamento. **39/39 regressões afetadas** e build local aprovados. [Evidência](./QA_SALES_RECEIPTS_20261016.md). Integração real com adquirente e impressão física continuam pendentes.
- [x] Movimentos e fechamento de caixa validam tipo, motivo e valores finitos antes de qualquer RPC; entradas inválidas comprovadamente fazem zero chamadas remotas e a prévia não apresenta infinitos. **36/36 regressões afetadas** e build local aprovados. [Evidência](./QA_CASH_REGISTER_FINITE_VALIDATION_20261016.md). A jornada persistente e o SQL implantado permanecem pendentes.
- [x] Falha ao salvar depois de qualquer pagamento confirmado preserva a mesma venda para retry exclusivo do salvamento, alerta antes de sair e exige confirmação para descartar a recuperação; o pagamento não é executado novamente. [Evidência](./QA_CONFIRMED_PAYMENT_RECOVERY_20261016.md). Adquirente real e recuperação por webhook continuam pendentes.
- [ ] Todos os métodos de pagamento, pagamentos mistos, cancelamentos e devoluções.
- [ ] Abertura/fechamento, sangria/suprimento e conciliação de caixa pela interface.
- [ ] Concorrência determinística venda vs. fechamento e falha de rede durante commit.
- [ ] Conferência de relatórios financeiros e isolamento por perfil/empresa.

## M4 — P0.04 Estoque e movimentações (aberto)
- [x] Ajuste, perda, transferência, saldo e ledger testados via SQL reversível.
- [x] Leitura segura de estoque e transações corrigida no frontend; regressão de interface.
- [ ] Cadastro/edição de itens, ajustes, perdas e transferências completos no Playwright real.
- [x] Interface de estoque endurecida: valor total protegido por `viewFinancials`, quantidades especiais/negativas rejeitadas também no fallback local, transferência incerta bloqueada até refresh e histórico filtrável/expansível. Nove regressões novas e build local aprovados. [Evidência](./QA_INVENTORY_USABILITY_20261015.md). Playwright autenticado e gravações reais permanecem pendentes.
- [x] Cadastro de insumos agora permite editar metadados, desativar e reativar sem alterar quantidade/custo do ledger; preserva histórico, bloqueia operações em itens inativos, impede desativar ingrediente de produto ativo e exige locais ativos nas transferências. **40/40 regressões afetadas** e build local aprovados. [Evidência](./QA_INVENTORY_CATALOG_20261016.md). Persistência autenticada e revisão visual continuam pendentes.
- [ ] Estoque insuficiente, unidades, locais, duplicidade e histórico vinculado pela interface.
- [ ] Concorrência de múltiplos usuários, replay e timeout de gravações.
- [ ] Conciliação de saldos/custos médios e trilha de auditoria persistente.

## M5 — P0.05 Compras e fornecedores (aberto)
- [x] **Guard local de compensação:** fallback do teste persistente agora exige pagamentos revertidos e ledger financeiro líquido zero; cinco regressões unitárias aprovadas. **Não significa compensação executada no banco.** [Evidência](./P0_02_RECOVERY_P005_GATE_20261014.md).
- [x] SQL reversível: pedido Ordered, recebimento parcial/total, pagamento, sobre-recebimento/sobrepagamento rejeitados, reversão e cancelamento.
- [x] Leitura segura de pedidos/itens e isolamento HTTP de histórico de pagamentos.
- [x] Validações negativas no formulário de compras (quantidade zero, custo negativo, desconto excessivo).
- [x] Interface de compras endurecida: fornecedor/local ativos, método e datas válidos, valores não finitos rejeitados, resposta de commit incerta bloqueia reenvio; custos exigem `viewFinancials` e pagamentos exigem `paySuppliers`. **48/48 regressões afetadas**, build e audit runtime aprovados. [Evidência](./QA_PURCHASE_SUPPLIER_USABILITY_20261015.md). Não equivale à jornada persistente P0.05.
- [x] Contrato positivo de criação Ordered/Draft na UI com RPC interceptada (MOCK — não prova persistência).
- [x] Teste Playwright persistente TEST escrito, opt-in e sintaxe verificada em CI #112 (não executado).
- [ ] **BLOQUEADO:** executar criação persistente via browser com OWNER TEST e compensação controlada; exige preflight autenticado PASS no SHA publicado e autorização específica. O teste permanece fora da CI padrão.
- [ ] Recebimento parcial e total real via UI, pagamento e reversão, estoque restaurado e financeiro líquido zero.
- [ ] Reversão/cancelamento em erro parcial, atraso de commit, falha de rede e repetição; confirmar audit trail.
- [ ] Corrida de recebimentos simultâneos e verificação de transições proibidas.
- [ ] Decidir/testar migração de idempotência de compras em TEST; atualmente OFF/não instalada.

## M6 — P0.06 Rede, resiliência e concorrência (aberto)
- [x] Browser-smoke P0.05 tornado determinístico: login OWNER B continua real, fixtures exclusivas do formulário são interceptadas e validadas contra TEST/empresa B, e nenhuma compra persistente é executada. [Evidência](./QA_BROWSER_SMOKE_FIX_20261016.md).
- [x] CI #144: `browser-smoke` 51/51, 12/12 jobs e agregador QA aprovados no commit `22603c1`, após corrigir os cenários desatualizados de desconto no PDV e fornecedor ativo em compras. [Execução](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38899806097).
- [x] Browser offline/reconexão e sessão preservada em smoke.
- [x] Testes de replay financeiro e falha simulada após commit.
- [ ] Interrupção real no envio e na resposta durante gravações de venda, estoque e compra.
- [ ] Retry seguro após timeout, prevenção de duplicidade e recuperação consistente da UI.
- [ ] Testes de contenção simultânea de operações críticas, reconciliação e telemetria.

## M7 — P0.07 Arquivos, fotos e isolamento multiempresa (aberto)
- [ ] Upload de imagens de produtos com formato, tamanho, segurança e mensagens de erro.
- [x] Integração de upload privado preparada: JPEG/PNG/WebP até 5 MB, prévia, substituição/remoção, referência estável, URLs assinadas curtas em lote e compensação de upload não vinculado. Bucket/políticas e homologação real continuam bloqueados até preflight e autorização de migração TEST. [Evidência](./QA_PRODUCT_IMAGE_STORAGE_20261016.md).
- [ ] Leitura/download/remoção de arquivos autorizados; isolamento real entre empresas.
- [ ] Testar URL pública/assinada, cache, revogação, substituição e exclusão.
- [ ] Permissões de Storage e políticas RLS, incluindo tentativa de acesso cruzado.
- [x] Políticas Storage TEST-only preparadas para SELECT por empresa e escrita com `manageRecipesAndCosts`, caminho UUID estrito, bucket privado e rollback que recusa apagar objetos. Aplicação e tentativa real de acesso cruzado permanecem pendentes. [Evidência](./QA_PRODUCT_IMAGE_STORAGE_20261016.md).

## M8 — P1 Cadastros, operação e UX (aberto)
- [ ] Produtos: criação, edição, desativação, foto, SKU, preço, receita, custos e duplicidades.
- [x] Catálogo valida e normaliza nome, SKU, categoria, preço, descrição, foto e receita; bloqueia duplicidades, valores especiais e ingredientes inválidos/inativos antes do RPC. [Evidência](./QA_PRODUCT_CATALOG_20261016.md). Upload Storage e persistência autenticada continuam pendentes no item amplo acima.
- [x] Cadastro/edição preserva e valida URL HTTPS da foto, mostra prévia e persiste `image_url` pelo RPC existente; lista e PDV exibem a imagem com placeholder em erro. Upload binário/Storage permanece pendente.
- [x] Clientes: criação/edição de nome, telefone, e-mail, aniversário e notas compartilham validação; contatos duplicados são bloqueados, histórico permanece vinculado e valores exigem `viewFinancials`. **7/7 regressões locais** e build aprovados. [Evidência](./QA_CUSTOMER_USABILITY_20261015.md). Persistência autenticada e perfis reais continuam na homologação pendente.
- [x] Fornecedores: formulário de criação/edição valida duplicidade de nome/e-mail e site, normaliza campos, desativa quando há histórico e trata falhas de exclusão/alteração; valores históricos exigem `viewFinancials`. [Evidência](./QA_PURCHASE_SUPPLIER_USABILITY_20261015.md). Persistência real e matriz MANAGER/EMPLOYEE permanecem pendentes.
- [x] Catálogo de fornecedores: busca normalizada por nome/contato/telefone/e-mail/produtos e filtros de ativos, inativos e todos. **31/31 regressões afetadas** e build local aprovados. [Evidência](./QA_SUPPLIER_CATALOG_20261016.md). Persistência autenticada permanece pendente.
- [x] Funcionários — interface independente de contas: formulário valida salário/local/hierarquia, protege salário por `viewFinancials`, desativa sem apagar histórico e o ponto trata entrada, saída e pausas sem falso sucesso. **43/43 regressões afetadas** e build aprovados. [Evidência](./QA_EMPLOYEE_WORKFLOWS_20261015.md). Convites e sessões reais MANAGER/EMPLOYEE permanecem em M1/M2.
- [x] Tarefas — interface: criação/edição valida funcionário ativo, data e prioridade; conclusão bloqueia concorrência, falhas são exibidas e exclusão exige confirmação. [Evidência](./QA_EMPLOYEE_WORKFLOWS_20261015.md). Persistência com perfis reais continua pendente.
- [ ] Relatórios: totais, filtros, períodos, exportação, consistência com ledger.
- [x] Relatórios respeitam `viewFinancials` na interface: P&L, receita, margens, custos, valores e exports financeiros não são renderizados sem permissão; contagens operacionais permanecem disponíveis. Cinco regressões novas e build local aprovados. [Evidência](./QA_REPORT_FINANCIAL_GUARD_20261015.md). Isso não substitui RLS/API nem conclui a homologação integral de relatórios.
- [x] Fórmulas e filtros corrigidos: P&L exclui imposto da receita e o informa separadamente, descontos são rateados por produto, ranking de clientes respeita o período, tempos inválidos/cancelados são excluídos e datas personalizadas são validadas. **35/35 regressões afetadas** e build aprovados. [Evidência](./QA_REPORT_ACCURACY_20261015.md). Conciliação com fechamento contábil real ainda permanece pendente no item amplo acima.
- [ ] Configurações: persistência, permissões, idioma, fuso, regras e preferências.
- [x] Configurações agora validam nome, moeda, imposto e listas antes da escrita; moeda e fuso carregados alimentam os formatadores compartilhados, e o fuso pode ser selecionado na interface. [Evidência](./QA_SETTINGS_USABILITY_20261016.md). Persistência autenticada e preferências completas ainda permanecem no item amplo acima.
- [ ] Responsividade desktop/tablet/mobile, acessibilidade, rolagem, estados vazios e erros.
- [x] Base responsiva compartilhada corrigida: modal com rolagem/safe area, botão desabilitado efetivo, formulários adaptáveis, sidebar rolável, ações móveis visíveis, textos longos e valores zero preservados, mensagens comuns traduzidas e ARIA básico. **77/77 regressões afetadas** e build aprovados. [Evidência](./QA_RESPONSIVE_UI_20261015.md). Revisão visual autenticada e acessibilidade completa permanecem no item amplo acima.
- [x] Acessibilidade de teclado: modais fecham com `Escape`, gerenciam/restauram foco, linhas/cartões acionáveis respondem a `Enter`/`Espaço`, históricos e tarefas usam botões semânticos e buscas possuem nome acessível. **47/47 regressões afetadas** e build local aprovados. [Evidência](./QA_KEYBOARD_ACCESSIBILITY_20261016.md). Auditoria assistiva integral permanece pendente.
- [ ] Performance com volumes realistas, carga, paginação e degradação.
- [x] Bundle de produção dividido: arquivo principal reduzido de 587,61 kB para 426,97 kB, com React e ícones em chunks cacheáveis; build sem alerta de chunk acima de 500 kB. [Evidência](./QA_BUILD_CODE_SPLITTING_20261016.md). Volumes realistas, paginação e métricas de campo permanecem pendentes.
- [ ] Backup/restauração isolados e ensaio de recuperação.

## M9 — P2 Produto SaaS, lançamento e operação (aberto)
- [ ] Onboarding de empresa, usuários, localizações e configurações iniciais.
- [ ] Planos, limites, assinatura, faturamento e inadimplência.
- [ ] Administração SaaS e observabilidade sem acesso indevido a tenants.
- [x] Fundação frontend da Administração Comercial separa SUPERADMIN de OWNER, confia somente em `app_metadata`, não enumera tenants pelo cliente público e exige Edge Function protegida para listagem e mutações confirmadas. [Evidência](./QA_PLATFORM_ADMIN_FOUNDATION_20261016.md).
- [x] Backend da Administração Comercial preparado para TEST: Edge Function revalida Auth/claim, aplica CORS e contrato estritos, mantém `service_role` no servidor e chama RPCs transacionais com idempotência, locks, licença vitalícia/revogação, estado e auditoria privada. A interface preserva o `request_id` em retry e exibe o histórico recente. Migração/deploy e homologação real seguem bloqueados; suspensão ainda não é um bloqueio RLS global. [Evidência](./QA_PLATFORM_ADMIN_BACKEND_20261016.md).
- [ ] Suporte, logs, incidentes, monitoramento e alertas.
- [x] Recuperação de falha global da interface: Error Boundary acessível PT/EN evita tela vazia, não repete operações, oferece remontagem/recarga e emite somente referência local sanitizada. Envio, persistência e alerta externo de telemetria continuam pendentes no item amplo. [Evidência](./QA_APP_CRASH_RECOVERY_20261016.md).
- [ ] Privacidade, termos, documentação de uso e operação.
- [ ] Piloto real supervisionado, correção de feedback e aceite final.
- [ ] Revisão de segurança, backups, plano de rollback e aprovação explícita para lançamento.

## Critério para 100%
Todos os macros M0–M9 precisam estar completos, com evidências reproduzíveis, regressão sem falhas/skips, testes E2E reais, isolamento entre empresas, restauração validada e aceite humano. A CI #116 NÃO constitui homologação de 100%.

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
- [ ] Recuperação real OWNER QA, autenticação/isolation com perfis independentes MANAGER/EMPLOYEE, revalidação autenticada dos grants `employees`/`sale_items` e compras persistentes continuam bloqueados até a evidência da CI/preflight corrente e as autorizações indicadas no relatório.
- [ ] Sete entradas npm de desenvolvimento/build persistem na nova auditoria; runtime reporta zero. Não há correção compatível oferecida pela simulação nesta execução.

## Entrega publicada — CI #116

- [x] Correções de autenticação, diagnóstico de recuperação e guards de compensação publicadas em `83bac13b201916a8504e44b827e369be437da3ce`; [CI #116](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38674528976) terminou Success com **10/10 jobs e 231/231 TAP**, zero falhas/skips. [Evidências](./QA_DELIVERY_CI_116.md).
- [x] Procedimento seguro QA A/B e preflight fail-closed preparados; CI #126 tentativa 2 comprovou o preflight autenticado no runner GitHub.
- [ ] Execução local/Windows do preflight, recuperação real OWNER QA e compras persistentes continuam pendentes nos gates documentados; compras não foram habilitadas.

## Candidato corrente — despesas Cash, recuperação e preflight (2026-10-15)

- [x] Validação local: **54/54 testes estáticos**, **4/4 browser de recuperação interceptado**, build Vite aprovado, zero falhas e zero skips; `App.jsx` e `src/App.jsx` idênticos. [Evidências e limites](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [x] Preflight convertido em gate autenticado somente leitura antes de todos os jobs autenticados; valida OWNER A/B, fixtures positivas, isolamento e SELECT direto de `employees`/`sale_items`. O runner persistente P0.05 continua ausente da execução padrão.
- [x] **Histórico resolvido:** [CI #118, tentativa 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497) identificou `FIXTURE_EMPLOYEE_B`; a fixture foi posteriormente criada por processo autorizado e a CI #126 tentativa 2 aprovou o preflight completo.
- [ ] Migração Cash e prova SQL não executadas. Recuperação SMTP/troca/login real, idempotência de despesa, schemas privados Supabase, MANAGER/EMPLOYEE e compra persistente permanecem abertos.

## Automação P0.03 publicada — CI #121

- [x] Código opt-in e regressões para idempotência de despesas, retry seguro e bloqueio de valores não finitos no caixa publicados em `6ab4f48774f2d4dff6b34cb9acc77e54e017898e`; nenhuma migração aplicada. [Evidência](./QA_DELIVERY_EXPENSE_REPLAY_CI_121_20261015.md).
- [x] [CI #121](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38759292268): build/static e API anônima passaram, total parcial **70/70**, zero falhas/skips nesses produtores.
- [x] **Bloqueio histórico resolvido:** o plano de fixture foi autorizado e executado externamente no TEST; CI #126 tentativa 2 liberou os oito jobs autenticados e o agregado completo.
- [ ] Aplicação das migrações P0.03, provas rollback e concorrência real exigem autorização específica no Supabase TEST. O rollout de despesas permanece desligado.

## Continuação automatizada — CI #124

- [x] Plano persistente e compensável da fixture `employees` B publicado em `189610f`; o usuário informou execução autorizada no TEST e a CI confirmou sua visibilidade/isolamento. [Procedimento](./QA_EMPLOYEE_B_FIXTURE_PLAN.md).
- [x] Export canônico somente leitura publicado em `45f67f2`; o primeiro resultado implantado foi recebido e revisado em 2026-10-17. Como ele trouxe apenas metadados parciais, foi preparado um segundo export para corpos, ACLs e matriz completa. [Resultado](./QA_REAL_CATALOG_REVIEW_20261017.md).
- [x] Gate de auditoria publicado em `9600dea`; validação local **78/78**, build PASS, runtime audit zero e full audit 7 conhecidos. [CI #124](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38761093906) aprovou **83/83 TAP parciais** (78 static + 5 API), zero falhas/skips nesses produtores.
- [x] Registro histórico: CI #124 bloqueou corretamente em `FIXTURE_EMPLOYEE_B`; o bloqueio foi resolvido e revalidado na CI #126 tentativa 2.
- [x] Preflight reordenado sem skips em `04ff861`/`f436a76`: [CI #126](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38762019506) aprovou **84/84 TAP parciais** e, antes de alcançar `FIXTURE_EMPLOYEE_B`, comprovou estoque A, isolamento da compra A→B e `sale_items` A/B direto/entre empresas.
- [x] Bloqueio `employees` B resolvido: preflight e oito jobs seguintes aprovados na CI #126 tentativa 2.

## Aprovação do preflight — CI #126 tentativa 2

- [x] Fixture Employee B ativa foi informada como criada e confirmada no TEST; esta sessão não executou a escrita.
- [x] [CI #126 tentativa 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38762019506): preflight `PASS [OK]`, **12/12 jobs**, **274/274 PASS**, zero falhas e zero skips.
- [x] OWNER A/B, tenant, produtos, `employees`, `sale_items`, estoque e isolamento de compra aprovados no preflight somente leitura; os oito jobs autenticados foram liberados e aprovados.
- [ ] MANAGER/EMPLOYEE independentes, SMTP recovery/invite, catálogo implantado, migrações P0.03 e P0.05 persistente continuam pendentes. A aprovação OWNER A/B não cobre esses fluxos.
