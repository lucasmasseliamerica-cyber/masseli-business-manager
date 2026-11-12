# Stripe Terminal S700 — pacote Supabase TEST

O pacote prepara o PDV online para o Supabase TEST `msinksoilkluooxenecy`, com Stripe API `2026-10-28.endive`. O botão exige habilitação explícita no frontend, autorização do operador, unidade vinculada, backend habilitado e leitor conferido. O modo live depende de revisão específica do catálogo e da associação de conta, ambiente e leitor em produção. [Versão da API](https://docs.stripe.com/api/versioning) · [Fluxo server-driven](https://docs.stripe.com/terminal/payments/collect-card-payment?terminal-sdk-platform=server-driven)

## Instalação confirmada no TEST

O manifesto `21349740458365b971b7f76e3a42e898a39347c9ea14c4e3168561948ccff756` vinculou os arquivos do commit `46715919a1eee900b40671ba0229bcff96fe9877`. O Supabase registrou a migração como `20261111130949` (`terminal_online_test`). O pós-flight confirmou cinco dependências, quatro tabelas privadas com RLS, sete RPCs restritas e o trigger `terminal_guard_sale`. As duas funções estão ACTIVE v1, com os 12 arquivos e os modos JWT conferidos. As quatro tabelas do Terminal estão vazias. [Evidência](./evidence/terminal-evento-test-install-20261111.json)

| Artefato | Efeito |
| --- | --- |
| `supabase/migrations/20261111032959_terminal_online_TEST.sql` | Uma transação DDL. Cria schema privado, quatro tabelas com RLS, índices de unicidade, dois helpers privados, sete RPCs exclusivas de `service_role` e um trigger de proteção em `sales`. Valida as cinco dependências versionadas. Sem seed |
| `terminal-payment` | Nova Edge com `verify_jwt=true`, mais confirmação da identidade por Supabase Auth a cada pedido e autorização por empresa/unidade no banco |
| `terminal-webhook` | Nova Edge com `verify_jwt=false` para a Stripe. Verifica HMAC no corpo bruto, timestamp, modo e associação do evento. Reconsulta a Stripe e deduplica por conta/evento |

Cada Edge usa seu `index.ts`, `deno.json` e os quatro módulos `terminal-online-core.mjs`, `terminal-stripe.mjs`, `terminal-service.mjs` e `terminal-http.mjs` de `_shared`. Use `import_map_path` explícito por função, apontando ao `deno.json` empacotado. O manifesto do pacote registra os SHA-256. A publicação inicial deixa o início de cobranças desabilitado.

Pré-flight e pós-flight usam `qa/sql/terminal_online_catalog_readonly_TEST.sql`. Pré-flight exige cinco fingerprints exatos, schema Terminal ausente e nenhuma regra pré-existente em `sales`. Pós-flight exige as mesmas dependências, quatro tabelas com RLS sem leitura de clientes, sete RPCs com execução exclusiva de `service_role` e o trigger `terminal_guard_sale`. Conferir as duas funções ACTIVE, o hash de cada fonte e `verify_jwt` no painel/API de gestão.

A autorização de instalação foi consumida em uma aplicação da migração e uma publicação por função. A próxima autorização poderá vincular o Preview, a conta Stripe TEST, a localização e o leitor confirmados. A configuração, a fixture e os pagamentos TEST têm escopos próprios.

## Configuração da próxima etapa

| Local | Campos previstos |
| --- | --- |
| Vercel Preview | `VITE_SUPABASE_URL` do TEST, `VITE_SUPABASE_ANON_KEY` pública, `VITE_CARD_PAYMENT_MODE=stripe_terminal`, `VITE_STRIPE_TERMINAL_ENABLED=false` até o backend estar admitido |
| Supabase TEST | `STRIPE_TERMINAL_TEST_ALLOWED_ORIGINS` com a origem exata `https://masseli-business-manager-kb2n942fr-lucas-masseli.vercel.app` e `STRIPE_TERMINAL_TEST_ALLOW_CHARGES=false` na etapa de configuração. `STRIPE_TERMINAL_TEST_ACCOUNT_ID`, `STRIPE_TERMINAL_TEST_SECRET_KEY` e `STRIPE_TERMINAL_TEST_WEBHOOK_SECRET` pertencem ao sandbox escolhido e ficam no backend. |
| Binding privado | Empresa e unidade exclusivas QA, `acct_…`, `tml_…`, `tmr_…`, modelo S700 ou S700 simulada, rede prevista, teto em centavos e estado habilitado somente após a admissão |
| Webhook Stripe TEST | Destino `https://msinksoilkluooxenecy.supabase.co/functions/v1/terminal-webhook`, eventos `payment_intent.created`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`. Conferir assinatura e a conta do endpoint |

Manter a S700 dedicada ao NEXALVO durante o ensaio. O aplicativo usa uma tentativa aberta por unidade e por leitor. O backend valida preço, desconto, imposto, ingredientes, saldo inicial e limite. A configuração de rede registra o meio previsto. O ensaio físico confirma o meio de fato usado.

O Preview está verificado e o teste de entrada do webhook recebeu `405 METHOD_NOT_ALLOWED` para GET. A leitura confirmou zero vínculos, tentativas e eventos. O Stripe Dashboard solicitou login. A revisão da configuração depende da seleção do sandbox, da empresa/unidade QA e de um leitor identificado com localização nos EUA. [Evidência do Preview](./evidence/nexalvo-vercel-preview-20261111.json)

Na continuação após o cancelamento do evento, a leitura do TEST de 20h58 UTC confirmou zero vínculos, tentativas, eventos e autorizações de venda. A unidade candidata é `LOJA QA - TESTE`, ativa e única na empresa de QA já usada no Preview, com ID `a3e4b2ed-eb00-4963-afd0-38c256aff87d`. Para completar a configuração de sandbox, faltam a conta Stripe TEST, a localização, o S700 simulado e o teto. A homologação física continua como etapa própria. [Leitura sanitizada](./evidence/nexalvo-independent-readonly-20261111.json)

Para o ensaio no sandbox, o leitor simulado pode executar o fluxo server-driven antes da chegada da S700 física. Após iniciar a ação de pagamento pelo NEXALVO, o operador de teste apresenta um cartão simulado no leitor pelo helper Stripe `present_payment_method`. Cada caso deve conferir a tentativa no Supabase, o PaymentIntent na Stripe e os efeitos previstos na venda, no estoque e no financeiro. O roteiro de homologação inclui aprovação, recusa, cancelamento e recarga com a mesma tentativa. [Testes Stripe Terminal](https://docs.stripe.com/terminal/references/testing#simulated-card-presentment) · [Roteiro](./QA_NEXALVO_EVENTO_20261115.md)

## Recuperação e efeitos

O servidor grava uma reserva antes de cada despacho relevante. A criação e o processamento usam chaves de idempotência distintas para a mesma operação. O PDV persiste somente os identificadores do pedido e da tentativa. Webhook e status recuperam o PaymentIntent original. Uma tentativa sem ID após perda da resposta de criação aguarda webhook verificado ou investigação da Stripe.

O backend só aprova após conferir `succeeded`, montante, moeda, metadata, conta e modo, e receber a confirmação da transação de venda. A transação reutiliza `fn_create_sale`, incluindo itens, estoque, financeiro e auditoria. A confirmação Stripe é mantida se houver falha no commit. O operador reconsulta a tentativa para finalizar a mesma venda. Mudança de estoque, revogação do operador ou configuração divergente exigem conciliação da venda paga.

Em indisponibilidade, desabilitar início de cobranças pela configuração aprovada e manter status/webhook para resolver pendências. Para voltar ao frontend anterior, identificar o deployment anterior, resolver as tentativas abertas, revisar o alvo e promover a versão anterior. Preservar reservas, eventos e vínculos financeiros. A migração acrescenta controles de integridade, com estorno de venda Stripe bloqueado até existir conciliação de reembolso. Recompensas de fidelidade no pagamento Stripe exigem validação própria. Os demais meios usam os fluxos existentes.

## Verificação local

- PostgreSQL 17 descartável com funções versionadas, incluindo venda, estoque, ledger e auditoria reais em tabelas sintéticas. API Stripe e autenticação foram interceptadas. Cenários de concorrência, perda de resposta, deduplicação, commit abortado, recusa, cancelamento e proteção contra confirmação manual verificados.
- Chromium com HTTP interceptado conferiu bloqueio por padrão e recuperação da mesma tentativa após recarga, com comprovante carregado da venda confirmada.
- `deno check` dos dois pontos de entrada passou. O ambiente Stripe TEST publicado e a S700 física ainda precisam de ensaio.
