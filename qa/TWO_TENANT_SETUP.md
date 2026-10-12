# NEXALVO TEST: duas empresas e concorrência PostgreSQL

**Status:** instrumentação instalada e validada individualmente; simultaneidade real ainda precisa de execução autenticada pelo GitHub Actions. Um resultado SKIP nunca significa aprovação.

## Cenários isolados já preparados
- Empresa A (NEXALVO QA - EMPRESA FICTICIA): produto `QA-CONCURRENCY-A-1125`, **US$ 11,25**, sem receita de estoque; unidade `LOJA QA - TESTE`.
- Empresa B (ZZ_QA_PLATFORM_20261009_AUTO): produto `QA-CONCURRENCY-B-2350`, **US$ 23,50**, sem receita de estoque; unidade `QA Unit`.
- Função instalada **somente no projeto Supabase TEST**: `public.fn_qa_two_tenant_overlap(uuid,text)`; só executável por `authenticated`. A função verifica empresa, produto e local exatos, aguarda 3 segundos dentro da transação, chama a RPC de vendas e retorna `backend_pid`, `started_at` e `finished_at`.
- Ambos os ramos A/B da função passaram individualmente sob rollback. Isso **não** é uma aprovação da simultaneidade entre transações.

## Configuração única para executar automaticamente
No GitHub, ambiente `nexalvo-test`:

**Secrets** (4 valores, não enviar senhas por chat):
- `QA_TWO_TENANT_A_EMAIL` e `QA_TWO_TENANT_A_PASSWORD`: conta OWNER da empresa fictícia A.
- `QA_TWO_TENANT_B_EMAIL` e `QA_TWO_TENANT_B_PASSWORD`: conta OWNER da empresa fictícia B.

**Variable** (1):
- `QA_TWO_TENANT_ENABLED=true` depois que as quatro credenciais estiverem configuradas.

As variáveis `QA_SUPABASE_URL` e o secret `QA_SUPABASE_ANON_KEY` já atendem aos testes básicos; não é necessário criar novos valores para elas. IDs das empresas, produtos e unidades são verificados dentro da função TEST e nos testes; não precisam ser preenchidos pelo usuário.

## Critérios para aprovar a concorrência
1. As duas contas autenticam de forma independente.
2. Dois RPCs são enviados juntos via `Promise.all`.
3. Os dois RPCs retornam HTTP 200, tenant correto, venda correta e valores 11,25 / 23,50.
4. Os PIDs PostgreSQL são diferentes e os intervalos de transação registrados pelo banco têm **sobreposição >= 1000 ms**.
5. Cada empresa vê exatamente um registro de venda e de fluxo financeiro com seu valor, e não consegue ver dados da outra.
6. Ambas as vendas são canceladas por RPC ao final. Registros históricos cancelados permanecem apenas no TEST.
7. Repetir várias vezes e revisar artefatos no GitHub Actions para descartar falhas intermitentes.

O workflow usa o job `two-tenant-concurrency` e salva `qa-two-tenants-results.tap` por 14 dias. Não executar em produção.
