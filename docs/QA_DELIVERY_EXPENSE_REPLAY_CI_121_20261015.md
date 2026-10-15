# NEXALVO QA — idempotência de despesas e CI #121 (2026-10-15)

## Escopo e limites

Trabalho realizado somente na branch `automation/nexalvo-qa-actions`, para o Supabase TEST `msinksoilkluooxenecy`. Código publicado em `6ab4f48774f2d4dff6b34cb9acc77e54e017898e`. Nenhuma migração, SQL, fixture, operação persistente, deploy ou alteração de produção foi executada. A branch `main` não foi alterada. O teste persistente P0.05 permaneceu desativado.

## Correções preparadas

| Área | Estado | Evidência e limite |
|---|---|---|
| Replay de despesa | **CONCLUÍDO no código / BLOQUEADO no TEST** | `fn_create_expense_idempotent` usa chave composta empresa/request ID, payload JSON completo, `ON CONFLICT` e `FOR UPDATE`; retorno existente é buscado pela mesma empresa. Migração preparada, nunca aplicada |
| Segurança do wrapper | **APROVADO estático** | `auth.uid()`, empresa e `manageExpenses` são validados antes da reserva; `search_path=''`; tabela de chaves com RLS e sem grants cliente; RPC somente para `authenticated` |
| Cliente de despesas | **CONCLUÍDO opt-in** | ID UUID estável durante a vida do modal; flag `VITE_EXPENSE_IDEMPOTENCY_ENABLED` permanece ausente/desligada; o RPC legado continua ativo |
| Retry após resposta incerta | **CONCLUÍDO local** | RPCs com ID estável de venda, compra e despesa não armam o bloqueio global de escrita; os demais RPCs preservam o fail-closed existente |
| Abertura de caixa não finita | **CONCLUÍDO no código / BLOQUEADO no TEST** | Frontend rejeita `NaN`/infinito antes do RPC; migração preparada rejeita NULL/NaN/infinidades antes do lock ou mutação, serializa pela localização e exige auditoria atômica |
| Provas SQL | **PREPARADAS, NÃO EXECUTADAS** | Scripts `BEGIN/ROLLBACK` cobrem replay exato, payload alterado, tenant incorreto, resíduos, valores especiais, ledger e auditoria. Dependem de aplicação autorizada no TEST |

## Evidência local

| Verificação | Resultado |
|---|---|
| Suíte estática usada pela CI | **65/65 PASS**, zero falhas/skips |
| Novas regressões P0.03 | **11/11 PASS**, incluindo as duas cópias do frontend |
| Browser de recuperação com HTTP interceptado | primeira tentativa não executou por ausência do binário Playwright; reexecução com `/usr/bin/chromium`: **4/4 PASS** |
| Build Vite 6.4.3 | **PASS**, 1.578 módulos; aviso não bloqueante de chunk JS acima de 500 kB |
| `npm audit --omit=dev` | **PASS**, zero vulnerabilidades runtime |
| `npm audit` completo | **7 alertas** de build/dev: 5 high e 2 moderate; nenhuma atualização forçada aplicada |
| Integridade | `App.jsx` e `src/App.jsx` idênticos; workflow YAML válido; `git diff --check` e verificações de segredos aprovados |

O download de outro Chromium pelo Playwright foi negado pelo proxy com HTTP 403. O Chromium já instalado no runner executou os mesmos quatro testes com sucesso; a tentativa inicial é bloqueio de ambiente e não falha funcional.

## GitHub Actions #121

[Run #121](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38759292268), SHA `6ab4f48774f2d4dff6b34cb9acc77e54e017898e`:

| Job | Estado real |
|---|---|
| `build-and-security` | **PASS** — build e 65 testes estáticos |
| `test-api-smoke` | **PASS** — 5 testes anônimos |
| `authenticated-preflight` | **BLOCKED [FIXTURE_EMPLOYEE_B]** |
| Oito produtores autenticados | **BLOCKED / skipped pelo gate** |
| `qa-summary` | **FAIL fechado / INCOMPLETE** — 2/10 relatórios TAP |

Os dois produtores executados somam **70/70 testes parciais aprovados**, sem falhas/skips dentro desses jobs. Esse total não representa a suíte integral. A causa semântica do run é a fixture positiva de funcionário B ainda ausente ou indisponível; não há nova evidência de defeito de RLS.

## Próximos gates

1. Confirmar ou provisionar, mediante autorização e somente no TEST, uma linha ativa de `employees` da empresa B visível ao OWNER B por `fn_read_employees_secure`.
2. Reexecutar o preflight e os oito jobs autenticados sem enfraquecer o teste positivo.
3. Revisar/aplicar as duas migrações P0.03 somente com autorização específica e na ordem documentada.
4. Executar as provas SQL com rollback e depois um teste concorrente real de request ID no TEST.
5. Manter P0.05 persistente desligado até o preflight integral passar e existir autorização própria.

Esta entrega reduz o risco no código, mas não homologa o comportamento implantado nem autoriza lançamento comercial.
