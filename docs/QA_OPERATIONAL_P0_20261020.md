# NEXALVO v1.6.8 — operação P0, 20/10/2026

Escopo exclusivo: branch `automation/nexalvo-qa-actions`, TEST `msinksoilkluooxenecy`.
Site comercial, checkout Stripe e licenciamento automático congelados. Administração Comercial
aprovada preservada; SQL, Edge Functions, claims, usuários e dados TEST não foram alterados.

## Cobertura operacional comprovada

[Matriz permanente de aceitação](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md): **13/52 critérios,
25%**, com **14 PENDENTES e 25 BLOQUEADOS**. O denominador contém 13 módulos e quatro critérios
por módulo, definidos explicitamente. Não mede linhas de código nem quantidade de testes.
Os 13 resultados reais existentes são reaproveitados da baseline CI #180 e dos SQLs reversíveis
já documentados; não foram repetidas gravações para aumentar cobertura. Contexto SQL JWT simulado
está identificado e não equivale a sessão/browser real. Novos mocks não promovem critérios a verde.

| Módulo | Auditoria/testes desta entrega | Correção ou pendência | Aceitação comprovada |
| --- | --- | --- | --- |
| Vendas/PDV | Browser HTTP simulado: cancelar/confirmar cartão, salvar, perder resposta 504, retry do mesmo ID e reload | Cartão externo padrão, moeda configurada e produto ativo; sem cobrança nem Stripe | 1/4, 25% |
| Produtos/fotos | Contratos de produto e Storage; leitura real do bucket | Bucket confirmado ausente (HTTP 400/status interno 404); upload real bloqueado | 0/4, 0% |
| Estoque | Regressão completa, paginação e baixa após venda simulada | Histórico deixa de truncar em 500; ciclo UI real e concorrência pendentes | 1/4, 25% |
| Compras/fornecedores | Datas/itens ativos, recebimento/pagamento e erro de commit | Reenvio incerto bloqueado visivelmente; jornada persistente e edição de rascunho continuam sem homologação | 2/4, 50% |
| Financeiro/despesas | 502/504/408 e resposta truncada; validações antes do RPC | Latch global protege writes não idempotentes; categoria/data/local/método validados | 1/4, 25% |
| Clientes | Criar/editar nome, telefone, e-mail, notas e reconsultar após reload com backend HTTP simulado | Quatro campos preservados no contrato; falta prova no TEST | 1/4, 25% |
| Funcionários/ponto/tarefas | Inventário real agregado e regressões existentes | Seis perfis: zero MANAGER ativo, um EMPLOYEE ativo sem vínculo; gestão segura pendente de pacote SQL/Edge | 1/4, 25% |
| Configurações/unidades | Datas, moeda e fuso do negócio | Pagamento usa moeda configurada; datas/horas exibidas no fuso da empresa | 0/4, 0% |
| Permissões | Regressões completas; proteção SUPERADMIN/EMPLOYEE preservada | OWNER A/B baseline aproveitada; matriz real MANAGER/EMPLOYEE bloqueada | 2/4, 50% |
| Autenticação | Baseline real preservada; regressões locais completas | Recuperação/convite real e múltiplos dispositivos ainda pendentes | 1/4, 25% |
| Relatórios | 1.205 registros paginados, limites de URL, datas, DST e mês de 31 dias | Sem totais silenciosamente parciais; comparação por dias civis; falta conciliação real | 0/4, 0% |
| Estabilidade/rede | Falhas de gateway, JSON truncado e isolamento do runner | Esforço seguro de retry por ID; quatro grupos CI persistentes exigem autorização manual | 3/4, 75% |
| Impressão/backup | Prévia real de recibo e download HTML no browser com dados simulados | Não afirma aprovação/reembolso da operadora; impressora física e restauração integral bloqueadas | 0/4, 0% |

## Bugs corrigidos e seus limites

1. **Resultado financeiro incerto tratado como falha definitiva.** RPCs só protegiam perda de
   transporte; HTTP 502/504/408 e sucesso com JSON truncado não travavam novos writes. Regressão
   anterior: 1/6 PASS, 5 FAIL; após correção: 6/6 PASS. Operações não idempotentes ficam bloqueadas
   até conferência; venda mantém ID/retry seguro. Erro SQL 400 continua erro definitivo.
2. **Histórico incompleto.** Consultas limitavam vendas/despesas/compras em 500, caixa em 250 e
   outros ledgers em 1.000/2.000. Agora paginam com ordenação estável, respeitam filtros e dividem
   filtros UUID em lotes de 100. Páginas repetidas, contagem alterada ou falha intermediária
   rejeitam o resultado inteiro. Acima de 10.000 registros há erro explícito; agregação backend
   por período para grandes volumes segue pendente. Paginação não cria snapshot transacional.
3. **Cartão em simulador por padrão.** Operação passa a confirmar pagamento já recebido na
   maquininha externa; cancelar não salva nada. Não gera ID fictício nem cobra cartão. Simulador
   apenas com `VITE_CARD_PAYMENT_MODE=simulator`, reservado a QA. Integração Stripe permanece congelada.
4. **Fuso e agrupamento incorretos em relatórios.** Intervalos usavam meia-noite do navegador,
   comparavam milissegundos em dias DST e convertiam 31 dias em bucket semanal. Agora usam datas
   civis da empresa, incluindo dias de 23/25 horas e despesas com data sem horário.
5. **Validações/UX.** Datas impossíveis, insumos inativos e seletores inválidos são rejeitados
   antes de operações. Receber/pagar desabilita reenvio incerto. Tradução `Add {0}` corrigida
   após o cenário móvel PT encontrar o rótulo em inglês.
6. **Vite vulnerável.** Auditoria encontrou três advisories novos, elevando o conjunto a oito
   pacotes/6 altos/2 moderados. Patch 6.4.3 → 6.4.4 removeu esse acréscimo. Somente a versão do
   Vite mudou no lockfile; nenhuma major ou interface de Tailwind foi alterada.

## Evidências e verificação

[Agregado sanitizado](../qa/evidence/operational-p0-20261020.json).

- **365/365 testes locais completos PASS**, zero falhas/skips, incluindo PostgreSQL 17 descartável
  sem rede/portas/volumes Supabase e 21 regressões operacionais específicas.
- **4/4 browser PASS com HTTP simulado**, zero falhas/skips. Frontend Vite real; Auth/dados e
  writes interceptados em memória. Isso comprova contratos/interface, não persistência TEST.
- Build Vite, YAML/Bash do workflow, sintaxe dos scripts e varredura de segredos: PASS.
- `npm ci` e patch Vite compatível; runtime **zero alertas**. Auditoria total retorna código 1
  pelos sete alertas conhecidos de build (5 altos, 2 moderados); o gate de dívida conhecida passa.
- SQL operacional novo é **somente leitura e validado estaticamente**, não executado no TEST:
  [operational_release_preflight_readonly_TEST.sql](../qa/sql/operational_release_preflight_readonly_TEST.sql).
  Retém fingerprints/assinaturas e informa pendências; o marcador esperado não prova o projeto.
- CI desta entrega será registrada após o push. A baseline histórica é
  [#180](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096),
  12/12 jobs e 539/539 verificações. Não usar essa contagem como resultado das alterações atuais.

Os primeiros erros do harness de browser eram seletores (detalhe de cliente aberto automaticamente,
menu desktop oculto no mobile e prévia de impressão em iframe) e uma asserção de retry antes da
conclusão assíncrona. Foram corrigidos; não classificados como falhas do banco, credenciais ou produto.

## CI segura e operações que exigem autorização

A CI anterior executava criação/estorno de vendas e compra real mesmo em push comum. Os grupos
`authenticated-concurrency`, `replay-financial`, `network-after-commit` e `two-tenant-concurrency`
agora exigem **workflow_dispatch + authorize_persistent_test_flows=true**, e cada runner requer
`NEXALVO_PERSISTENT_QA_AUTHORIZED=TEST_ONLY_EXPLICIT`. Push automático executa o escopo seguro,
espera seis relatórios TAP e registra **quatro grupos BLOCKED**, sem contá-los como PASS.
Com autorização manual, espera dez relatórios; compras persistentes via browser continuam fora.
CI verde no escopo seguro não representa regressão persistente integral ou homologação comercial.

Sequência preparada para revisão, **sem aplicar**:

1. Confirmar projeto/identidade e executar o novo preflight SQL somente leitura. Comparar corpos,
   fingerprints, grants e dependências do manifesto. Definições baseline exatas são obrigatórias
   antes de liberar rollback de patches que restauram função por captura prévia.
2. **Fotos:** preflight [Storage](../qa/sql/product_images_storage_preflight_readonly_TEST.sql),
   [migração](../migrations/20261016_product_images_storage_TEST.sql) e
   [rollback](../migrations/20261016_product_images_storage_rollback_TEST.sql). Autorizar separadamente
   bucket/políticas e upload QA isolado. Antes do rollback, limpar somente objetos do teste autorizado;
   rollback recusa objetos remanescentes e não apaga fotos/histórico existentes.
3. **Financeiro:** finite_guard → expense_cash_normalization → expense_idempotency; depois
   purchase_order_idempotency. Artefatos/dependências estão no manifesto final. Capturar baseline
   exata, revisar compensação, aplicar um pacote por vez com autorização e verificar pós/rollback
   em destino descartável. Flags de idempotência continuam OFF nesta entrega.
4. **Equipe:** pacote manage_staff_user SQL/Edge preparado, pré/pós/rollback existentes; autorizar
   implantação e vínculos de identidades QA existentes separadamente. Não criar usuários/e-mails,
   promover EMPLOYEE, reutilizar SUPERADMIN como perfil comum ou modificar claims.
5. Autorizar jornadas persistentes específicas com fixtures isoladas, saldo/estoque antes/depois,
   IDs de operação, compensação e trilha de auditoria. Não excluir histórico para forçar PASS.
6. Homologar hardware de impressão e backup/restauração em destino isolado com acesso seguro.

**Próxima prioridade:** desbloquear Storage privado e sessão/fixtures de homologação operacional;
em seguida validar jornadas reais e os patches financeiros. O aplicativo não está 100% homologado.
