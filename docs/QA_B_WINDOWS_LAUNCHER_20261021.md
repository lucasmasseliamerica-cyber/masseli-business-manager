# B #1253 — inicializador Windows da recuperação somente leitura

**Estado vigente:** B #1253 concluída por conciliação de 14 checks originais e três da recuperação real: **17/17 PASS**. Ver [fechamento B](./QA_B_CLOSURE_20261021.md) e [matriz atual](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md): **16/60 (26,67%)**. Não repetir venda/estorno/compensação/recuperação; instruções de execução abaixo são históricas. C/D/E seguem sem autorização persistente.

Somente `automation/nexalvo-qa-actions` e TEST `msinksoilkluooxenecy`.
**Nenhuma nova venda, compensação, alteração de auditoria ou escrita no TEST está autorizada nesta etapa.**

## Diagnóstico e correções

O Windows informou `WINDOWS_SALE_RUNNER_BLOCKED` antes dos prompts. O checkpoint original,
sua hash, Git, catálogo, Node, Playwright, mutex e ACL isolada foram verificados pelo usuário.
Sem acesso ao notebook nesta sessão, não foi possível atribuir a exceção original a uma dessas
etapas. A mensagem anterior descartava essa distinção.

O inicializador agora retorna apenas códigos fixos e a etapa correspondente. Não publica a
mensagem da exceção, ErrorRecord, caminho privado, SID, conteúdo do checkpoint ou credenciais.

- Recuperação e preflight não instalam Playwright/Chromium nem executam npm: não usam navegador.
- Caminho existente: normalização literal, limite real de TEMP, nome privado, arquivo esperado
  e rejeição de junction/reparse point em toda a cadeia. Espaços e colchetes são suportados.
- Pasta/checkpoint existentes: verifica proprietário, proteção da pasta e acesso exclusivo do
  usuário atual, **sem reaplicar ACL**. ACL insegura bloqueia antes das credenciais.
  A pasta deve pertencer ao usuário atual. O arquivo também pode ter o proprietário padrão do
  próprio token Windows, necessário para arquivos criados sob elevação; isso não concede acesso
  a outros SIDs e não aceita proprietários arbitrários.
- SHA-256 do checkpoint é conferido antes/depois da inspeção, inclusive nas falhas posteriores.
  Nenhum caminho ou hash é impresso pelo diagnóstico do launcher.
- Executáveis são resolvidos uma única vez; stderr nativo é descartado e exit codes classificados,
  incluindo Windows PowerShell 5.1. Mutex usa uma barra e é liberado no finally.
- Prompts ocultos, BSTR zerado, variáveis do processo restauradas e destino TEST fixo preservados.
- `-ValidateLauncherOnly` exige `-ReadOnlyRecovery` e checkpoint. Valida apenas o launcher local,
  não solicita credenciais e não inicia o Node executor nem faz chamadas ao Supabase.

A primeira CI do pacote (#199) encontrou falhas nos testes nativos. O resolvedor podia retornar
várias aplicações no PATH, causando `WINDOWS_SALE_GIT_BLOCKED`; o problema foi reproduzido
localmente e recebeu regressão. A asserção de sigilo também tratava o código legítimo PRIVATE_ACL
como caminho privado. O teste de junction passou a usar alvo sintético sem caracteres especiais;
o caminho literal com espaços/colchetes continua coberto separadamente.
Na CI #200, arquivos sintéticos criados sob token elevado foram bloqueados pelo proprietário
padrão do Windows. A validação foi corrigida preservando a ACL exclusiva; as mesmas recuperações
locais passaram nos dois engines na CI #201. O teste de nome inválido usa um arquivo sintético
existente para conferir deterministicamente o guard RECOVERY_CHECKPOINT_REQUIRED.
Esses achados não provam a causa do bloqueio original no notebook.

## Evidências

Código do pacote: `3327840f4e45f1358446908f3beac0e53887a1b0` e
`516b0060fc3fb2bc80e18b444e72b4812e5142ea`, ACL em
`b598b422da9c76597d460817adcba7fdfc596c5d` e relatórios portáveis em
**`032fa87fcbb79863da4c043a4008e45ac90d15b6`**.
[Resultados locais](./evidence/sale-b-windows-launcher-local-20261021.json): **41/41 PASS**,
zero falhas/skips; build PASS; três arquivos PowerShell sem erros de sintaxe.
Verificações de helpers no PowerShell Linux não substituem execução Windows.

A CI #201 aprovou os testes dos dois engines; o agregador falhou porque WriteAllLines produziu
CRLF no Windows, incompatível com o leitor TAP estrito Linux. A saída agora é UTF-8/LF explícito,
sem enfraquecer o agregador ou omitir testes. [CI #202](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39635483262)
**680/680 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes
BLOCKED/ignorados pelo gate**. [Evidência sanitizada](./evidence/sale-b-windows-launcher-ci-202-20261021.json).
PowerShell 5.1 e 7: **11/11 PASS em cada engine**, 22 regressões nativas no total.
**SHA aprovado para execução Windows: `032fa87fcbb79863da4c043a4008e45ac90d15b6`.**
Suite Windows dedicada não recebe secrets, não usa Environment nexalvo-test nem acessa Supabase.
Cria somente arquivos sintéticos em TEMP; valida pasta existente, ACLs/bytes inalterados, segunda
execução/mutex, erros nativos, PATH duplicado, ACLs inseguras e rejeição de junction.

## Comando para a mesma recuperação

Preservar alterações locais e sincronizar a QA sem reset/force push. Confirmar árvore limpa e
ancestralidade do SHA aprovado. Reutilizar catálogo original preparado, válido por 24 horas.
Não editar/copiar/substituir o checkpoint original nem redefinir sua fase. Não executar a jornada
normal, `-PreflightOnly` ou `-RecoveryFile` sem `-ReadOnlyRecovery`.

Após aprovação da CI, usar no notebook:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
$validatedSha = '032fa87fcbb79863da4c043a4008e45ac90d15b6'
$recoveryFile = Read-Host 'Caminho privado do sale-recovery.json ORIGINAL da venda #1253'
$beforeHash = (Get-FileHash -LiteralPath $recoveryFile -Algorithm SHA256).Hash
$recoveryArgs = @{
  ValidatedCodeSha = $validatedSha
  FixtureProductId = '5ba917cd-362b-42f5-83f6-345fb3dccddf'
  LocationId = 'a3e4b2ed-eb00-4963-afd0-38c256aff87d'
  CatalogFile = (Join-Path $env:TEMP 'nexalvo-b-catalog.json')
  ExclusiveWindowConfirmed = $true
  RecoveryFile = $recoveryFile
  ReadOnlyRecovery = $true
}
# Etapa local: sem credenciais, navegador ou rede. Exigir READONLY_LAUNCHER_READY.
.\qa\Invoke-QaSaleJourney.ps1 @recoveryArgs -ValidateLauncherOnly
if ($LASTEXITCODE -ne 0) { throw 'LOCAL_LAUNCHER_BLOCKED_STOP' }
if ((Get-FileHash -LiteralPath $recoveryFile -Algorithm SHA256).Hash -ne $beforeHash) {
  throw 'CHECKPOINT_CHANGED_STOP'
}
# Mesma execução original: exclusivamente leitura; credenciais em prompts ocultos.
.\qa\Invoke-QaSaleJourney.ps1 @recoveryArgs
if ((Get-FileHash -LiteralPath $recoveryFile -Algorithm SHA256).Hash -ne $beforeHash) {
  throw 'CHECKPOINT_CHANGED_STOP'
}
```

Executar em console sem transcript, depuração ou captura de credenciais. Não publicar o caminho,
checkpoint bruto, senhas ou tokens. Para um bloqueio do launcher, compartilhar somente
`scope/status/code/stage`. Não tentar contornar gates ou reaplicar ACL ao checkpoint histórico.

| Etapa | Código de diagnóstico para exceção não classificada |
| --- | --- |
| BOOTSTRAP / GIT / MODE / CATALOG | WINDOWS_SALE_BOOTSTRAP_BLOCKED / WINDOWS_SALE_GIT_BLOCKED / WINDOWS_SALE_MODE_BLOCKED / WINDOWS_SALE_CATALOG_BLOCKED |
| NODE / MUTEX / CHECKPOINT_SCAN / DEPENDENCIES | WINDOWS_SALE_NODE_BLOCKED / WINDOWS_SALE_MUTEX_BLOCKED / WINDOWS_SALE_CHECKPOINT_SCAN_BLOCKED / WINDOWS_SALE_DEPENDENCIES_BLOCKED |
| PRIVATE_PATH / PRIVATE_ACL / CHECKPOINT_HASH | WINDOWS_SALE_PRIVATE_PATH_BLOCKED / WINDOWS_SALE_PRIVATE_ACL_BLOCKED / WINDOWS_SALE_CHECKPOINT_HASH_BLOCKED |
| CREDENTIALS / RUNNER_ENV / RUNNER / REPORT | WINDOWS_SALE_CREDENTIALS_BLOCKED / WINDOWS_SALE_RUNNER_ENV_BLOCKED / WINDOWS_SALE_RUNNER_START_BLOCKED / WINDOWS_SALE_REPORT_BLOCKED |
| CHECKPOINT_VERIFY / CLEANUP | WINDOWS_SALE_CHECKPOINT_VERIFY_BLOCKED / WINDOWS_SALE_CLEANUP_BLOCKED |

Guards conhecidos também preservam códigos fixos, por exemplo PRIVATE_DIRECTORY_ACL_UNSAFE,
PRIVATE_CHECKPOINT_ACL_UNSAFE, PRIVATE_REPARSE_POINT_FORBIDDEN, RECOVERY_CHECKPOINT_CHANGED
e UNVALIDATED_CODE_CHANGES. Não se extrai código da mensagem arbitrária de exceção.

## O que ainda não está aprovado

O PASS de ValidateLauncherOnly prova somente pré-requisitos locais do launcher, não a venda.
A [inspeção somente leitura](./QA_B_AUDIT_RECOVERY_20261021.md) ainda precisa conferir #1253
no notebook. Mesmo com recovery_status=PASS, restored=true e checkpoint_unchanged, o resultado
global esperado permanece BLOCKED/exit 2: READONLY_CANCELLED_SALE_CONFIRMED_NOT_FULL_HOMOLOGATION.
Os 17 critérios B originais, UI/replay/isolamento e evidências precisam ser conferidos em conjunto.

Cobertura operacional preservada: **14/60 (23,33%)**, 15 pendentes e 31 bloqueados. Nenhum novo
critério real foi aprovado por esta correção. O checkpoint Windows original não foi acessado
por esta sessão. Produção, main, histórico, estoque e financeiro não receberam alterações.
