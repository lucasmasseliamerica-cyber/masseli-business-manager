# B-Jornada — venda TEST única, replay e estorno

Estado: **PREPARAÇÃO VALIDADA LOCALMENTE; HOMOLOGAÇÃO REAL BLOCKED**. Somente
`automation/nexalvo-qa-actions` e projeto `msinksoilkluooxenecy`.

## Autorização e evidência anterior

O proprietário autorizou expressamente uma venda fictícia, quantidade 1, total até **USD 1**,
um estorno oficial e replay/perda de resposta exclusivamente do mesmo identificador. A autorização
não inclui criação de fixtures, migrações, Stripe (nem TEST), terminais, contas ou jornadas C/D/E.
Pagamento existente **Other**: nenhum processador externo ou caixa aberto será movimentado.
Os dois probes negativos de estorno, OWNER B e anônimo, atingem somente a venda desta execução;
devem ser negados, sem qualquer efeito. Nunca testar escrita em uma venda histórica.

A A-Jornada foi confirmada pelo usuário como `PASS — REAL_PHOTO_JOURNEY_RESTORED`, com dois
uploads, substituição/remoção/reload, isolamento A/B/anônimo, zero resíduos e consulta SQL independente.
[Proveniência sanitizada](./evidence/photo-a-journey-user-confirmed-20261021.json): não foi reexecutada
por esta sessão Linux; o JSON bruto do executor A não foi recebido aqui. Somente o critério Storage
foi promovido. Fotos no PDV de produto vendável e CRUD geral continuam sem aprovação real.
Matriz atual: **14/60 (23,33%)**, 15 PENDENTES e 31 BLOQUEADOS; B não ganhou checks verdes.

## Pacote implementado

| Artefato | Função |
| --- | --- |
| `qa/Invoke-QaSaleJourney.ps1` | Credenciais ocultas/processo, ACL privada, mutex local com uma barra, janela exclusiva, código validado e recuperação |
| `qa/sale-journey.TEST.mjs` | Navegador real, fronteira de rede, snapshot, uma venda e no máximo um replay idêntico, estorno, reconciliação e relatório sanitizado |
| `qa/sale-journey-core.mjs` | Gates de identidade/TEST/USD/fixture, precisão, limites, payload imutável e invariantes financeiras/estoque |
| `qa/sql/sale_journey_preflight_readonly_TEST.sql` | Oito definições/ACLs revisadas e 13 tabelas RLS, com validade máxima de 24 horas |
| `qa/sql/sale_journey_fixture_inventory_readonly_TEST.sql` | Inventário somente leitura de possíveis fixtures; IDs QA ficam fora do Git/logs |
| `qa/sale-journey-guards.test.mjs` | Regressões dos bloqueios e invariantes, sem Supabase |
| `qa/sale-journey-postgres.test.mjs` | Os dois SQLs exatos em PostgreSQL 17 descartável, em transações READ ONLY |

Os fingerprints revisados incluem `fn_create_sale`, `fn_reverse_sale`, helpers de contexto/permissão,
leituras de estoque e os internos `fn_next_order_no` e `fn_record_inventory_movement`. Os dois últimos
devem negar EXECUTE a authenticated; os outros seis devem permitir. Todos devem negar anon.
O catálogo histórico sanitizado para análise tem SHA-256
`a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f`.
Isso não atesta o estado atual: qualquer drift no novo export mantém BLOCKED até revisão semântica.
O marcador TEST do SQL não prova a conexão; confirmar o projeto na integração SQL e no login.

Nenhum App, migração ou RPC implantada foi alterado. A CI apenas analisa a sintaxe do executor B;
executa seus testes locais seguros e o browser com HTTP simulado. Não executa B persistente nem
habilita os quatro grupos persistentes existentes.

## Estado real desta sessão e limites conhecidos

- Sessões QA A/B: **0/4 campos de credenciais disponíveis**; nenhum login B tentado.
- Sem Desktop Commander/Windows ou integração SQL nesta sessão. Isso não declara o notebook offline.
- Catálogo atual, fixture elegível e janela exclusiva ainda não comprovados. Nenhuma venda,
  movimento, estorno ou probe de escrita B foi executado no TEST.
- PowerShell nativo/ACL/mutex deste novo wrapper: **BLOCKED** até validação no Windows. Testes
  de fonte não equivalem a execução nativa. A confirmação anterior da A não homologa o wrapper B.
- Quantidades, custos e financeiro antes/depois reais: **não medidos**, não são zero presumido.

O SQL histórico de estoque arredonda o saldo a três casas; receitas com precisão superior são
rejeitadas antes de escrever. SALE/REVERSAL preservam o custo médio corrente; uma compra concorrente
pode alterá-lo. Por isso há janela exclusiva e comparação estrita com snapshot. Não há ajuste extra
para forçar igualdade. Esses são riscos condicionais/limites do contrato, não exploração comprovada.
Somente empresa USD é aceita; não há conversão cambial implícita. Um candidato em outra moeda bloqueia.

## Execução no notebook, sem enviar credenciais no chat

1. Preservar alterações locais e sincronizar QA por GitHub, sem reset/force push. `git pull --ff-only`
   só com a árvore limpa; divergência deve ser integrada preservando as duas linhas.
2. Confirmar a CI do **SHA completo do código B publicado**, indicado no handoff/relatório de entrega.
   Não usar o SHA antigo `ea19a2a` como aprovação deste novo executor.
3. Na integração SQL **TEST**, executar os dois SQLs somente leitura acima. Salvar apenas o JSON
   do preflight em `$env:TEMP\nexalvo-b-catalog.json`, fora do repositório. Rever os candidatos
   privadamente; o campo `potentially_eligible` não substitui o preflight autenticado.
4. Reservar a fixture/unidade contra outros dispositivos. O mutex só impede concorrência local.
5. Executar primeiro o preflight. Os prompts de e-mail, senha e chave pública são ocultos; nenhum
   segredo deve ser colocado na linha de comando. Não iniciar transcript, gravação de tela ou traces.

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
$validatedSha = Read-Host 'SHA completo do código B aprovado na CI (40 caracteres)'
$productId = Read-Host 'UUID do produto QA elegível'
$locationId = Read-Host 'UUID da unidade QA reservada'
$catalogFile = Join-Path $env:TEMP 'nexalvo-b-catalog.json'
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId $productId -LocationId $locationId -CatalogFile $catalogFile `
  -ExclusiveWindowConfirmed -PreflightOnly
```

Exigir `PASS / B_JOURNEY_READONLY_PREFLIGHT / READY_WITHOUT_BUSINESS_WRITES`. Esse PASS não é o
PASS da jornada inteira. Após verificar a execução nativa e todos os gates, executar uma única vez:

```powershell
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId $productId -LocationId $locationId -CatalogFile $catalogFile `
  -ExclusiveWindowConfirmed
```

O script usa Vite isolado em `127.0.0.1:4188`, não modifica a instância local existente e não aceita
porta ocupada. Credenciais só no processo; filho Vite recebe apenas variáveis públicas necessárias.
Checkpoint em `%TEMP%\nexalvo-sale-*\sale-recovery.json`, restrito ao usuário Windows, nunca no Git.
Nenhum token/senha é salvo. O identificador de execução nasce antes da escrita; o ID de venda é
capturado do frontend e salvo antes de encaminhar o primeiro RPC. Produto/preço/receita são imutáveis.

Se nenhum candidato passar, **não criar nem reprecificar automaticamente**. Proposta condicional:
um produto QA novo USD 0,50, insumo QA exclusivo, receita 0,25 e estoque dedicado positivo maior que
0,25 com custo positivo, em unidade USD existente. Cadastro/estoque inicial exigem autorização
separada somente depois de provar que não existe fixture adequada.

## Compensação, interrupção e resultado desconhecido

O executor reconcilia o primeiro commit por leitura, perde deliberadamente sua resposta e permite
um único replay com **mesmo ID e payload completo**. Timeout sem confirmação positiva interrompe
reenvios; ausência temporária de registro não prova rollback. Não abrir uma segunda venda.

Para verificar o checkpoint após interrupção (mesmos parâmetros e catálogo atual):

```powershell
$recoveryFile = Read-Host 'Caminho privado do sale-recovery.json retido'
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId $productId -LocationId $locationId -CatalogFile $catalogFile `
  -ExclusiveWindowConfirmed -RecoveryFile $recoveryFile -ReadOnlyRecovery
```

Remover somente `-ReadOnlyRecovery` autoriza o modo de compensação já incluído no escopo B: um
estorno oficial apenas se a venda original estiver comprovada e nenhum estorno tiver sido tentado.
Estorno tentado com resposta desconhecida é apenas reconciliado, nunca repetido às cegas.
Probe negativo com resposta desconhecida permanece bloqueado até prova externa de término; o
executor não dispara um estorno A enquanto uma operação B/anônima ainda puder estar em execução.
Recuperação isolada nunca retorna homologação integral PASS.

Após o estorno, exigir quantidades/custos iniciais, demais posições e caixas intactos, uma receita
financeira e uma despesa compensatória do mesmo total (líquido zero), movimentos sem duplicidade,
itens/lançamento original e movimentos originais preservados, e auditoria de criação/cancelamento.
Venda cancelada, itens, auditoria e movimentos **permanecem**. Não restaurar timestamps/counters
apagando histórico. Só `REAL_SALE_JOURNEY_REVERSED`, todos os 17 checks PASS e `restored=true`
permitem propor a promoção dos critérios efetivamente comprovados.

## Validação local e entrega

Resultados locais: 10/10 guards B, 2/2 SQL em PostgreSQL descartável, 74/74 regressões P0 e
19/19 cenários de navegador com HTTP simulado; build PASS. Contagens se sobrepõem e não devem
ser somadas como testes distintos. Não são gravações/homologação Supabase B.
CI, SHA publicado e evidência final serão registrados no handoff após a execução observada.
Próxima prioridade: catálogo atual + preflight seguro no Windows, depois a única jornada B autorizada.
