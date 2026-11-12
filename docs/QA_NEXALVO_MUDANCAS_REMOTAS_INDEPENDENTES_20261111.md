# NEXALVO QA — mudanças remotas independentes

Alvo de banco `msinksoilkluooxenecy`. Cada pacote tem seu próprio escopo de escrita. A evidência disponível é de leitura do TEST, instalação anterior do Terminal e validações locais já concluídas. [Evidência de pré-condições](./evidence/nexalvo-independent-readonly-20261111.json)

## Stripe TEST — configuração com cobrança desabilitada

A instalação do Terminal está concluída. A unidade candidata é `LOJA QA - TESTE`, da empresa QA A, ID `a3e4b2ed-eb00-4963-afd0-38c256aff87d`. A leitura confirmou zero vínculos, tentativas, eventos e autorizações de venda. Falta confirmar a conta sandbox nos EUA, a localização `tml_…`, o leitor `tmr_…` S700 simulado, a rede registrada e o teto em centavos. Esses dados completam o manifesto de configuração.

| Escopo | Mudança a revisar |
| --- | --- |
| Stripe sandbox | Usar a localização/leitor correspondentes ou solicitar escopo explícito para criar somente os recursos ausentes. Registrar um endpoint TEST na URL `https://msinksoilkluooxenecy.supabase.co/functions/v1/terminal-webhook`, com `payment_intent.created`, `payment_intent.succeeded`, `payment_intent.payment_failed` e `payment_intent.canceled`. Conferir a conta e o modo sandbox. |
| Supabase TEST | Vincular somente a origem exata do Preview revisado em `STRIPE_TERMINAL_TEST_ALLOWED_ORIGINS`, após conferir o valor disponível e preservar origens legítimas. Fixar `STRIPE_TERMINAL_TEST_ALLOW_CHARGES=false`. Configurar `STRIPE_TERMINAL_TEST_ACCOUNT_ID`, `STRIPE_TERMINAL_TEST_SECRET_KEY` e `STRIPE_TERMINAL_TEST_WEBHOOK_SECRET` pelo canal administrativo. |
| Banco TEST | Um INSERT desabilitado em `terminal_private.bindings` para a unidade QA identificada. Fixar empresa, unidade, conta sandbox, localização Stripe, leitor, modelo `simulated_stripe_s700`, rede e teto. Validar empresa/unidade ativa, vínculo leitor/localização da mesma conta, ausência de colisão de unidade e de conta/leitor. |
| Preview | Conferir o projeto TEST e manter `VITE_STRIPE_TERMINAL_ENABLED=false`. Vínculo de origem e mudanças de ambiente do Preview têm registro próprio. |

Pós-flight de configuração confere endpoint, modo sandbox, origem, vínculo desabilitado e zero tentativas. Habilitar o leitor e executar o ensaio simulado requer escopo com fixture de venda, valores, orçamento de operações e resíduos definidos. Conferir aprovação, recusa, cancelamento e recarga da mesma tentativa com a Stripe, estoque e financeiro. O aceite presencial depende da S700 física e da rede de operação. [Pacote Terminal](./QA_STRIPE_TERMINAL_EVENTO_TEST_20261111.md) · [Simulação oficial Stripe](https://docs.stripe.com/terminal/references/testing#simulated-card-presentment)

## Caixa — correção do fechamento

O pacote de uma aplicação DDL TEST, com SHA-256 `a2b9685abf58a2984c822dee232a13d9b1bec462e521f3004eeb541ddc6f35bc`, ajusta `fn_close_cash_register(uuid,numeric,text,text)`. A função calcula o saldo pelo tipo do lançamento e normaliza o meio Cash. A transação exige a definição anterior com MD5 `abc12e6f24daac827c1fea828377e7a0`, usa limites de 5 s para lock e 30 s para execução e preserva assinatura, proprietário, grants e dados históricos. O último pedido ficou em revisão.

Pós-flight por leitura confere catálogo, definição e grants. Resultado incerto exige reconciliar histórico da migração e definição atual. A jornada persistente de caixa tem fixture, efeitos e autorização separados. [SQL revisado](../migrations/20261111_cash_register_close_ledger_TEST.sql) · [Prova de fechamento](./QA_NEXALVO_ENTREGA_OPERACIONAL.md#correção-do-fechamento-de-caixa-para-revisão)

## Compras — idempotência da criação

O pacote de uma aplicação DDL TEST tem SHA-256 `982bcc921651c6ac545847d62defc367b0d6fe204192862b536f866e3b1fceae`. Ele cria `purchase_order_request_keys` com RLS e sem acesso direto por clientes e adiciona `fn_create_purchase_order_idempotent`, preservando os RPCs legados. A nova RPC vincula a chave, o payload e o pedido na mesma transação, com autorização de empresa e `managePurchases`.

Antes da aplicação, conferir ausência da tabela e da nova função e os MD5 da criação `60a5ebb422936aae5d2b1abb38688c65` e do recebimento `51ae83d203731a294af7a19bf7e44944`. Pós-flight por leitura confere definição, RLS, grants, unicidade da chave e tabela sem linhas. A flag `VITE_PURCHASE_IDEMPOTENCY_ENABLED` permanece desabilitada até revisão própria. Resultado incerto exige leitura de catálogo e histórico, sem reaplicação.

O SQL de recuperação tem SHA-256 `eda93622579efdbb53637251a9755ba364f68230ab35aada9159ae7e9262a446` e bloqueia a remoção se houver qualquer chave persistida. Ele exige escopo próprio. A jornada persistente P0.05 de compra, recebimento, pagamento e reversão depende de orçamento, intenção durável e recibos por etapa. A fixture existente já está identificada. [SQL proposto](../migrations/20261012_purchase_order_idempotency_TEST.sql) · [SQL de recuperação](../migrations/20261012_purchase_order_idempotency_rollback_TEST.sql)
