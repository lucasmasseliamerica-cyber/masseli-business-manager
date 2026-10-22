# C1 — leitura segura de perdas e diagnóstico sanitizado (22/10/2026)

Branch exclusiva `automation/nexalvo-qa-actions`; TEST `msinksoilkluooxenecy`.
Main, produção, fixtures e checkpoints A/B preservados. Nenhum movimento C1, perda, auditoria,
compensação, alteração de RLS/grants, migração ou deploy foi executado no TEST.

## Causa e limites da comprovação

O proprietário informou quatro gates PASS e `exclusive_fixture=BLOCKED`, com
`C1_AUTH_OR_READ_REJECTED`, zero requisições de estoque/auditoria e SELECT direto de
`waste_transactions` negado para authenticated. O cliente antigo consultava diretamente essa
tabela depois de item, locais, estoque, movimentos, receitas e itens de compras.

A incompatibilidade é comprovada: SELECT direto foi rejeitado no PostgreSQL descartável sem
esse grant; a resposta HTTP403/42501 foi reproduzida no transporte simulado. As negações para
B/anon podem aprovar isolamento enquanto a leitura da fixture pelo OWNER A ainda falha.

**O relatório agregado anterior não registra o recurso rejeitado.** Esta sessão não dispõe de
Desktop Commander, SQL integrado ou credenciais QA para observar a requisição Windows original.
Portanto, não atribuir com certeza o trace anterior a um recurso sem o novo diagnóstico. O
próximo preflight identificará exatamente etapa, recurso e status caso outra leitura falhe.

## Correção implementada

Existe uma fachada segura já revisada: `public.fn_read_waste_transactions_secure()`.
O corpo foi recuperado do export histórico fornecido pelo usuário, cuja varredura completa de
segredos passou e cujo SHA-256 coincide com a evidência sanitizada versionada:
`a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f`.

| Contrato | Valor esperado |
| --- | --- |
| MD5 de prosrc | `4dbda260df3b744caf55d2c2ba8c031f` |
| SHA-256 de prosrc | `7c2a163faa7d766485c6cfd3d8acb84815f2e3faf7260de02830cdc5d81e3b1a` |
| Identidade/retorno | Sem parâmetros; SETOF public.waste_transactions |
| Execução | SQL STABLE SECURITY DEFINER, owner postgres, search_path vazio |
| ACL | authenticated permitido, anon negado, um overload |

A função filtra `business_id = public.current_business_id()`. O helper pós-cutover, já fixado
no catálogo C, exige perfil/empresa ativos. Custos são mascarados sem
`manageRecipesAndCosts`; **as linhas de histórico não são omitidas**. Não há parâmetro de
empresa substituível nem fallback administrativo.

O C1 passa a usar essa RPC em `view()` e nas sondagens de isolamento de leitura. O preflight C
genérico tinha o mesmo acesso incompatível e também foi corrigido. O caminho direto da tabela
foi retirado da allowlist. Não há retry, retorno vazio em caso de erro ou fallback para SELECT.

Toda a lista de perdas continua obrigatória no snapshot, na elegibilidade e na reconciliação.
Uma perda histórica sem ledger associado continua visível e desqualifica a fixture; saldo ou
ledger vazio não prova ausência de perdas. Empresa, identidade, receita, compras, histórico,
custos, janela, idempotência, isolamento e compensação conservam seus controles anteriores.

**Não é necessária nova RPC, migração ou autorização de escrita para esta correção.** O catálogo
atual deve comprovar o contrato instalado antes de qualquer uso. Se ele divergir ou faltar, o
preflight bloqueia: não conceder SELECT amplo nem substituir fingerprints sem revisão.

## Diagnóstico seguro

O relatório inclui somente campos previamente definidos: etapa, recurso, ator A/B/ANON, método,
status HTTP ou null, motivo e código SQL/PostgREST da allowlist. Nunca inclui mensagem upstream,
URL/query, body, headers, UUIDs, e-mail, token, senha, checkpoint ou stack. O cliente sanitiza na
origem e o runner sanitiza novamente; falhas de logout não sobrescrevem a causa original.

Exemplo **simulado**, não log da execução Windows anterior:

```json
{
  "stage": "FIXTURE_READ",
  "resource": "WASTE_SECURE",
  "actor": "A",
  "method": "GET",
  "http_status": 403,
  "reason": "HTTP_REJECTED",
  "upstream_code": "42501"
}
```

`WASTE_SECURE` identifica a RPC de perdas; outros recursos, como `AUDIT_HISTORY` ou
`PURCHASE_LINES`, identificam suas leituras independentemente. Timeout, JSON inválido, RPC
ausente ou resposta truncada permanecem BLOCKED; nenhuma escrita é reenviada por diagnóstico.

## Evidências

Código publicado: **9a0c5c025e14e335271195d76a658492857dba53**.
[CI #213](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39870484891):
**792/792 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes BLOCKED/ignorados pelo gate**.

- **538/538 regressões locais PASS**, zero falhas/skips, em 46 módulos.
- Incluídos nesse total: 20 testes de diagnóstico/transporte e 18 PostgreSQL descartável,
  sem rede. Não somar esses subconjuntos novamente.
- A regressão end-to-end executa o preflight em Git QA sintético e reproduz quatro gates PASS,
  fixture BLOCKED e diagnóstico exato, com zero estoque/auditoria/checkpoint.
- PostgreSQL comprova SELECT direto negado, RPC por empresa, histórico sem ledger, custos
  mascarados/overrides e negações por identidade/empresa/ACL/assinatura/atributos divergentes.
- Build e análise das duas Edge Functions PASS, sem deploy. Revisão de segurança aprovada.
- CI: preflight autenticado habitual, leitor seguro na regressão de acesso, C1 Windows PS5.1/7
  e browser aprovados. Esses checks não substituem o novo catálogo/fixture do notebook.

[Evidência sanitizada da correção](./evidence/stock-c1-read-rejection-20261022.json) e
[evidência da CI](./evidence/stock-c1-read-ci-213-20261022.json).
Os testes locais são simulados/descartáveis; não equivalem à homologação persistente.

## Notebook — atualizar catálogo e repetir somente PreflightOnly

Preservar alterações locais; não usar reset ou force push. Sincronizar QA limpa:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
if ((git branch --show-current) -ne 'automation/nexalvo-qa-actions' -or (git status --porcelain)) {
    throw 'QA_LIMPA_OBRIGATORIA'
}
git pull --ff-only origin automation/nexalvo-qa-actions
if ($LASTEXITCODE -ne 0) { throw 'SINCRONIZACAO_BLOQUEADA' }
Get-Content -Raw .\qa\sql\stock_journey_preflight_readonly_TEST.sql | Set-Clipboard
```

Executar o SQL copiado **somente no SQL editor conectado ao TEST msinksoilkluooxenecy** e salvar
o novo resultado em `%TEMP%\nexalvo-c1-catalog.json`. O SQL é SELECT-only, acrescenta
`waste_reader_contract` e mostra os privilégios efetivos de SELECT de authenticated.

O status geral `PASS_MATCHED_HISTORICAL_CONTRACTS` cobre os nove contratos históricos; os
gates JavaScript exigem também `waste_reader_contract` e `c1_audit_contract` completos. O
catálogo anterior sem o novo leitor bloqueia, mesmo com status geral PASS.

```powershell
.\qa\Invoke-QaStockJourney.ps1 `
  -ValidatedCodeSha '9a0c5c025e14e335271195d76a658492857dba53' `
  -CatalogFile (Join-Path $env:TEMP 'nexalvo-c1-catalog.json') `
  -PreflightOnly
```

Os IDs C existentes continuam fixados no launcher. As credenciais são informadas somente nos
prompts ocultos; não enviar pelo chat, salvar em arquivos/logs ou usar service_role como usuário.
Retornar somente o JSON sanitizado. Não executar movimentação, perda, compensação ou auditoria.

## Estado operacional

**C1 real BLOCKED até receber o novo preflight autenticado.** A sessão não acessou o notebook
ou fez consultas SQL ao TEST; isso não significa indisponibilidade global do notebook. A CI
executa os checks habituais de autenticação/leitura, com quatro grupos persistentes desativados.

A autorização C1 anterior não foi utilizada nesta etapa. A janela exclusiva e todos os gates
continuam obrigatórios antes de uma futura escrita. Nenhum critério operacional foi promovido:
**16/60 (26,67%)**, 15 pendentes e 29 bloqueados. A/B permanecem preservadas.
