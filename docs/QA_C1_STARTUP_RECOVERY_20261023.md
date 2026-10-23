# C1 — inicialização e recuperação somente leitura (23/10/2026)

Branch exclusiva `automation/nexalvo-qa-actions`; TEST `msinksoilkluooxenecy`.
**Não executar C1, sondagens, ajustes, transferências, perdas, auditorias ou compensações.**
O checkpoint original permanece obrigatório e nunca pode ser removido, regravado ou substituído.
A/B, main, produção, fixtures, saldos e histórico preservados.

## Diagnóstico e limites

O usuário confirmou o código original **C1_EXECUTION_UNCONFIRMED**, fase PROBES_CONFIRMED,
pending=null, confirmed=0, operations=0, duas sondagens B/anon e zero requisições de
estoque/auditoria. Informou leitura SQL independente: SOURCE=2,000; TARGET=2,000;
custos médios=0,1000/0,1000; zero movimentações e perdas. São evidências reais informadas,
não observações diretas desta sessão. Não recebemos o checkpoint nem exceção interna.

O código genérico não distingue importação Playwright, Chromium, processo Vite, contexto,
sessão, navegação ou interface. **A causa específica do Windows continua não demonstrada.**

A revisão do HEAD histórico encontrou:

- O launcher validava o executável Chromium regular, mas o launch headless sem executablePath
  explícito podia escolher outro binário, o headless shell. A divergência foi reproduzida com
  cache isolado; ela é compatível com o código genérico, sem provar que ocorreu no notebook.
- O polling antigo **já capturava ECONNREFUSED**. A hipótese inicial de escape na primeira
  conexão foi descartada pela leitura do código. O teste preserva esse tratamento, sem
  apresentar uma versão hipotética sem catch como reprodução do histórico.
- As requisições do polling não tinham timeout individual; HTTP200 não comprovava propriedade
  do servidor; faltava diagnóstico de spawn/exit e etapas do navegador. São lacunas corrigidas,
  não prova isolada da causa histórica.

## Correções entregues

1. O resolver usado pelo launcher e pelo runtime valida o mesmo executável absoluto e regular;
   o launch recebe explicitamente esse caminho, com timeout. Não instala dependências.
2. Porta TCP 4189 ocupada bloqueia inclusive serviço não HTTP. Nenhum processo alheio é encerrado.
3. Vite próprio, loopback/strictPort, saúde com nonce aleatório e processo vivo; uma página
   alheia HTTP200 não libera o gate. Readiness máximo 20s, cada tentativa máximo 1s.
4. Importação, porta, spawn, saída, readiness, Chromium e etapas UI têm códigos/enums fixos.
   Diagnóstico exporta apenas stage/reason/port/exit_code; NTSTATUS Windows vira null quando
   fora de 0..255. Nenhum caminho, mensagem upstream, stack, token, sessão ou nonce é publicado.
5. Vite/Chromium recebem ambiente permitido: sem senhas QA, sessões, chaves administrativas
   ou NODE_OPTIONS. O filho Vite recebe somente configuração pública TEST e nonce interno.
6. Runtime validado **antes de criar checkpoint e enviar sondagens** em uma futura execução
   autorizada. Falha encerra somente os processos próprios, sem retry de operação persistente.
7. Recuperação de confirmed=0/pending=null/operations=0 verifica integralmente snapshot,
   duas posições, custos, metadados, dependências, perdas, movimentos e auditorias anteriores.
   Retorna `C1_BASELINE_CONFIRMED_NO_STOCK_OPERATIONS_NOT_FULL_HOMOLOGATION` somente se coincidir.
   Flags: baseline_unchanged=true, restored=false, restoration_performed=false,
   full_homologation=false; UI, ciclo, restauração e novas auditorias permanecem BLOCKED.
8. A recuperação verifica hash/bytes originais, não inicia Vite/Chromium, não repete sondagens,
   não cria lock de execução nem grava checkpoint. Sondagem DISPATCHED ou drift bloqueiam.
9. Diagnóstico local opcional separado `qa/stock-c1-runtime-readonly.TEST.mjs`: inicia apenas
   Vite/Chromium locais com chave pública fictícia; não autentica, navega fixtures ou abre
   checkpoint. Rejeita quaisquer argumentos de execução/recuperação. PASS não homologa C1.

## Validação local e publicação

Código de runtime/recuperação: **93432df1e745e8db88cb17145d05e87e62ed3f90**.
Correção Windows e SHA final: **e28a317e00062da16363a22f1f1cf53e15e6815c**.
[CI #215](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39958446001):
**PASS — 827/827 verificações TAP, zero FAIL/SKIP nos testes executados; 9 jobs PASS e4 persistentes BLOCKED pelo gate.**
Windows PS5.1/7 (launchers sintéticos), browser, preflight autenticado PASS [OK], acesso e lifecycle passaram.
Contagem extraída da anotação real do agregador job120431370584; SHA do código confirmado.
[Evidência CI215](./evidence/stock-c1-startup-ci-215-20261023.json), [CI214 falha preservada](./evidence/stock-c1-startup-ci-214-20261023.json) e [evidência consolidada](./evidence/stock-c1-startup-recovery-20261023.json).

Histórico preservado: [CI #214](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39887773364)
**FAIL — 798/826 PASS, 28 FAIL, zero skips nos testes executados**; falha de checkout Windows
causada pela colisão de nomes. Quatro grupos persistentes permaneceram BLOCKED; não contam como PASS.

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Suite completa estática/SQL descartável | PASS 572/572; 0 FAIL/SKIP, 48 módulos | TAP local, incluindo 34 casos C1 e 19 runtime; subconjuntos não somados novamente |
| Navegador local React/HTTP interceptado | PASS 29/29; 0 FAIL/SKIP | Três módulos; inclui Vite+Chromium reais, login sem autenticação e porta liberada |
| Build final | PASS | Vite6.4.4; nenhuma publicação |
| Parser PowerShell e sintaxe Node | PASS | Launcher, runner, diagnóstico local e filho Vite; PS5.1/7 nativos aprovados na CI com arquivos sintéticos; checkpoint original não acessado |
| Parse das duas Edge Functions | PASS | esbuild, sem deploy |
| Auditoria npm runtime | PASS, zero alertas | Relatório completo válido |
| Auditoria npm completa | PENDENTE: sete alertas conhecidos | Cinco altos/dois moderados, somente build/dev; política de teto PASS, sem alegar correção |
| Varredura de segredos/diff | PASS | Arquivos alterados; nenhum JSON/checkpoint bruto versionado |
| Revisão independente | APROVADO para regressão/CI | Recuperação sem escrita/promoção de ciclo, ordenação e sanitização revisadas |
| Recuperação original autenticada | BLOCKED nesta sessão | Sem Desktop Commander/sessões QA; não executada nem inferida dos mocks |
| C1 persistente completa | BLOCKED | Nenhuma nova tentativa autorizada; UI/ciclo/histórico ainda não homologados |

A CI #214 encontrou colisão entre `stock-c1-runtime-readonly.TEST.mjs` e o teste homônimo
com extensão minúscula. O checkout Windows colapsava os caminhos e os launchers bloqueavam
corretamente com CLEAN_QA_WORKTREE_REQUIRED. A regressão foi renomeada para
`stock-c1-runtime-readonly-regression.test.mjs`; um novo teste global de colisões reproduziu
a falha antes da correção e passou depois, sem relaxar o guard. O executável também foi
atualizado para materializar seu conteúdo em sincronizações vindas do commit anterior.
Após pull, exigir árvore limpa; se houver alterações, preservar e interromper, sem reset.

A primeira regressão completa identificou uma variável administrativa sentinela escrita
literalmente no teste de ambiente, proibida pela política estática do repositório. O teste foi
ajustado para uma sentinela sintética não reservada, sem enfraquecer a política. Suite final
572/572 aprovada. A primeira auditoria npm, com ambiente mínimo sem certificados de rede,
foi BLOCKED; a repetição preservando configuração existente de proxy/certificados produziu
relatórios completos. Não desabilitamos TLS nem interpretamos erro como zero alertas.

## Notebook — somente comandos indispensáveis de recuperação

Não transcrever terminal, exibir checkpoint ou enviar credenciais. Usar prompts ocultos do
launcher e somente contas QA existentes/chave pública TEST. Não usar credencial administrativa.
O catálogo deve ter no máximo 24h e conter contratos de auditoria/leitor seguro já aprovados.
Se estiver vencido, executar somente o SQL existente
`qa/sql/stock_journey_preflight_readonly_TEST.sql` no TEST e salvar resultado no TEMP como
`nexalvo-c1-catalog.json`. Não executar SQL de escrita ou alterar hashes manualmente.

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
if ((git branch --show-current) -ne 'automation/nexalvo-qa-actions' -or (git status --porcelain)) {
    throw 'QA_LIMPA_OBRIGATORIA_PRESERVE_ALTERACOES'
}
git pull --ff-only origin automation/nexalvo-qa-actions
if ($LASTEXITCODE -ne 0) { throw 'SINCRONIZACAO_BLOQUEADA_SEM_RESET' }
$expectedCheckpointHash = Read-Host 'SHA-256 ORIGINAL do checkpoint no relatorio sanitizado'
if ($expectedCheckpointHash -notmatch '^[0-9A-Fa-f]{64}$') { throw 'HASH_ORIGINAL_OBRIGATORIO' }
$matchesC1 = @(Get-ChildItem -LiteralPath $env:TEMP -Directory -Filter 'nexalvo-stock-c1-*' |
    ForEach-Object { Join-Path $_.FullName 'stock-recovery.json' } |
    Where-Object { (Test-Path -LiteralPath $_ -PathType Leaf) -and
        (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash -eq $expectedCheckpointHash })
if ($matchesC1.Count -ne 1) { throw 'CHECKPOINT_ORIGINAL_UNICO_OBRIGATORIO' }
$c1Checkpoint = $matchesC1[0]
.\qa\Invoke-QaStockJourney.ps1 `
    -ValidatedCodeSha 'e28a317e00062da16363a22f1f1cf53e15e6815c' `
    -CatalogFile (Join-Path $env:TEMP 'nexalvo-c1-catalog.json') `
    -ReadOnlyRecovery -RecoveryFile $c1Checkpoint
$c1RecoveryExit = $LASTEXITCODE
if ((Get-FileHash -LiteralPath $c1Checkpoint -Algorithm SHA256).Hash -ne $expectedCheckpointHash) {
    throw 'CHECKPOINT_ALTERADO_INTERROMPER'
}
if ($c1RecoveryExit -ne 0) { throw 'RECUPERACAO_BLOCKED_PRESERVE_CHECKPOINT' }
```

Selecionar por hash original confiável, nunca por data/arquivo mais recente; zero ou vários
resultados bloqueiam. Não alterar ACLs, copiar/renomear/remover checkpoint ou ignorar erro.
O launcher valida TEMP, links, ACL somente leitura e checksum antes/depois; solicita credenciais
somente de forma oculta em memória e restaura o ambiente. Não enviar o arquivo pelo chat.

Após a recuperação, opcionalmente diagnosticar **somente** o runtime local, sem credenciais:

```powershell
node qa/stock-c1-runtime-readonly.TEST.mjs
```

Retornar apenas JSON sanitizado da recuperação e, se executado, do diagnóstico local.
Nenhum comando acima autoriza/reinicia C1, repete probes ou restaura saldos. Um diagnóstico
atual bem-sucedido não revela retroativamente a exceção original.

## Integridade, pendências e próximo gate

- Informado pelo usuário: duas sondagens negadas, nenhum pedido de estoque/auditoria,
  snapshot intacto, saldos 2/2 e custos 0,1/0,1; não há compensação a executar por presunção.
- Nesta sessão: zero novas operações C1, nenhum acesso ao checkpoint original, nenhuma
  alteração TEST, migração, deploy ou mudança em main/produção.
- Pendente: leitura autenticada do checkpoint original e diagnóstico do runtime no Windows.
  Esta sessão não possui Desktop Commander; isso não implica notebook indisponível globalmente.
- C1 continua BLOCKED; nenhuma retomada persistente ou remoção de checkpoint está liberada.
- Macro **16/60 (26,67%)**, 15 PENDENTES e29 BLOQUEADOS; A/B preservadas, B 17/17.
- Depois das evidências de leitura, revisar decisão/autorização específica antes de qualquer
  novo plano persistente. C2/perdas, compras, financeiro, perfis reais e demais jornadas seguem
  seus próprios gates; comercialização automática/Stripe permanecem congelados.
