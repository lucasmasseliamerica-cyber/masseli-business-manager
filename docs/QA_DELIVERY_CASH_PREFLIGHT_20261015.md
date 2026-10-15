# NEXALVO QA — despesa Cash, recuperação e preflight (2026-10-15)

## Escopo e restrições observadas

Trabalho realizado somente na branch `automation/nexalvo-qa-actions`, sobre a baseline documental `f646bd7b4e0bba34a1708133709a9a9e73e0adee`, para o Supabase TEST `msinksoilkluooxenecy`. O código foi publicado em `efff3ab35b05dce1802b82418100b9e84a71cf04`; a anotação segura do preflight foi publicada em `0130df45852708b15ec128d3b3156551817f1197`. Nenhuma migração, SQL, alteração de credencial, deploy ou operação de produção foi executada. A branch `main` não foi alterada. O teste persistente P0.05 permaneceu desativado.

As execuções remotas foram [CI #117](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38751480929) e [CI #118](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497). A #118 substitui a #117 como diagnóstico: ambas preservaram o gate, e a segunda publicou a categoria sanitizada exata sem expor valores.

## Revisão da correção TEST-only de despesas em dinheiro

O artefato preparado é `migrations/20261015_expense_cash_normalization_TEST.sql`; sua prova transacional reversível é `qa/sql/p0_03_expense_cash_normalization_rollback_TEST.sql`. Ambos permanecem **não executados**.

| Critério | Resultado | Evidência | Limite/pendência |
|---|---|---|---|
| Projeto e implantação | **BLOCKED** | Cabeçalho TEST-only, nenhuma aplicação/execução SQL automática e nenhuma ferramenta SQL chamada nesta sessão | O SQL não consegue provar sozinho o project ref; uma aplicação futura precisa validar `msinksoilkluooxenecy` fora do script e requer autorização |
| Isolamento | **PASS estático** | `current_business_id()` e `user_can(...) IS NOT TRUE` precedem qualquer INSERT/UPDATE/DELETE; location, caixa, ledger e identidade de auditoria são filtrados pela empresa | Definição implantada e ACL completa ainda exigem export de catálogo |
| Segurança do definer | **PASS estático** | `SECURITY DEFINER`, `search_path=''`, objetos qualificados, revogação de `PUBLIC`/`anon` e grant de execução a `authenticated` | Grants preexistentes para outros papéis não são removidos por `CREATE OR REPLACE`; catálogo efetivo permanece pendente |
| Normalização Cash | **PASS estático** | Espaços/capitalização convergem para `Cash` em `expenses` e `cash_flow`; método vazio e valor não positivo/não finito falham fechados | Prova SQL real aguarda implantação autorizada no TEST |
| Consistência do saldo | **PASS estático/local** | Saldo usa `cash_flow.type IN ('income','expense')`, empresa, local, vínculo do caixa e lock `FOR UPDATE`; saldo NULL/negativo/não finito é rejeitado | Concorrência entre fechamento, reversão, movimentos e pagamentos depende de funções implantadas que não constam integralmente no repositório |
| Colisão de categoria | **PASS local** | Regressão usa despesa de $60 com categoria literal `Cash Register - Opening`, espera saldo $40 e rejeição de nova despesa de $50; frontend preserva `ledgerType` e não exclui por rótulo | A prova SQL está preparada com `BEGIN/ROLLBACK`, mas não foi executada |
| Histórico de auditoria | **PASS estático** | A função exige exatamente uma linha de `audit_logs`; qualquer ausência aborta a mesma transação | Prova dinâmica permanece pendente |
| Replay/idempotência | **FAIL confirmado** | A assinatura não recebe operation/request ID e o teste proíbe alegação falsa de idempotência | `FOR UPDATE` serializa concorrência do saldo, mas um reenvio após resposta incerta cria outra despesa. Requer desenho/versionamento próprio |
| Caixa inicial especial | **BLOCKED / risco aberto** | A nova função de despesa rejeita saldo derivado `NaN`/infinito | A definição versionada de `fn_open_cash_register` ainda aceita `numeric` especial porque valida apenas `< 0`; corrigir separadamente antes de homologar o caixa |

A revisão também identificou que a tela carregava no máximo 1.000 linhas de `cash_flow`; portanto o saldo exibido em um caixa muito longo pode truncar movimentos. A equivalência com `fn_close_cash_register` continua bloqueada até o export somente leitura das funções implantadas.

## Recuperação de senha

O fluxo agora aceita somente o host exato do TEST e uma chave moderna `sb_publishable_…` ou JWT legado com `role=anon` e `ref=msinksoilkluooxenecy`. URLs com porta/caminho/query/fragmento, chaves opacas, secret/service-role e projeto incorreto falham antes do `fetch`. Respostas 2xx sem `user.id` falham fechadas; mensagem, HTTP status e código são sanitizados. Após atualização confirmada, a sessão normal anterior é removida imediatamente do armazenamento local, impedindo que reapareça em um reload; nenhuma chamada global de logout/revogação é feita.

**Resultado local:** 14/14 checks unitários/VM e 4/4 checks Playwright com HTTP interceptado aprovados. O browser test cobre erro padrão do GoTrue, retry, falha de rede, isolamento de sessão antiga e reload pós-sucesso. Nenhum e-mail foi enviado e nenhuma senha real foi alterada. A recuperação ponta a ponta OWNER QA continua **BLOCKED**.

## Preflight autenticado

O preflight é somente leitura e classifica:

- `PASS`/exit 0: as provas positivas são não vazias e as sondagens exatas de recursos da outra empresa retornam vazio;
- `FAIL`/exit 1: o TEST respondeu e demonstrou defeito de contexto da empresa, permissão ou isolamento;
- `BLOCKED`/exit 2: configuração, vínculo de identidade, autenticação, rede/DNS, serviço ou fixture impede a prova.

Os 8/8 testes locais do classificador passaram, incluindo bloqueios de host/porta/chave, rede, credenciais, serviço e fixtures, além de falhas reais de contexto, grants e vazamento entre empresas. Valores, tokens, payloads e erros nativos não são emitidos. O workflow possui um job `authenticated-preflight` entre o smoke anônimo e todos os jobs autenticados. Ele testa OWNER A/B, produtos positivos, fixtures A, estoque, compra A→B e SELECT direto de `employees`/`sale_items` nos dois sentidos após confirmar rows pelas facades seguras. Um job final `qa-summary` baixa os artefatos da própria execução, exige exatamente dez relatórios TAP raiz e publica a soma observada; ele falha se houver relatório ausente, falha ou skip.

O ambiente Linux desta sessão não possui os seis bindings `QA_*` interativos, então o preflight real local permanece **BLOCKED**. Na tentativa 2 da CI #118, o GitHub environment autenticou OWNER A e B e avançou até `BLOCKED [FIXTURE_EMPLOYEE_B]`. O launcher PowerShell continua sem validação runtime nesta sessão porque não há PowerShell/Desktop Commander conectado aqui.

## GitHub Actions publicado

| Execução | SHA | Resultado verificável | Classificação |
|---|---|---|---|
| [#117](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38751480929) | `efff3ab35b05dce1802b82418100b9e84a71cf04` | build/static e API anônima PASS; preflight exit 2; oito jobs autenticados pulados; agregador incompleto | **BLOCKED**, categoria ainda não exposta na anotação original |
| [#118, tentativa 1](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497) | `0130df45852708b15ec128d3b3156551817f1197` | 12 jobs: 2 PASS, preflight bloqueado, 8 pulados pelo gate e `qa-summary` FAIL por 2/10 relatórios | **BLOCKED [AUTH_REJECTED_A]** |
| [#118, tentativa 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497) | `0130df45852708b15ec128d3b3156551817f1197` | OWNER A/B autenticados; identidade, empresa, contexto, isolamento de produtos e checks A de `employees`/`sale_items` aprovados; 2 jobs PASS, 8 pulados pelo gate e agregado incompleto | **BLOCKED [FIXTURE_EMPLOYEE_B]** |

Na tentativa 2 da #118, os dois produtores TAP executados aprovaram **59 testes**: 54 estáticos e 5 de API anônima, sem falha/skip nos próprios jobs. Esse número é parcial; o agregador registrou `INCOMPLETE`, pois os oito relatórios autenticados não foram produzidos. O `qa-summary` e o job de preflight aparecem como falhos no estado bruto do GitHub para fazer o gate falhar fechado; semanticamente, a causa é **BLOCKED por fixture B**, não uma falha comprovada de permissão, RLS ou aplicação. Antes do bloqueio, o preflight comprovou autenticação e identidade OWNER A/B, empresa/contexto de ambos, isolamento bidirecional de produtos, fixtures A de fornecedor/item/local e os caminhos seguros/diretos e negações cruzadas A de `employees` e `sale_items`. Não foram executados os checks diretos de employee B, `sale_items` B, estoque A e compra A para B.

## Verificações locais concluídas

| Verificação | Resultado observado |
|---|---|
| Suíte estática do job `build-and-security` | **54/54 PASS**, 0 falhas, 0 skips |
| Regressões focadas Cash + recovery + preflight | **28/28 PASS**, 0 falhas, 0 skips antes da consolidação final |
| Browser de recuperação interceptado | primeira execução 3 PASS/1 FAIL por fixture que reinjetava a sessão em todo reload; fixture corrigida; reexecução final **4/4 PASS** |
| Build Vite 6.4.3 | **PASS**, 1.578 módulos; aviso não bloqueante de chunk JS >500 kB |
| Workflow YAML | **PASS** no parser local |
| Sincronismo frontend | **PASS**, `App.jsx` e `src/App.jsx` byte a byte idênticos |
| Formatação/sintaxe | **PASS**, `git diff --check` e `node --check` nos runners alterados |

A falha intermediária do browser foi causada pelo próprio `addInitScript` de teste, que recolocava a sessão antiga após reload. A fixture passou a semear uma única vez via `sessionStorage`; a reexecução confirmou que o código limpa a sessão e não restaura dados do tenant.

## Dependências e segurança transversal

Nenhum `package.json` ou lockfile foi alterado. A auditoria imediatamente anterior permanece aplicável: zero vulnerabilidades runtime em `npm audit --omit=dev`; sete entradas de build/desenvolvimento (cinco altas e duas moderadas), concentradas em `braces@3.0.3` sem versão corrigida disponível e `postcss-selector-parser@6.1.4`, cuja correção exige Tailwind 4 fora do escopo compatível desta entrega. Não foi aplicado `npm audit fix --force`.

O catálogo completo implantado de 31 tabelas, 53 políticas, 50 funções e 391 grants continua **BLOCKED** sem o export somente leitura. Alertas `SECURITY DEFINER` não são classificados como vulnerabilidades sem a definição/grants que comprovem exploração.

## Pendências após publicação

1. Confirmar ou provisionar no TEST uma fixture ativa de `employees` da empresa B visível a OWNER B por `fn_read_employees_secure`, mediante processo autorizado de fixtures, e só então reexecutar o mesmo preflight. Não enfraquecer o check positivo nem registrar credenciais.
2. Mesmo após um futuro PASS, manter a migração e o P0.05 sem execução; a próxima prioridade segura é desenhar idempotência de despesas e revisar o catálogo implantado.
3. Homologar recuperação real OWNER QA com link novo, troca e login, preservando as demais contas.
4. Somente com preflight PASS e autorização específica, executar o ciclo persistente de compras com compensação e pós-verificação.
5. Criar/validar sessões independentes MANAGER e EMPLOYEE e completar a matriz real por perfil.

O candidato não representa 100% de homologação nem autorização de lançamento comercial.
