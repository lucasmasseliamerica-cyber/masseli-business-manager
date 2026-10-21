# Próximo lote P0 — preparação, não autorização de execução

Atualização: **A-Infra instalada/aprovada e A-Jornada expressamente autorizada pelo usuário**.
Não reaplicar a infraestrutura nem pedir novamente essa autorização. A execução real de fotos
continua [BLOCKED por acesso/source/fixtures](./QA_PHOTO_A_JORNADA_20261020.md). B/C/D/E seguem
sem autorização persistente específica; as restrições históricas abaixo para A estão superadas.

Preparado após a CI #183 aprovar o escopo seguro. TEST exclusivo `msinksoilkluooxenecy`, branch
`automation/nexalvo-qa-actions`. Produção/main intocáveis. Não executar nada persistente deste
plano sem aprovação específica. Compras browser e quatro grupos persistentes da CI permanecem OFF.
O escopo não inclui Stripe Terminal, pagamentos reais, comercialização automática ou novas contas.

## Gate comum, obrigatório antes de cada unidade

1. Confirmar SHA de código publicado, projeto por origem externa confiável e endpoint TEST exato.
   Executar novamente somente o preflight de identidade/fixtures que expirar ou for modificado.
   CI #183 provou o preflight OWNER A/B na execução; não garante validade futura de sessões/fixtures.
2. Sessões QA A/B existentes em ambiente seguro, sem copiar secrets do GitHub para arquivos/logs.
   Windows: `qa/Invoke-QaPreflight.ps1`; runner `qa/p0-preflight-readonly.TEST.mjs`.
   Ausência de sessão/permissão/fixture = BLOCKED; não usar service key como usuário ou SUPERADMIN
   tenant EMPLOYEE como substituto de OWNER/MANAGER/EMPLOYEE. Perfis reais continuam separados.
3. Export somente leitura vigente: `qa/sql/operational_release_preflight_readonly_TEST.sql` e
   manifesto `qa/final-homologation-manifest.mjs`. Capturar definições/ACLs/fingerprints reais
   antes de aprovar migração/rollback. Leitura REST não substitui catálogos SQL.
4. Identificar **fixtures dedicadas preexistentes**, sem divulgar IDs pessoais. Se inexistentes,
   pedir autorização separada para criá-las. Nada de reutilizar ou apagar histórico QA para obter
   isolamento. Bloquear operadores concorrentes nas fixtures durante o ensaio autorizado.
5. Snapshot seguro prévio de quantidade, custo médio, ledger, saldo de caixa, registros/estados
   envolvidos, relacionamentos e metadados Storage. Tag de execução única e IDs estáveis para
   todas as operações; não imprimir credenciais, links assinados ou dados pessoais.
6. Aprovação deve nomear operações e fixtures, limites, interrupções de rede e compensação. O
   valor `TEST_ONLY_EXPLICIT` sozinho não é autorização. Não disparar o workflow manual amplo
   para autorizar uma unidade menor. Sem flags persistentes por push/CI padrão.

## Sequência e orçamento proposto, sujeito a aprovação

| Unidade | Migração/infraestrutura separada | Jornada TEST proposta | Compensação e prova final |
| --- | --- | --- | --- |
| A — Fotos/Storage | `20261016_product_images_storage_TEST.sql`; preflight específico e rollback existentes | Um produto QA dedicado, no máximo dois objetos PNG/JPEG/WebP, cada um menor que 5 MiB; upload, preview, salvar, reload, substituir, remover; OWNER B/anon negados | Restaurar referência/metadados originais; apagar somente objetos criados por esta execução e provar ausência; não remover fotos históricas/bucket com objetos |
| B — Vendas/PDV | Confirmar `fn_create_sale`/cancelamento e caixa/estoque antes do teste; sem Stripe | Uma venda QA de quantidade 1, total máximo 1 unidade monetária da empresa, sem pagamento real; criar UI, salvar, reload, reconsultar; falha de resposta e replay do mesmo ID só se nomeados | Estorno único pela função autorizada, venda/itens mantidos no histórico; estoque/custo restaurados e ledger líquido zero; nenhum segundo sale ID |
| C — Estoque | Contratos existentes de ajuste/perda/transferência; duas unidades QA ativas e exclusivas | Um insumo QA; quantidade máxima 1 por operação; cadastro/edição só se autorizados; histórico e consulta após reload | Compensação das posições de origem/destino e custo médio exatamente conforme snapshot; trilha de movimentos preservada, não deletada |
| D — Compras | Aprovar separadamente `20261012_purchase_order_idempotency_TEST.sql` para ensaio de replay | Um pedido de um item, quantidade 1, custo/total máximo 1 unidade monetária; criar/receber/pagar/reverter; começar pelo ciclo simples, depois falha parcial/reenvio se nomeados | Cancelar rascunho ou reverter pedido recebido; pagamentos `reversed`, movimentos compensatórios, quantidade/custo inicial e financeiro líquido zero |
| E — Caixa/despesas | finite_guard → expense_cash_normalization → expense_idempotency, cada pacote aprovado separadamente | Um caixa QA exclusivo (abertura 0) e uma despesa Cash de no máximo 1 unidade monetária; cadastro/data/categoria/duplicidade e consulta após reload; timeout só depois da idempotência implantada | Reversão autorizada e fechamento/conciliação com diferença zero; líquido da despesa zero; não reutilizar ou fechar caixa histórico |

Os limites acima não são decisão sobre preços reais da Masseli. Se o banco não aceitar o cenário
ou exigir valores diferentes, interromper a unidade antes da escrita e obter revisão de escopo.
Não alterar preço/custo/configuração de produto histórico para atingir o limite.

## Artefatos e dependências que já existem

- Storage: `qa/sql/product_images_storage_preflight_readonly_TEST.sql`, migração de Storage e
  `migrations/20261016_product_images_storage_rollback_TEST.sql`. O rollback bloqueia remoção
  com objetos remanescentes; não torná-lo destrutivo.
- Finite guard: `migrations/20261015_cash_register_finite_guard_TEST.sql` e
  `qa/sql/p0_03_cash_register_finite_rollback_TEST.sql` (verificação transacional).
- Despesa Cash: `migrations/20261015_expense_cash_normalization_TEST.sql` e
  `qa/sql/p0_03_expense_cash_normalization_rollback_TEST.sql`.
- Despesa idempotente: migração/rollback `20261015_expense_idempotency*_TEST.sql` e
  `qa/sql/p0_03_expense_idempotency_rollback_TEST.sql`. Flag permanece desligada.
- Compras: migração/rollback `20261012_purchase_order_idempotency*_TEST.sql` e
  `qa/sql/p0_05_purchase_lifecycle_rollback_TEST.sql`. Flag permanece desligada.
- O SQL transacional sob ROLLBACK existente não homologa persistência UI. Para finite guard e
  normalização Cash, falta liberar rollback **com a definição real anterior capturada/revisada**;
  os scripts transacionais de verificação não substituem a restauração de uma migração aplicada.
- `qa/p0-purchase-browser-persistent.TEST.mjs` já preparado continua desativado, fora da CI
  padrão. Antes de liberar, revalidar seus IDs históricos contra fixtures dedicadas aprovadas,
  snapshot/recuperação de custo médio e sanitização de erros/artefatos. Não executar como está
  sobre fixtures compartilhadas sem essa revisão. Nomear autorização P0.05 separadamente.

Não aplicar novamente hardening público ou Administração Comercial já concluídos. Não publicar
Edge Functions como parte implícita deste lote. Manter os quatro guards de jobs persistentes.

## Interrupção, compensação e aceite

Depois de erro de envio/resposta, não repetir operação não idempotente. Esperar assentamento
limitado e reconsultar pelo mesmo ID/tag. Se ainda desconhecido, manter BLOCKED e bloquear novas
operações da fixture. Não compensar às cegas uma operação que ainda pode concluir no servidor.

Compensar somente operações identificadas desta execução, em ordem inversa. Snapshot de saldo
igual não basta: comprovar também custo, status, ausência de efeito ativo residual e ledger por
referência. Compensação falha exige registro do bloqueio e intervenção; não excluir histórico ou
executar nova movimentação arbitrária. Guardar evidência antes/depois sanitizada e IDs em acesso
seguro, sem dump de dados no Git.

Aceite por unidade: criar/editar/salvar **na UI real**, atualizar página, consultar novamente no
TEST, verificar tenant B/anon negados, conferir auditoria e invariantes, compensar e reconsultar.
Registrar PASS/FAIL/BLOCKED por cenário. Mock/browser interceptado não marca este aceite verde.

## Autorizações necessárias, ainda não concedidas para este lote

1. **A-Infra:** migração Storage TEST revisada, sem upload implícito.
2. **A-Jornada:** objetos isolados e alteração/restauração de referência de um produto QA.
3. **B/C:** venda/estorno e movimentos de estoque sobre fixtures/limites aprovados.
4. **D-Infra** e **D-Jornada:** idempotência de compras e ciclo persistente P0.05, separadamente.
5. **E-Infra** e **E-Jornada:** patches financeiros, abertura/despesa/reversão/fechamento,
   separadamente. Revisão dos baselines/rollbacks antes de solicitar aplicação.

Próxima atividade segura: executar/reter o catálogo/preflight **somente leitura**, resolver as
lacunas de baseline/fixtures e apresentar primeiro o pacote A-Infra concreto para revisão.
Sem integração SQL nesta sessão, essa leitura pode ser executada pelo acesso TEST já autorizado;
retornar apenas resultado sanitizado, sem credenciais.
