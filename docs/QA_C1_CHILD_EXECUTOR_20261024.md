# C1 — executor filho dedicado (24/10/2026)

Branch exclusiva `automation/nexalvo-qa-actions`; projeto TEST `msinksoilkluooxenecy`.
Este pacote não autoriza execução persistente. Recuperação do pai encerrada como PASS;
jornadas A/B preservadas. O ciclo C1 real permanece BLOCKED até todos os gates atuais
e uma autorização específica. CI, Chromium interceptado e PostgreSQL descartável não
homologam movimentações reais.

## Implementação e oito gates

O launcher dedicado é `qa/Invoke-QaStockC1Child.ps1`; o executor é
`qa/stock-c1-child.TEST.mjs`. O launcher normal não é usado para continuação.
Não existem modos de replay, resume, segundo filho ou compensação automática.

| Gate | Controle implementado |
| --- | --- |
| Integridade do pai | SHA-256 original confiável, envelope, fase PROBES_CONFIRMED, pending=null, confirmed=0, zero operações, sondagens B/anon DENIED; bytes, metadados, ACL e caminho privado preservados |
| Identidade/permissões atuais | Novas sessões OWNER A/B existentes; empresas, perfis, permissões e isolamento de leitura; nenhuma service_role substitui usuário |
| Segurança vigente | Catálogo de estoque e captura complementar de 12 funções, 13 tabelas, colunas, políticas, triggers e privilégios efetivos; digest de revisão independente obrigatório |
| Baseline inalterada | Fixture completa comparada ao pai, quantidades 2/2, custos 0,1/0,1, timestamps, vínculos e histórico; nova leitura após estabilização e antes do envio |
| Janela exclusiva | Confirmação operacional, mutex Windows, prazo imutável de no máximo 30 minutos incluindo prompts; prazo conferido também depois do fsync |
| Único filho | Reserva privada exclusiva e durável por SHA do pai, permanente mesmo após falha parcial; um único filho separado, sem alterar o pai |
| Intenção durável | Movimento/auditoria pendente gravado e sincronizado antes de cada envio; recibos e reconciliação antes do próximo passo |
| Autorização específica | Token novo mais vinculação explícita ao SHA de código aprovado e hash original do pai; não herda autorização C1 anterior |

O preflight somente leitura pode retornar PASS de seus próprios checks e mantém
autorização/janela/reserva/intenção BLOCKED. Nunca equivale ao aceite do ciclo.
Somente a execução futura comprovada poderá aprovar os 18 checks C1 e os oito gates.

## Reserva, falhas e recuperação

O registro fixo é `%TEMP%\nexalvo-stock-c1-child-registry`. Não mudar TEMP, copiar o pai,
trocar de máquina ou apagar arquivos para contornar uma reserva. A exclusividade é local;
depende de janela operacional sem outro ator sobre a fixture, não de lock distribuído.
Um administrador do próprio notebook pode adulterar arquivos; o registro não promete
proteção contra esse ator. Checkpoints e catálogo não são assinaturas de servidor.

A reserva `<hash-pai>.reservation.json` precede `<hash-pai>.child.json`. Escrita intermediária
`.next`, reserva parcial, colisão, perda de resposta ou divergência interrompem o ciclo.
Nenhum desses arquivos é apagado pelo executor. Sem recibo conhecido não há reenvio.
As RPCs atuais não fornecem idempotência de servidor para este ciclo. Uma interrupção pode
deixar a fixture em saldo intermediário; o orçamento não autoriza correção adicional.

A recuperação do filho só consulta e compara. Preserva inclusive a intenção pendente;
não salva estado, libera reserva ou habilita retomada. Um movimento confirmado por leitura
após timeout pode ser identificado sem autorizar o seguinte. Ausência de efeito não prova
rollback de um pedido incerto. Eventual correção de saldo exige análise e autorização próprias.

## Orçamento persistente proposto — ainda não autorizado

Usar somente a fixture C1 existente, definida em `qa/stock-c1-protocol.mjs` e vinculada ao pai:
item `6ebfef52-f6c2-4561-b2ac-b3d4bfca1c5f`, SOURCE
`f06c0bdd-8c55-4dc2-93b3-5ffcc085206f`, TARGET `d524ae32-48b8-497c-a2ab-9b4777c44f6d`.
Nome `ZZ_QA_STOCK_C_20261022_EXCLUSIVE`. Esses IDs de fixtures não são credenciais.

| Passo | Operação única | SOURCE / TARGET esperados |
| --- | --- | --- |
| 1 | Ajuste SOURCE +0,125 (contagem 2,125) | 2,125 / 2,000 |
| 2 | Transferência SOURCE→TARGET 0,500 | 1,625 / 2,500 |
| 3 | Transferência TARGET→SOURCE 0,500 | 2,125 / 2,000 |
| 4 | Ajuste SOURCE −0,125 (contagem 2,000) | 2,000 / 2,000 |

Limites: **4 RPCs de estoque +4 RPCs de auditoria, 6 movimentos, 4 auditorias, zero sondagens
repetidas**. Leituras de reconciliação e helpers comprovadamente somente leitura não integram
esse orçamento de mutação. Zero perdas, vendas, compras, despesas, caixa, usuários e migrações.
Custos médios finais 0,1000/0,1000. Passos 3/4 são parte do ciclo normal; nunca compensação
automática após falha. Parar definitivamente em resultado incerto, preservar pai/filho e
efetuar apenas recuperação somente leitura.

## Revisão de segurança e defeitos corrigidos

- Janela podia expirar durante a persistência da intenção: gate repetido após fsync e antes
  do encaminhamento; teste confirma zero envios e intenção conservada.
- Auditoria histórica com texto idêntico podia ser escolhida como recibo novo: exige ID ausente
  do snapshot, empresa/autor corretos e reconciliação de cardinalidade antes de gravar o recibo.
- Falha ao salvar confirmação após limpar pending em memória: consulta também intenção durável;
  resultado fica BLOCKED e exige recuperação, sem replay.
- Mudança de pai/filho durante encerramento não pode deixar um PASS já calculado: verificação
  final cobre o comando inteiro e rebaixa o resultado, inclusive após logout.
- TEMP Windows pode usar alias 8.3: verifica links em cada ancestral antes de normalizar a
  comparação com a raiz; não transforma um junction em caminho aceito.
- `fn_session_access_status` é POST permitido de leitura. Seu corpo, retorno, ACL, linguagem,
  volatilidade e search_path foram fixados ao contrato versionado; não se presume leitura pelo nome.
- Artefatos TAP Windows passaram a usar globs sem sobreposição; agregador exige os 14 relatórios
  não persistentes. Quatro grupos persistentes continuam BLOCKED por padrão; CI não executa filho.

Riscos condicionais: grants TRUNCATE/TRIGGER e memberships de API são capturados para revisão
de contexto, sem classificá-los automaticamente como exploração via REST. Funções/trigger bodies
divergentes precisam de export e revisão antes de aceitar novo digest. Não ampliar ACL/RLS.

As CIs #223/#224 encontraram duas falhas reais do mesmo teste sintético (PS5.1/7):
998/1000 PASS, 2 FAIL, zero skips TAP. Diagnóstico fixo `C1_CHILD_PRIVATE_TEMP_REQUIRED`.
A resolução legada de caminhos não expandia consistentemente aliases Windows; o teste local
que diferencia a API legada da nativa falhou antes da correção. A versão corrigida usa
`realpathSync.native` para contenção e recuperação, após verificar links em cada ancestral.
Também verifica recuperação pelo caminho produzido pelo PowerShell, não só pelo Node.
Não houve alteração no checkpoint real para reproduzir/corrigir essas falhas.

## Procedimento Windows seguro

Primeiro sincronizar a QA limpa com `git pull --ff-only origin automation/nexalvo-qa-actions`.
Usar o **SHA de código da CI final aprovada**, não o HEAD presumido ou um SHA sem evidência.
Não executar launcher normal, recuperação antiga já encerrada ou novas sondagens.

1. Preservar o checkpoint original no diretório privado; obter seu hash original confiável
   do registro local anterior, sem enviá-lo ao chat. Não escolher simplesmente o arquivo mais recente.
2. Pela conexão SQL comprovadamente TEST, executar somente SELECT dos arquivos
   `qa/sql/stock_journey_preflight_readonly_TEST.sql` e
   `qa/sql/stock_c1_child_security_readonly_TEST.sql`. Guardar resultados locais fora do Git,
   sem logs compartilhados; captura com até 24h. O campo project_ref_expected não autentica a conexão.
3. Revisar independentemente definições exatas, ACL/RLS, políticas, triggers e a origem da captura;
   varrer segredos antes de compartilhar qualquer export. O segundo SQL exporta metadados/hashes,
   não corpos. Drift requer definições adicionais, não substituir hash para obter PASS.
4. Depois da revisão, calcular `canonicalSecurityDigest` de `qa/stock-c1-child-security.mjs` e
   registrar o digest aprovado separadamente. Nunca preencher o digest esperado automaticamente
   a partir de um catálogo não revisado. A estabilidade do digest não prova segurança semântica.
5. Definir somente variáveis locais de caminhos e hashes não secretos e executar:

```powershell
# $codeSha = SHA de código aprovado na CI final, informado no handoff.
# $parentCheckpoint/$parentHash = caminho privado e hash ORIGINAL confiável.
# $catalog/$security = resultados locais dos dois SELECTs TEST acima.
# $reviewedSecurityHash = digest previamente aprovado pela revisão independente.
.\qa\Invoke-QaStockC1Child.ps1 -ValidatedCodeSha $codeSha `
  -ParentCheckpoint $parentCheckpoint -ParentSha256 $parentHash `
  -CatalogFile $catalog -SecurityFile $security `
  -ReviewedSecuritySha256 $reviewedSecurityHash -PreflightOnly
```

O launcher solicita credenciais QA existentes em campos ocultos, em memória, sem arquivos/Git.
Não usar transcript, debug ou imprimir o ambiente; não enviar credenciais ao chat.
Sem PASS de leitura, reserva disponível, revisão atual e nova autorização, não prosseguir.

Para calcular somente o digest, depois da revisão do arquivo indicado em `$security`, sem
imprimir metadados, paths ou erros brutos:

```powershell
@'
import {readFileSync} from 'node:fs';
import {canonicalSecurityDigest} from './qa/stock-c1-child-security.mjs';
try { console.log(canonicalSecurityDigest(JSON.parse(readFileSync(process.argv[2],'utf8')))); }
catch { console.error('C1_SECURITY_DIGEST_BLOCKED'); process.exitCode=2; }
'@ | node --input-type=module - $security
```

Esse comando não atribui `$reviewedSecurityHash`, não representa aprovação e não executa
preflight/SQL/Auth. Registrar separadamente o digest revisado antes de utilizá-lo no launcher.

**Somente depois de autorização específica vinculada ao código/pai/orçamento/janela:**

```powershell
# Bloco futuro, NÃO autorizado pela preparação do pacote ou pela CI.
$env:QA_C1_CHILD_EXECUTION_AUTHORIZED='TEST_ONLY_EXPLICIT_C1_CHILD_20261023'
$env:QA_C1_CHILD_AUTHORIZED_CODE_SHA=$codeSha
$env:QA_C1_CHILD_AUTHORIZED_PARENT_SHA256=$parentHash.ToLowerInvariant()
try {
  .\qa\Invoke-QaStockC1Child.ps1 -ValidatedCodeSha $codeSha `
    -ParentCheckpoint $parentCheckpoint -ParentSha256 $parentHash `
    -CatalogFile $catalog -SecurityFile $security `
    -ReviewedSecuritySha256 $reviewedSecurityHash `
    -ExecuteAuthorized -ExclusiveWindowConfirmed -ExclusiveWindowMinutes 20
} finally {
  Remove-Item Env:\QA_C1_CHILD_EXECUTION_AUTHORIZED -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_C1_CHILD_AUTHORIZED_CODE_SHA -ErrorAction SilentlyContinue
  Remove-Item Env:\QA_C1_CHILD_AUTHORIZED_PARENT_SHA256 -ErrorAction SilentlyContinue
}
```

Não encadear automaticamente esse bloco ao preflight. Após qualquer interrupção, não repetir.
Recuperação futura do filho, sem escrita e sem nova janela:

```powershell
$childCheckpoint=Join-Path ([IO.Path]::GetTempPath()) `
  ('nexalvo-stock-c1-child-registry\'+$parentHash.ToLowerInvariant()+'.child.json')
.\qa\Invoke-QaStockC1Child.ps1 -ValidatedCodeSha $codeSha `
  -ParentCheckpoint $parentCheckpoint -ParentSha256 $parentHash `
  -CatalogFile $catalog -SecurityFile $security `
  -ReviewedSecuritySha256 $reviewedSecurityHash `
  -ReadOnlyRecovery -ChildCheckpoint $childCheckpoint
```

## P0 independentes e evidências

Preparado SELECT `qa/sql/purchase_precision_contracts_readonly_TEST.sql`: typmod/format_type,
numeric_precision/scale e contratos de criação/recebimento/idempotência. Executado em PostgreSQL
descartável; a escala **atual no Supabase TEST continua BLOCKED**, sem integração SQL nesta sessão.
Não confundir numeric sem escala com prova de três casas ou lifecycle real.

Migração de idempotência de compras já preparada: empresa/usuário/permissão antes da chave,
chave business/request, payload JSONB exato, lock e chamada atômica. Continua não instalada.
Financeiro permanece com ordem finite_guard → cash_normalization → expense_idempotency e
preflight/rollback por pacote; nenhuma abertura, despesa ou compensação autorizada aqui.
Workflow de perfis reais MANAGER/EMPLOYEE existente preservado; bloqueado por sessões/fixtures
seguras e prontas, sem novas contas/convites. Nenhuma tradução/formulário foi alterado sem defeito
concreto neste lote; regressões existentes verificam os formulários e traduções já corrigidos.

Auditoria npm de 24/10: runtime zero; três alertas moderados build/dev, fonte 1241232 conhecida,
postcss-selector-parser/postcss-nested/tailwindcss. A mudança da classificação no registry não
é correção de dependências. A política agora limita severidade **por pacote**, mantendo as listas
de pacotes/fontes, teto total 7, high 5 e moderate 3 preservado da QA remota; aceita downgrade e rejeita escalada de moderado para alto.
Tailwind4 segue separado, sem npm audit fix --force ou atualização incompatível.

## Resultado verificável do pacote

Código **4f8e908d987fced2a2dc3ddc5914b408d5a5881e**.
[CI #225](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/40143125326):
**1.001/1.001 TAP PASS**, zero FAIL/SKIP nos testes executados; 9 jobs PASS e 4 persistentes BLOCKED.
Os 25 casos nativos por engine passaram em Windows PowerShell 5.1 e PowerShell 7; build, browser,
preflight geral QA A/B e agregador PASS. Os 14 relatórios TAP foram exigidos pelo agregador.
[Evidência com fingerprints das páginas/jobs e fonte da contagem](./evidence/stock-c1-child-executor-ci225-20261024.json).

Local: **691/691 regressões em 54 módulos, 34/34 browser**, zero FAIL/SKIP; build e parse de duas
Edge Functions PASS. Os testes PostgreSQL usam container descartável sem rede; os testes
Chromium do ciclo filho interceptam todo backend. Nada disso é prova persistente C1.
Varredura de segredos e diff-check PASS; nenhum `.env`/export bruto/checkpoint real versionado.

Commits: implementação `b6a66b2030815b3e5a92d0adcdeca2e8e7e2ec20`, merge preservando QA remota
`6cd920f4f04a7947fe42fc607297ba4fd4b83e4b`, diagnóstico Windows
`8fb2c0c45a495039deac25016cb3f86da5126197`, correção validada de aliases `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`.
O remoto `8329294ef29e7e2227d2598d0ab02ba5fe23a323` foi preservado; sem force push.
Commits posteriores somente docs podem descender do SHA validado; não substituir por código
novo sem nova evidência CI. Usar este SHA literal em `$codeSha` no comando Windows acima.

Macro permanece **16/60 (26,67%)**, 15 pendentes/29 bloqueados. C1 real e jornadas comerciais
nunca recebem PASS por este pacote simulado. Produção/main e checkpoints reais intocados.
