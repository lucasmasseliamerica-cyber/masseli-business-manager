# B-Jornada — configurações ativas de pagamento e canal

Branch exclusiva `automation/nexalvo-qa-actions`; projeto TEST `msinksoilkluooxenecy`.
Correção publicada: `c515d8a4fb47570821db81913f0342bc3c14b9dc`.
[CI #195](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39608013041): **652/652 PASS**, zero falhas/skips nos testes executados.
**8 jobs PASS, 4 grupos persistentes BLOCKED/ignorados pelo gate**; não 12/12 aprovados.
[Evidência CI](./evidence/sale-b-ci-195-20261021.json) e [reprodução/correção local](./evidence/sale-b-settings-fix-20261021.json).
**Venda persistente não executada; preflight Windows da fixture B ainda pendente de repetição.**

## Causa e correção

O usuário confirmou que o preflight Windows real retornou
`BLOCKED — EXISTING_OTHER_PAYMENT_AND_CHANNEL_REQUIRED`. O banco e o frontend usam os tipos
`payment_method` e `channel`; o guard B buscava os plurais `payment_methods` e `channels`.
Além disso, a consulta REST não retornava `active`.

- O guard agora reconhece os tipos singulares reais e exige `active === true`.
- O pagamento deve ser o valor existente **Other**, exatamente. Não aceita Cash, cartão, tradução,
  variação de caixa ou espaço acrescentado como substituto; não cria/ativa configurações.
- O canal deve existir como `channel`, estar ativo e conter string não vazia. Valores vazios,
  somente espaços, NULL, números, arrays e canais inativos são ignorados; sem canal válido, BLOCKED.
- O REST inclui `active` no SELECT, mantém o filtro de empresa e acrescenta `active=eq.true`.
  A validação local também exige o booleano para falhar fechada se a projeção regredir.

Limite USD 1, quantidade 1, oito fingerprints, catálogo de até 24 horas, identidades OWNER A/B,
isolamento, fixture exclusiva, idempotência, snapshot e compensação permanecem inalterados.
Nenhuma alteração em RPC, tabela, migração, política, claims, estoque, histórico ou financeiro.

## Evidência local

- Antes: **1/1 FAIL**, reproduzindo exatamente o código informado com linhas singulares ativas.
- Depois: **19/19 PASS**, zero falhas/skips: 14 guards B e cinco testes PostgreSQL descartáveis.
- Novas regressões: nomes singulares e ativos; exclusão de inativos; ausência de Other; ausência
  de canal; valores vazios/malformados; ausência de `active`; tipos plurais rejeitados; dados intactos.
- Contrato REST verifica projeção `active`, filtro `active=eq.true` e empresa preservada.
- Build e análise sintática PASS. Os testes locais não equivalem ao novo preflight Windows real.

## Repetir somente o preflight autenticado

Fixture e catálogo já preparados pelo usuário. **Reutilizá-los**, mantendo os controles de
validade do catálogo; não editar hashes, status ou horário. Não repetir a criação da fixture,
export SQL ou outras jornadas. Se o catálogo tiver expirado, registrar o bloqueio em vez de
relaxar a validade. Credenciais A/B entram nos prompts ocultos, nunca no chat, arquivos ou logs.

Preservar mudanças locais e sincronizar QA sem reset/force push. A árvore deve estar limpa.
Depois da CI aprovada e da reserva da janela exclusiva, executar:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
$validatedSha = 'c515d8a4fb47570821db81913f0342bc3c14b9dc'
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId '5ba917cd-362b-42f5-83f6-345fb3dccddf' `
  -LocationId 'a3e4b2ed-eb00-4963-afd0-38c256aff87d' `
  -CatalogFile (Join-Path $env:TEMP 'nexalvo-b-catalog.json') `
  -ExclusiveWindowConfirmed -PreflightOnly
```

Exigir `PASS / B_JOURNEY_READONLY_PREFLIGHT / READY_WITHOUT_BUSINESS_WRITES`. Qualquer gate
BLOCKED/FAIL mantém a venda desabilitada. A autorização B existente permanece válida, sem
novas operações persistentes nesta correção. Não retirar `-PreflightOnly` nesta etapa.

Esta sessão não possui Desktop Commander/Windows nem credenciais QA A/B (0/4 campos); por isso
o novo preflight real ainda não foi executado aqui. Isso não significa que o notebook esteja offline.
Não utilizar service_role para substituir os usuários. Cobertura real segue **14/60 (23,33%)**.

Procedimentos de snapshot/recuperação: [jornada B](./QA_B_JORNADA_20261021.md).
