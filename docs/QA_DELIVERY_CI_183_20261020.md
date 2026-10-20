# Publicação preservada e CI #183 — 20/10/2026

Somente QA `automation/nexalvo-qa-actions`, Supabase TEST `msinksoilkluooxenecy`.
Sem main, produção, deploy, migração ou novas operações persistentes TEST.

## Publicação confirmada

Comparação remota antes do push: `cad6ad0b36ce5bb03fe5aa8ce90572d7e317269d`, zero commits
remotos exclusivos e três commits locais exclusivos. Fast-forward, sem rebase/cherry-pick,
sem recriação/perda de arquivos e sem force push. Autenticação resolvida via helper temporário
`gh auth git-credential`; nenhuma credencial gravada em Git/config/relatório ou divulgada.
Dry-run e push passaram; fetch posterior e `merge-base --is-ancestor` confirmaram os três:

| Commit integral | Conteúdo | Histórico remoto |
| --- | --- | --- |
| `8faade0bdcd1511bb2605263830cebcdf23695c9` | Recuperação do PDV, histórico completo, calendário/fuso, guards persistentes e Vite | PASS |
| `a4721461c906921bf1659a6265b34a6d4fe016a6` | Handoff operacional e preservação da entrega anterior | PASS |
| `ea72a16a4c769699cf3865e5c7db5f98db229832` | P0 Terminal online-only, bloqueio explícito e testes/contratos preparados | PASS |

## CI real

[CI #183 — run 39506854457](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39506854457)
executou no commit `ea72a16a4c769699cf3865e5c7db5f98db229832`. Verificação pelo HTML público real
do GitHub, pois a API em `api.github.com` retorna 403 nesta sessão. Esse bloqueio de API não
impediu autenticação Git/push nem observação dos resultados publicados pelo Actions.

**594/594 verificações TAP PASS; 0 FAIL; 0 SKIPPED no escopo executado**, agregador completo
com seis relatórios esperados para push seguro. **8 jobs PASS e 4 jobs SKIPPED pelo gate**,
classificados como **BLOCKED por ausência de autorização persistente**, nunca aprovados.

| Job | Resultado |
| --- | --- |
| build-and-security | PASS; build, regressões locais/SQL descartável e gates de dependências |
| test-api-smoke | PASS |
| authenticated-preflight | PASS; runner OWNER A/B/fixtures isolado TEST |
| access-regression | PASS |
| auth-lifecycle | PASS |
| browser-smoke | PASS |
| performance-read | PASS |
| qa-summary | PASS, 594/594 no escopo executado |
| authenticated-concurrency | BLOCKED — job SKIPPED pelo guard persistente |
| replay-financial | BLOCKED — job SKIPPED pelo guard persistente |
| network-after-commit | BLOCKED — job SKIPPED pelo guard persistente |
| two-tenant-concurrency | BLOCKED — job SKIPPED pelo guard persistente |

O preflight PASS comprova os checks codificados na execução, não disponibilidade permanente de
fixtures ou sessões. CI verde deste escopo não homologa jornadas persistentes ausentes. Nenhuma
CI histórica com writes foi reiniciada. Compras browser permanecem fora da CI padrão e desligadas.

Warnings do runner: ações v4 baseadas em Node 20 forçadas a Node 24 e transição de ubuntu-latest
para Ubuntu 26. Não houve falha associada; acompanhar atualização em lote próprio. Dependências
não foram alteradas no lote Terminal; gate runtime exige zero alertas e gate total permite
somente os sete alertas de build previamente conhecidos, sem `audit fix --force`.

## Resultados e próximos passos

Política e limites de integração: [P0_STRIPE_TERMINAL_ONLINE_ONLY.md](./P0_STRIPE_TERMINAL_ONLINE_ONLY.md).
Local: 122/122 regressões afetadas + 5/5 browser com HTTP simulado, build PASS. Estes resultados
se sobrepõem aos testes da CI; não somá-los como jornadas diferentes. Stripe real/TEST permanece
BLOCKED; nenhum teste do simulador oficial ou pagamento TEST foi executado.

Plano solicitado **depois da CI**: [lote persistente 01](./QA_OPERATIONAL_PERSISTENT_BATCH_01.md),
com unidades Storage, vendas, estoque, compras e financeiro, limites propostos, preflights,
compensação e autorizações separadas. Nada desse lote foi executado/ativado.

Cobertura operacional vigente: **13/60 critérios, 21,67%**, 15 PENDENTES e 32 BLOQUEADOS.
Os oito critérios novos Terminal explicam o aumento do denominador. CI não os promove a
homologação real. Próxima prioridade: catálogo/fixtures somente leitura e revisão do pacote
Storage privado, antes de pedir autorização para aplicar/testar persistência.
