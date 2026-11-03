# C2 — provisionamento em sessão única, apenas para revisão

**NÃO EXECUTAR NESTA PREPARAÇÃO.** Nenhum seed, conexão psql real ou perda foi executado.
Este procedimento exige futura autorização específica do seed sem movimento inicial.
Não contém autorização da perda. Não usar autorização/janela C1 nem conector com pool.

## Arquivos preservados e orçamento

| Arquivo | SHA-256 dos bytes |
| --- | --- |
| [Seed revisado](../qa/stock-c2-provision-review.sql) | 6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635 |
| [Reconciliação somente leitura](../qa/stock-c2-provision-reconcile-readonly.sql) | 304361cbf214905fdd0511af9f33764606187008ea42f45524149e4878ab1fb6 |
| [Novo driver de sessão única](../qa/stock-c2-seed-same-session.psql) | d2bbdfbce05c065d2d92366d9287e9bb3d7d78c2ca70a56a0575783ba34f4bf2 |

Os dois SQLs não foram editados. O driver adiciona metacomandos/sentinelas de sessão, sem
reescrever SQL, alterar IDs/digest, retry/upsert, substitutos ou cleanup. Qualquer modificação
em qualquer arquivo requer nova revisão e novos hashes; não atualizar hash para contornar bloqueio.

Dados e efeitos continuam os da [revisão de catálogo/triggers](./QA_C2_INDEPENDENT_REVIEW_AND_PROVISION_SQL_20261102.md):

- Local ee6bd7b2-5e9d-41e6-8963-e1f178f54e09, item 475ae0c8-5a4b-45a2-ad74-1a450e553cb0,
  posição 894e85eb-eb73-42f6-a18c-4d36c0ac0113, exclusivos QA A, sem dependências/histórico.
  Nomes ZZ_QA_STOCK_C2_20261102_LOCATION e ZZ_QA_STOCK_C2_20261102_EXCLUSIVE;
  SKU ZZ_QA_C2_20261102. Quantidade 2,000, custo médio/último 0,1000.
- Uma transação e três INSERTs diretos, três linhas permanentes, zero UPDATE/DELETE/DDL,
  zero perda, auditoria, caixa ou movimento INITIAL_STOCK. Saldo importado sem ledger inicial
  exige aceite expresso. IDs explícitos, seis defaults now(), sem defaults UUID invocados.
- Um trigger de usuário revisado (supplier null, somente validação), até cinco triggers FK
  INSERT elegíveis, quatro referências não nulas e supplier null dispensado. Zero DML indireto
  de negócio sob contrato MD5 135e8025db9f8097377432b0ff26fe8c. Nove entradas de índice
  esperadas; WAL/replicação/logs/efeitos de consumidores externos não foram mensurados.
- SHARE ROW EXCLUSIVE nas três tabelas: afeta outros tenants/operadores TEST. Exige janela
  exclusiva e sem DDL. lock_timeout=2s, statement_timeout=20s dentro do seed,
  idle_in_transaction_session_timeout=30s. Não existe promessa de commit antes do prazo local.
- Seed valida empresa/OWNER, colisões/contratos e assertions finais antes do COMMIT;
  não reusa C1/B. Seus três recursos permanecem sem cleanup automático.

## Mecanismo escolhido

**Um processo psql 17, uma conexão direta TEST**, host fixo
db.msinksoilkluooxenecy.supabase.co:5432, database/role postgres, TLS verify-full com CA
previamente revisada. A conexão direta evita depender de afinidade entre chamadas de um
conector com pool. Esse endpoint pode exigir IPv6; se indisponível, parar e revisar o método,
sem trocar para pool ou outro projeto ([Supabase: conexão direta](https://supabase.com/docs/guides/database/connecting-to-postgres)).

psql -X ignora arquivos de inicialização; -W solicita senha no prompt nativo oculto;
ON_ERROR_STOP encerra o script em erro. O driver usa \ir para incluir cada arquivo uma vez,
sem \connect, \watch, \gexec, shell ou loops. Modo -f é não interativo quanto aos comandos;
perda de conexão não implica reconexão/reexecução do lote ([psql 17](https://www.postgresql.org/docs/17/app-psql.html)).
verify-full confere cadeia e hostname; exigir CA correta e hash revisto, sem degradar sslmode
([libpq TLS](https://www.postgresql.org/docs/17/libpq-ssl.html)).

Na mesma conexão, antes do seed, o driver captura pg_backend_pid, backend_start,
inet_server_addr/port, usuário/banco e pg_stat_ssl.ssl. Confere janela UTC nova com pelo menos
30s restantes, duração entre 30s e 20min e autorização pública específica do seed. Só então
define as duas GUCs de sessão que o SQL exige. Depois do COMMIT confere novamente backend,
endereço/porta e TLS e emite o recibo C2_SEED_COMMIT_RECEIPT_SAME_BACKEND_NO_LOSS_AUTHORIZATION.
Em seguida inclui apenas a reconciliação READ ONLY. O NOTICE interno anterior ao COMMIT não
substitui esse recibo. Falha no pós-check não desfaz um COMMIT possivelmente concluído.

O orçamento de **uma transação de gravação/3 INSERTs** pertence ao seed. O driver acrescenta
três SELECTs fora dessa transação: admissão, configuração de três GUCs de sessão e pós-check
do backend. São transações implícitas sem DML de negócio. A reconciliação abre outra transação
explícita READ ONLY. Nenhum desses controles acrescenta linha de estoque, movimento ou auditoria.

Host/TLS/CA e credenciais verificam a conexão externa; GUC, nome do banco e IDs sozinhos não
autenticam o projeto. GUCs são interlocks públicos, não assinatura nem permissão humana.
PID/backend_start são sentinelas operacionais, não prova criptográfica contra administrador.

## Sequência futura exata — manter parada até autorização

1. Revisar SHA final QA/CI, hashes acima, psql 17 local e sua origem, CA do TEST e seu SHA-256.
   Confirmar nova janela exclusiva sem DDL/outros operadores e que a fixture ainda não existe.
   Receber autorização citando TEST, IDs, SQL/hash, **três INSERTs e seed sem movimento inicial**,
   2,000/custo 0,1000, locks/resíduos e proibição de retry/cleanup. Não pedir/usar autorização
   da perda nessa etapa. Caminhos/hash da CA, binário e janela são campos de revisão futura;
   não estão preenchidos nem autorizados por este documento.
2. Usar console dedicado novo, sem transcript/PSDebug e com a QA limpa no SHA revisado.
   O operador preenche somente valores públicos revistos (caminhos, hashes, SHA/janela) e
   confirmação de autorização específica. Senha somente no prompt nativo -W, nunca em URI,
   variável PGPASSWORD, arquivo, histórico, chat ou argumento. Não exportar credencial C2 antiga.
3. Em console dedicado, limpar overrides libpq do processo, sem imprimir valores, e fixar TLS:

```powershell
# Bloco PARA REVISÃO; depende das variáveis públicas preenchidas/revistas na etapa 1.
$ErrorActionPreference='Stop'
Set-PSDebug -Off
if($SeedApproval -cne 'TEST_ONLY_THREE_ROW_SEED_WITHOUT_INITIAL_MOVEMENT_20261102'){throw 'C2_SEED_APPROVAL_REQUIRED'}
$seedBranch=git branch --show-current
if($LASTEXITCODE -ne 0 -or $seedBranch -cne 'automation/nexalvo-qa-actions'){throw 'C2_QA_BRANCH_REQUIRED'}
$seedStatus=git status --porcelain
if($LASTEXITCODE -ne 0 -or $seedStatus){throw 'C2_CLEAN_QA_REQUIRED'}
$seedHead=git rev-parse HEAD
if($LASTEXITCODE -ne 0 -or $seedHead -cne $ReviewedHead){throw 'C2_REVIEWED_HEAD_REQUIRED'}
$qaRoot=(Resolve-Path -LiteralPath '.').Path
$driver=Join-Path $qaRoot 'qa/stock-c2-seed-same-session.psql'
$seed=Join-Path $qaRoot 'qa/stock-c2-provision-review.sql'
$reconcile=Join-Path $qaRoot 'qa/stock-c2-provision-reconcile-readonly.sql'
if((Get-FileHash -LiteralPath $seed -Algorithm SHA256).Hash.ToLowerInvariant() -cne '6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635'){throw 'C2_SEED_BYTES_CHANGED'}
if((Get-FileHash -LiteralPath $reconcile -Algorithm SHA256).Hash.ToLowerInvariant() -cne '304361cbf214905fdd0511af9f33764606187008ea42f45524149e4878ab1fb6'){throw 'C2_RECONCILE_BYTES_CHANGED'}
if((Get-FileHash -LiteralPath $driver -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'd2bbdfbce05c065d2d92366d9287e9bb3d7d78c2ca70a56a0575783ba34f4bf2'){throw 'C2_DRIVER_BYTES_CHANGED'}
if((Get-FileHash -LiteralPath $ReviewedCaPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ReviewedCaSha256){throw 'C2_CA_REVIEW_REQUIRED'}
if((Get-FileHash -LiteralPath $ReviewedPsql17Exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ReviewedPsqlSha256){throw 'C2_PSQL_REVIEW_REQUIRED'}
if((& $ReviewedPsql17Exe --version) -notmatch '^psql \(PostgreSQL\) 17\.'){throw 'C2_PSQL17_REQUIRED'}
Get-ChildItem Env: | Where-Object {$_.Name.StartsWith('PG') -or $_.Name.StartsWith('PSQL')} | ForEach-Object {[Environment]::SetEnvironmentVariable($_.Name,$null,'Process')}
$env:PGSSLMODE='verify-full'
$env:PGSSLROOTCERT=$ReviewedCaPath
$env:PGGSSENCMODE='disable'
$env:PGCONNECT_TIMEOUT='10'
$env:PGAPPNAME='nexalvo-c2-seed-reviewed-once'
$env:QA_C2_SEED_AUTHORIZED=$SeedApproval
$env:QA_C2_SEED_VERIFIED_PROJECT_REF='msinksoilkluooxenecy'
$env:QA_C2_SEED_EXCLUSIVE_AT=$ReviewedWindowAtUtc
$env:QA_C2_SEED_EXCLUSIVE_UNTIL=$ReviewedWindowUntilUtc
```

4. **Antes de invocar psql**, criar marcador permanente exclusivo da tentativa no mesmo
   notebook/identidade, gravar somente os dados públicos de revisão e Flush(true). Se existir,
   parar; nunca apagar/trocar TEMP/máquina ou criar marcador substituto para reenviar.

```powershell
$marker=Join-Path ([IO.Path]::GetTempPath()) 'nexalvo-stock-c2-seed-475ae0c8-5a4b-45a2-ad74-1a450e553cb0.once'
$record=@{scope='C2_SEED_ATTEMPT_NO_REPLAY';head=$ReviewedHead;seed_sha256='6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635';driver_sha256='d2bbdfbce05c065d2d92366d9287e9bb3d7d78c2ca70a56a0575783ba34f4bf2';at_utc=[DateTimeOffset]::UtcNow.ToString('o')} | ConvertTo-Json -Compress
$stream=[IO.File]::Open($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try{$bytes=[Text.Encoding]::UTF8.GetBytes($record);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
# Uma única invocação nativa. Não usar -1/--single-transaction: o SQL já tem BEGIN/COMMIT.
& $ReviewedPsql17Exe -X -W -h db.msinksoilkluooxenecy.supabase.co -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $driver
$seedExit=$LASTEXITCODE
# Preservar marcador/saída sanitizada mesmo em erro; não repetir este bloco.
```

Criar marcador e depois falhar antes da conexão/prompt também consome essa tentativa local.
Marcador é barreira operacional, sem assinatura, fsync de diretório Windows ou defesa contra
administrador local. Os blocos acima são um procedimento para revisão, não launcher instalado
ou ensaio nativo psql. O driver tem apenas teste estático e os SQLs têm testes locais PGlite.

5. Registrar exit, recibo de COMMIT, identificação pública de backend, hashes e reconciliação.
   Exit 0 só é aceite do seed se o recibo e SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION conferirem.
   Nenhum deles autoriza perda. Se qualquer etapa falhar, não retomar o driver.

## Resposta incerta — sessão separada exclusivamente para leitura

Timeout, interrupção, exit não zero, COMMIT sem recibo ou reconciliação divergente/ausente:
**parar, manter marcador e não reenviar**. Ausência no snapshot não prova rollback/fim do backend.
Não repetir o driver para obter recibo. Verificar o backend original somente por leitura.

Em nova conexão direta TEST verificada, com o mesmo TLS/CA e sem GUC de autorização do seed,
executar somente a reconciliação congelada (não o driver):

```powershell
# Somente investigação posterior autorizada; nunca junto de novo seed.
Remove-Item Env:QA_C2_SEED_AUTHORIZED -ErrorAction SilentlyContinue
& $ReviewedPsql17Exe -X -W -h db.msinksoilkluooxenecy.supabase.co -p 5432 -U postgres -d postgres -v ON_ERROR_STOP=1 -f $reconcile
```

O arquivo abre REPEATABLE READ READ ONLY e retorna ABSENT_UNCONFIRMED_NO_RETRY,
SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION ou DIVERGENT_STOP_MANUAL_REVIEW. São observações;
nenhum resultado habilita retry, upsert, IDs alternativos, reposição ou cleanup. Depois de
fixture confirmada ainda faltam revisão de segurança atual, preflight autenticado PASS e
autorização separada da perda, vinculada ao SHA validado/janela/baseline e orçamento 1+1.
