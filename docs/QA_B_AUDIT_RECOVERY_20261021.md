# B-Jornada #1253 — auditoria e recuperação somente leitura

O inicializador Windows foi revisado depois desta correção. Usar o
[procedimento vigente com diagnóstico seguro](./QA_B_WINDOWS_LAUNCHER_20261021.md), código
`032fa87fcbb79863da4c043a4008e45ac90d15b6`. A CI #196 abaixo documenta a correção das auditorias;
a validação do launcher atualizado está registrada no novo relatório.

Somente branch `automation/nexalvo-qa-actions` e Supabase TEST `msinksoilkluooxenecy`.
Código validado: **`65029918238f2e51200addef9963797c5a998e5d`**.
[CI #196](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39618474475): **658/658 PASS**, zero falhas/skips nos testes executados;
**8 jobs PASS, 4 grupos persistentes BLOCKED/ignorados pelo gate**, não 12/12 aprovados.
[Evidência da CI](./evidence/sale-b-ci-196-20261021.json) e [reprodução/correção local](./evidence/sale-b-audit-recovery-fix-20261021.json).
**Não executar outra venda, outro estorno, migração ou alteração de auditoria.**

## Evidência real informada pelo usuário

A execução original criou e cancelou a venda QA #1253, mas terminou
`BLOCKED — SALE_AUDIT_NOT_CONFIRMED`. O checkpoint original continua preservado no Windows.
Consulta independente ao TEST confirmou, segundo o usuário:

- Venda cancelled; receita USD 0,49 e despesa compensatória USD 0,49: líquido zero.
- SALE −0,25 e REVERSAL +0,25; saldo final 1 e custo médio 0,10.
- `Sale Created`: `Order #1253 - 0.49`.
- `Sale Cancelled`: `Order #1253`.
- `Client: Sale Reversed`: `Order #1253 · $0.49 · inventory restored`.

Esses resultados não foram reconsultados nesta sessão. Não equivalem à aprovação de todos os
17 checks B. Não há motivo para recriar a venda ou repetir a compensação para corrigir o executor.

## Correção e regras preservadas

O LIKE antigo exigia espaço e sufixo depois de #1253, omitindo a auditoria de cancelamento sem
sufixo. Agora a consulta filtra a empresa, as três ações esperadas e um OR delimitado:

```text
details = "Order #1253"
OU details LIKE "Order #1253 - *"
OU details LIKE "Order #1253 · *"
```

O asterisco é a sintaxe LIKE do PostgREST; o número é validado como inteiro positivo seguro.
#12530, outro tenant, prefixos, ação incorreta ou valor divergente não podem confirmar #1253.
O resultado inclui business_id para nova validação local e mantém a conferência de paginação.

Cardinalidade: **exatamente um Sale Created e um Sale Cancelled de servidor**. O evento
`Client: Sale Reversed`, quando presente, deve ser único e válido; não substitui os dois obrigatórios.
Ele é opcional porque uma compensação oficial via RPC pode terminar sem evento gerado pelo navegador.
Valores finitos devem coincidir com o total capturado. Eventos inesperados ou duplicados bloqueiam.
Nenhum dado foi adaptado no Supabase para satisfazer o teste.

A recuperação somente leitura agora verifica também o histórico original de itens, receita e
movimentos, estoque/custo, financeiro e auditorias, além dos guards de fixture existentes.
O modo recusa escritas de negócio e chamadas ao gravador do checkpoint. A inspeção não limpa
flags de incerteza nem muda a fase original: confere os bytes antes/depois e retorna SHA-256.
Probe de escrita cruzada ainda pendente permanece BLOCKED. Reversão pendente pode ser confirmada
por estado integral já cancelado, sem reenviar qualquer RPC.

## Testes locais

- Reprodução da consulta anterior: **1/1 FAIL**, cancelamento encontrado 0 em vez de 1.
- Correção: **25/25 PASS**, zero falhas/skips (19 guards e seis testes PostgreSQL descartáveis).
- Cobertura dos três formatos, pedido 12530, empresa/ação/valor incorretos, logs ausentes/duplicados.
- Inspeção repetida localmente mantém os bytes, fase e flags do checkpoint, sem compensar.
- História alterada, estoque/custo divergente, financeiro duplicado ou auditoria ausente bloqueiam.
- Predicados do filtro executados em PostgreSQL READ ONLY excluem pedidos/empresas adjacentes,
  mantendo todas as sete auditorias sintéticas intactas. Isso não é uma chamada ao REST do TEST.
- Build/análise sintática PASS. Nenhuma mudança em App, RPC, tabela ou migração implantada.

## Retomar somente a execução existente no Windows

Preservar mudanças locais e sincronizar QA sem reset/force push. Reutilizar o catálogo preparado,
respeitando sua validade de 24 horas. Usar **o checkpoint original**; não editar seu JSON, não
apagar o diretório, não mudar sua fase para RESTORED e não recriar a fixture que agora tem histórico.
**Não usar execução normal, -PreflightOnly ou -RecoveryFile sem -ReadOnlyRecovery nesta etapa.**

Após CI aprovada, árvore limpa e reserva da janela exclusiva:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
$validatedSha = '032fa87fcbb79863da4c043a4008e45ac90d15b6'
$recoveryFile = Read-Host 'Caminho privado do sale-recovery.json ORIGINAL da venda #1253'
$beforeHash = (Get-FileHash -LiteralPath $recoveryFile -Algorithm SHA256).Hash
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId '5ba917cd-362b-42f5-83f6-345fb3dccddf' `
  -LocationId 'a3e4b2ed-eb00-4963-afd0-38c256aff87d' `
  -CatalogFile (Join-Path $env:TEMP 'nexalvo-b-catalog.json') `
  -ExclusiveWindowConfirmed -RecoveryFile $recoveryFile -ReadOnlyRecovery
if ((Get-FileHash -LiteralPath $recoveryFile -Algorithm SHA256).Hash -ne $beforeHash) {
  throw 'CHECKPOINT_CHANGED_STOP'
}
```

Prompts de credenciais ocultos, variáveis somente do processo, Auth A/B existentes e logout local
das sessões temporárias preservados. Não enviar senhas, tokens ou checkpoint bruto pelo chat/Git.
Nenhum navegador/jornada de escrita é iniciado nesse modo.

Resultado de inspeção esperado: `recovery_status=PASS`, `restored=true`,
`recovery_checkpoint_unchanged=true`, hashes de estoque iguais, financeiro líquido zero e auditorias
de servidor 1/1; para o caso informado, client_reversed=1. Código:
`READONLY_CANCELLED_SALE_CONFIRMED_NOT_FULL_HOMOLOGATION`.

O status global continua **BLOCKED** e o exit code é 2: a inspeção não reconstrói evidências de UI,
replay e isolamento da execução original. Isso não autoriza tentar outra venda/compensação.
Para avaliar PASS integral, conferir o JSON sanitizado original com seus checks e a inspeção real
do mesmo checkpoint. Nenhum check de UI é promovido por dedução ou por teste simulado.

Esta sessão não tem acesso ao Windows/checkpoint ou credenciais QA A/B; a inspeção real permanece
BLOCKED por acesso, sem afirmar que o notebook esteja offline. Cobertura macro segue **14/60
(23,33%)**, até conferência de todas as evidências obrigatórias.
