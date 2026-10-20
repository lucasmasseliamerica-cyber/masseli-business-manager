# P0 — Stripe Terminal exclusivamente online

Data: 20/10/2026. Branch exclusiva `automation/nexalvo-qa-actions`; Supabase TEST
`msinksoilkluooxenecy`. Requisito obrigatório para homologação operacional. Site comercial,
checkout Stripe e ativação automática de licenças continuam congelados.

## Política de aceitação

1. Aceitar Wi-Fi, Ethernet ou celular **somente conforme modelo, país, firmware e integração
   suportados**. Não presumir que todo leitor oferece os três meios. Bluetooth não substitui
   este requisito de leitor conectado. A escolha dos modelos da operação permanece pendente.
2. Antes de cada cobrança, o backend valida sessão/perfil ativo, `manageSales`, empresa/unidade,
   leitor associado à empresa, conta Stripe esperada, comunicação autenticada com a Stripe e
   leitor online e sem ação concorrente. Um resultado recente de readiness expira em cinco
   segundos no núcleo preparado; mesmo uma verificação válida não garante a conexão seguinte.
   O backend repete a verificação antes de despachar. Wi-Fi e `navigator.onLine` não são provas.
3. Se qualquer condição não puder ser confirmada, **não iniciar a cobrança**. Sem fallback para
   confirmação manual, simulador ou outra máquina. O modo Stripe deve ser selecionado
   explicitamente: `VITE_CARD_PAYMENT_MODE=stripe_terminal`; valor inválido também bloqueia.
4. Não habilitar offline no SDK, leitor ou integração. Não coletar/transmitir cartões depois,
   não usar fila offline, não usar background sync para cobranças, não promover `offline queued`
   a pagamento confirmado. Uma integração que não permita garantir essa política não será usada.
5. Antes da primeira chamada de escrita à Stripe, reservar **no backend** uma tentativa durável
   com IDs estáveis de empresa, venda e operação. Uma venda não pode ter duas tentativas ativas,
   mesmo em abas, usuários ou máquinas diferentes. Definir a chave de idempotência antes do I/O.
6. Timeout, queda, resposta truncada, cancelamento solicitado, reconexão ou reinício depois do
   despacho levam a **Verificando pagamento**. Conservar a tentativa e o PaymentIntent original.
   Não criar outro PaymentIntent nem repetir `process_payment` automaticamente. Isso também vale
   quando a resposta da criação se perde e o cliente ainda não conhece o ID do PaymentIntent.
7. Resultado visual do leitor e sucesso do comando de processamento não são aprovação. A fonte
   final é `retrieve PaymentIntent` autenticado na conta Stripe correta. Validar TEST/livemode,
   ID, empresa/venda/operação vinculadas, moeda, valor e `amount_received`. `requires_capture`,
   `processing` e estados desconhecidos permanecem pendentes; não são pagamentos concluídos.
8. Depois de `succeeded` confirmado, **o backend**, em transação idempotente, grava venda, itens,
   baixa de estoque, financeiro e auditoria, vinculados ao mesmo PaymentIntent. Só após o commit
   o PDV mostra **Aprovado**. Se o commit falhar, continuar verificando e repetir somente a
   finalização da mesma venda; nunca cobrar novamente. Se o estoque mudou nesse intervalo,
   manter exceção operacional explícita, sem fabricar venda concluída ou reembolso automático.
9. Cancelar na UI é uma solicitação; somente cancelamento confirmado na Stripe encerra a
   tentativa. Recusa exige estado autenticado correspondente. Nova tentativa exige ação
   explícita e fechamento/reconciliação da anterior sob lock; nunca retry automático.
10. Webhooks são notificações. Verificar assinatura sobre corpo bruto, timestamp, modo/conta,
    identificar a tentativa autorizada e reconsultar a Stripe. Eventos duplicados ou fora de
    ordem não duplicam estoque/financeiro nem rebaixam uma venda já aprovada. Reembolso/estorno
    Stripe é fluxo separado, ainda não implementado; não confundir cancelamento no NEXALVO com
    devolução de dinheiro pela Stripe.

O modo `external` preservado registra pagamento de outra integração, não cobra cartão e não
comprova aprovação Stripe. A interface agora avisa explicitamente para **não registrar Stripe
Terminal pelo modo manual**. Não habilitar a operação Stripe usando esse modo como atalho.

## Estados obrigatórios do PDV

| PT | EN | Condição e ação permitida |
| --- | --- | --- |
| Conectado | Connected | Readiness autenticado e recente; pode solicitar uma única tentativa |
| Desconectado | Disconnected | Readiness ausente/falho/expirado ou integração indisponível; cartão bloqueado |
| Processando | Processing | Tentativa reservada; impedir nova cobrança e edição do valor |
| Verificando pagamento | Verifying payment | Resultado/commit não confirmado; consultar a mesma tentativa |
| Aprovado | Approved | Stripe `succeeded` validado e transação da venda concluída no backend |
| Recusado | Declined | Recusa confirmada via consulta autenticada; nenhuma venda/baixa aprovada |

Cancelado é estado adicional depois de confirmação Stripe. Reconectar durante estado desconhecido
mantém **Verificando pagamento**, sem transição automática para Conectado. No reinício, consultar
tentativas abertas do caixa no backend **antes** de liberar cartão; cache local é apenas ponteiro,
nunca autorização. Sem backend, permanecer bloqueado. Nunca guardar segredo, client_secret ou
dados de cartão no localStorage/logs.

## Código entregue e limites

- `src/App.jsx`/`App.jsx`: seleção explícita/fail-closed, aviso Desconectado PT/EN, botão de cartão
  desativado e guarda que rejeita qualquer resultado Stripe na finalização manual do cliente.
  Nenhum endpoint Stripe/SDK é chamado. Cash/PIX/Zelle/Other e cartão externo permanecem separados.
- `supabase/functions/_shared/terminal-online-core.mjs`: núcleo puro preparado para readiness,
  reserva, vínculo do intent, interrupção/reconexão, conciliação e confirmação de commit.
  Seus inputs são **internos de um adapter backend confiável**, não provas aceitas do navegador.
  Não é Edge Function publicada, adapter Stripe, armazenamento durável ou autorização HTTP.
- `qa/stripe-terminal-online.test.mjs`: testes de domínio com snapshots de leitor/Stripe
  simulados; não executam o simulador oficial da Stripe nem criam pagamentos. A repetição de
  estado é idempotente no domínio; unicidade/locking financeiros reais ainda exigem prova SQL/API.
- `qa/operational-browser.test.mjs`: frontend real com HTTP interceptado, modo Stripe selecionado
  na fixture; bloqueio móvel PT, reload e métodos não cartão. Não usa sessão ou leitor real.
- `qa/stripe-terminal-readonly.TEST.mjs`: runner de quatro GETs à Stripe para fixtures TEST já
  existentes. Faz validação de branch/projeto, chave TEST, conta, modo e leitor; relatório
  agregado sanitizado. Não cria reader/PaymentIntent, não coleta cartão, não processa/cancela/
  captura/reembolsa e não escreve no Supabase. Fora da CI automática.

**Não está concluída a integração Stripe.** Falta o adapter autenticado, associação
empresa/conta/leitor, persistência/locks/RPC financeira privada, webhook, retomada UI backend e
configuração/testes reais. As seis traduções estão prontas; somente Desconectado é exercitado no
PDV atual. Não há implementação offline. Não apresentar os testes simulados como homologação.

## Contratos backend a implementar antes de habilitar

Requisições autenticadas retornam apenas dados da empresa autorizada; IDs de conta/leitor,
preço, descontos/impostos e estoque são resolvidos/validados no servidor. SUPERADMIN global não
deve implicitamente operar vendas de clientes. Bloquear sessão inativa/permissão revogada.

| Operação lógica | Contrato obrigatório |
| --- | --- |
| Readiness | Consultar Stripe/reader de verdade; sem cache como autoridade nem status do navegador |
| Start | Lock da venda, preço server-side, reserva durável única antes do I/O, verificar readiness de novo, criar intent uma vez, persistir ID antes de processar |
| Status/recover | Leitura autenticada da tentativa; buscar o mesmo intent na Stripe; nunca criar/processar outro |
| Cancel | Solicitar cancelamento do mesmo intent; retornar pendente até consultar resultado final |
| Webhook | Assinatura válida, conta/mode/contexto validados, dedupe de evento e reconsulta do intent |
| Finalize | RPC privada transacional: venda/itens/estoque/financeiro/auditoria + estado final; frontend apenas reconsulta |

Se a criação do intent for interrompida sem ID, recuperar a associação por webhook verificado ou
investigação autorizada da Stripe. Metadata é vínculo a comparar com a reserva; não substitui
autorização, autenticação ou assinatura. Nenhuma nova criação enquanto houver essa incerteza.

## Preparação persistente TEST — ainda não liberada para aplicação

Não há migração financeira Terminal pronta para aplicar nesta entrega. Não reutilizar
`fn_create_sale` exposta como prova de pagamento Stripe nem aceitar `success=true` do cliente.
A implementação deverá preparar e revisar, com catálogo real:

1. Schema privado de pagamentos com tentativas, associação Stripe/leitor/empresa e recibos de
   webhook; RLS e negação direta a PUBLIC/anon/authenticated. Backend recebe somente o mínimo.
2. Unicidade de `(business_id,sale_id)` ativo, `(business_id,operation_id)`,
   `(stripe_account_id,livemode,payment_intent_id)` e `(stripe_account_id,livemode,event_id)`;
   FKs/constraints/locks, hash do payload canônico e proibição de reutilizar chave com outro valor.
3. RPC privada de finalização e transação única com ledger/estoque/venda/auditoria, modo de
   recuperação sem recobrança, grants mínimos e `search_path` fixo. Perfil/tenant/permissões são
   conferidos no início; desenho de recuperação preserva cobrança já concluída se perfil mudar.
4. Preflight somente leitura dos fingerprints/ACL/RLS e ausência de efeitos anteriores;
   integração em PostgreSQL descartável incluindo concorrência e rollback antes da autorização.
5. Rollback **sem apagar pagamentos, auditoria ou chaves idempotentes**: primeiro bloquear novas
   cobranças, manter conciliação de tentativas abertas e preservar capacidades de leitura/recuperação.
   Não remover função/tabela enquanto houver tentativa desconhecida ou venda não conciliada.

Autorização futura deve nomear separadamente: migração TEST revisada; publicação/configuração de
backend/webhook TEST; fixtures/simulador Stripe TEST; ciclo de venda TEST isolado e compensação.
Sem autorização de pagamentos/financeiro real. Não executar novas operações na produção.

## Plano de homologação com leitor simulado e pagamentos Stripe TEST

Os testes de integração abaixo continuam **BLOCKED**, não SKIPPED/PASS. Preparar fixture de
venda/unidade/estoque exclusivo, valores menores TEST, snapshot antes/depois e sem produção.

| Cenário | Evidência obrigatória antes de verde |
| --- | --- |
| Readiness e meios compatíveis | Conta/reader TEST consultados pelo backend, configuração offline negada e teste por modelo |
| Sucesso simulado Stripe TEST | PaymentIntent real TEST `succeeded`, venda UI após reload, estoque correto, ledger único |
| Sem internet antes de iniciar | Nenhum novo intent, leitor processado ou lançamento |
| Resposta da criação perdida | Uma reserva; nenhum segundo create; recuperar o intent original |
| Queda/timeout durante processamento | Verificando pagamento; mesmo ID após reconexão e restart |
| Recusa e cancelamento | Estado Stripe definitivo consultado; sem venda/baixa paga indevida |
| Webhooks duplicados/fora de ordem | Assinaturas validadas, reconsulta Stripe, um conjunto de efeitos |
| Concorrência em duas abas/operadores | Lock/constraint impede duas cobranças para a mesma venda |
| Falha no commit financeiro | Stripe já confirmada, UI pendente, retry somente da mesma finalização |
| Escopo/valores indevidos | Negação cruzada, moeda/valor divergentes bloqueados; sem efeitos |

Simulação de queda na cobrança deve interromper a resposta **depois** do backend despachar; não
confundir erro antes do envio com resultado desconhecido. Para cada caso contar intents,
tentativas, itens, movimentos e lançamentos antes/depois, incluindo após reload. Registrar apenas
agregados e fingerprints, sem segredo/ID pessoal. Compensação financeira TEST só com autorização
própria: confirmar transação Stripe, aplicar reversão e restaurar saldos, preservando histórico.

### Runner somente leitura preparado

Disponibilizar somente por configuração segura de processo (não `.env` versionado/chat/log):
`NEXALVO_STRIPE_TEST_SECRET_KEY`, `NEXALVO_STRIPE_TEST_ACCOUNT_ID`,
`NEXALVO_STRIPE_TEST_READER_ID`, `NEXALVO_STRIPE_TEST_PAYMENT_INTENT_ID` e `VITE_SUPABASE_URL`.
Usar chave TEST de mínimo acesso de leitura e fixtures existentes autorizadas. O runner não
precisa de senha nem sessão OWNER para esta inspeção da Stripe, e não comprova autorização tenant.

Executar: `node qa/stripe-terminal-readonly.TEST.mjs`. Exit 0 = PASS **somente leitura das
fixtures**, 1 = FAIL, 2 = BLOCKED. Mesmo PASS mantém cobrança real TEST e finalização como BLOCKED.
Nesta sessão retornou `BLOCKED / SECURE_TEST_FIXTURES_REQUIRED`, zero requests mutantes e nenhuma
chamada Stripe; não solicitar segredos pelo chat. Pagamentos Stripe TEST ainda não executados.

Referências para revisão técnica antes de escolher modelo/adapter:
<https://docs.stripe.com/terminal/payments/setup-reader/server-driven>,
<https://docs.stripe.com/terminal/features/operate-offline/overview>,
<https://docs.stripe.com/terminal/references/testing>,
<https://docs.stripe.com/webhooks> e <https://docs.stripe.com/api/payment_intents/retrieve>.
O acesso HTTP às docs Stripe foi bloqueado por 403 nesta sessão; compatibilidade específica de
hardware e versão da API não foram presumidas nem homologadas com base nesses links.

## Resultados locais deste lote

[Evidência agregada e hashes](../qa/evidence/stripe-terminal-online-20261020.json).
**122/122 regressões afetadas PASS**, incluindo **44 testes Terminal**; **5/5 browser PASS**
com HTTP simulado; build PASS; zero falhas/skips. As 365 verificações da entrega operacional
anterior não foram repetidas sem necessidade nem somadas a este escopo. Syntax check, espelho
App/src, diff e varredura de segredos passaram. Nenhum SDK/pagamento/reader Stripe real foi usado.

CI destes commits ainda não verificada; a última baseline histórica é #180, não uma aprovação
deste código. A publicação dos commits operacionais preservados e deste lote é a próxima tarefa
solicitada pelo usuário, após encerrar este pacote. Dependências não foram alteradas neste lote.
