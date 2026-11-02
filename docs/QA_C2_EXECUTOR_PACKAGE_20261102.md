# C2 — pacote para revisão, sem provisionamento/execução (02/11/2026)

## Revisão C2 e SQL de seed — sem autorização (02/11/2026)

[Achados, SQL exato e procedimento de reconciliação](./QA_C2_INDEPENDENT_REVIEW_AND_PROVISION_SQL_20261102.md).
Revisão encontrou bloqueio aberto no GET/HEAD da guarda C2; perda não liberada.
Seed separado proposto: 1 transação/3 INSERTs, sem movimento inicial, sem auditoria/cleanup;
triggers/constraints/índices conferidos por leitura. Nenhum envio de provisionamento ou perda.
Autorização do seed deverá aceitar expressamente saldo importado sem movimento; autorização
da perda será outra, após fixture confirmada, revisão atual e preflight autenticado PASS.
Cobertura 16/60 (26,67%) e C1/B preservadas.


**Código preparado e testado em ambiente isolado; C2 real NÃO executada.**
Branch exclusiva automation/nexalvo-qa-actions; base c67d2383fd8cbf73761772b58df1b00196383e7c.
O diff documental anterior foi preservado e incorporado. C1 real 18/18 e 8/8 gates,
B #1253 e A/fotos preservadas. Nenhum checkpoint, reserva, fonte C1/B, main ou produção alterados.
Cobertura continua **16/60 (26,67%)**, 15 pendentes/29 bloqueados. Este pacote não promove C2.

## Fixture proposta: dados exatos e orçamento próprio

Nenhum item existente foi escolhido para reutilização. IDs propostos consultados no TEST às
20:22:29 UTC de 02/11: zero ocupações por ID/nome. Isso não reserva os IDs; conferir novamente
imediatamente antes de eventual provisionamento autorizado. Não usar ON CONFLICT, upsert,
UUID substituto, outra empresa ou migração para contornar uma colisão.

| Tabela/campo | Valor proposto |
| --- | --- |
| locations.id | ee6bd7b2-5e9d-41e6-8963-e1f178f54e09 |
| locations.business_id | d627563b-2ce4-491d-8cf6-141ef28d0f63 (QA A) |
| locations.name | ZZ_QA_STOCK_C2_20261102_LOCATION |
| locations.type / active | Storage / true |
| inventory_items.id | 475ae0c8-5a4b-45a2-ad74-1a450e553cb0 |
| inventory_items.business_id | d627563b-2ce4-491d-8cf6-141ef28d0f63 |
| inventory_items.name | ZZ_QA_STOCK_C2_20261102_EXCLUSIVE |
| inventory_items.sku / category / unit | ZZ_QA_C2_20261102 / QA / unit |
| inventory_items.min_qty / max_qty / active | 0,000 / 2,000 / true |
| inventory_items.supplier_id / expires_at | null / null |
| inventory_items.notes | QA C2 exclusive imported baseline; retain residual history |
| inventory_stock.id | 894e85eb-eb73-42f6-a18c-4d36c0ac0113 |
| inventory_stock.inventory_item_id | 475ae0c8-5a4b-45a2-ad74-1a450e553cb0 |
| inventory_stock.location_id | ee6bd7b2-5e9d-41e6-8963-e1f178f54e09 |
| inventory_stock.qty | 2,000 |
| inventory_stock.avg_cost_per_unit / last_purchase_cost | 0,1000 / 0,1000 |
| inventory_stock.last_purchase_date | null |
| created_at / updated_at das três linhas | defaults reais now() do servidor; nunca forjar ou reescrever |

Provisionamento proposto, **não autorizado nem implementado pelo executor**: uma transação
SQL administrativa exclusivamente no TEST, com exatamente três INSERTs novos (um local,
um item, uma posição), sem UPDATE/DELETE/DDL, sem RPC de estoque/auditoria e sem retries.
É seed explícito de baseline QA importado, sem INITIAL_STOCK no ledger. A exceção de criar
posição com saldo sem movimento inicial deve constar expressamente na autorização própria.
Não usar o fluxo normal fn_add_initial_stock, pois ele cria histórico e não satisfaz este baseline.
Nenhuma receita, produto vendável, fornecedor, compra, perda, caixa ou conta será vinculado.
Há um trigger de referência de fornecedor no item; supplier_id=null evita vínculo externo.

Orçamento do provisionamento: **3 linhas e 3 INSERTs em uma transação; 0 RPCs de perda,
0 auditorias de negócio, 0 movimentos e 0 migrações**. Evidência administrativa sanitizada
separada comprovará ator/contexto TEST, SHA da proposta, três IDs, valores e saída da transação.
Esses recursos permanecerão no TEST; não há cleanup automático nem autorização de apagar fixture.

Antes da transação futura: confirmar empresa QA ativa, nenhum ID/nome/SKU ocupado, nenhum
registro C2 local já reservado, contratos/constraints/triggers atuais e autorização de seed.
Se a resposta do COMMIT for incerta, não executar os INSERTs novamente: ler exatamente os
três IDs, timestamps e valores; estado parcial ou divergência exige revisão específica.
Sem confirmação inequívoca de todas as linhas, não iniciar C2. A consulta administrativa não
substitui o preflight autenticado OWNER A/B, que precisa confirmar isolamento e baseline.

## Contratos reais e perda parcial

As quatro definições/grants foram relidas no TEST em 02/11 às 20:22:29 UTC e não divergem
do [plano somente leitura](./QA_C2_WASTE_READONLY_PREPARATION_20261102.md).
Colunas/defaults e trigger de provisionamento foram lidos às 20:33:08 UTC.
Nenhuma função mutante foi chamada. Dados administrativos postgres/postgres não equivalem a QA OWNER.

fn_record_waste cria atomicamente uma perda e um movimento WASTE e reduz a posição sob lock.
fn_write_audit é outra transação HTTP; não existe idempotência de servidor no contrato de perda
ou auditoria. Perda confirmada não implica auditoria confirmada. logAudit da aplicação captura
erro e pode devolver false sem impedir toast de sucesso. Falha de reload também pode impedir
a chamada de auditoria após uma perda já salva. Por isso o executor exige os recibos e
as cardinalidades por leitura independente; toast nunca promove PASS.

Perda futura: Other, qty=0,125, nota NEXALVO_C2_20261102_SINGLE_WASTE_0125.
Auditoria esperada: Client: Waste Recorded, detalhes
"ZZ_QA_STOCK_C2_20261102_EXCLUSIVE -0.125 unit · Other".
Saldo final 1,875, custo médio/último custo 0,1000, última compra null;
perda.cost=0,01, movimento.qty_change=-0,125 e total_cost=-0,01.
updated_at muda; estoque não arredondado cai 0,0125. Dashboard/relatórios registram
0,01 de custo de perda no período. Nenhum lançamento de caixa direto é esperado.

Orçamento C2, separado do seed: **até 1 RPC fn_record_waste + 1 RPC fn_write_audit**,
1 movimento, 1 perda e 1 auditoria. Zero reposição, sondagens, segundo envio, cleanup ou compensação.
Resíduos permanentes e saldo reduzido precisam de aceite expresso. Auditoria pode faltar em
falha parcial; isso deixa C2 BLOCKED e não autoriza reparação dentro deste orçamento.

## Código e controles

- qa/stock-c2-executor.mjs: modos explícitos --preflight, --execute e --recover-readonly.
  Sem modo default, provisão, resume, replay ou herança de autorização C1.
- qa/Invoke-QaStockC2.ps1: branch/árvore/SHA antes dos prompts; campos ocultos, ambiente
  restaurado, mutex C2 próprio. Nenhuma credencial em arquivo, argumento de processo ou relatório.
- qa/stock-c2-client.mjs: login OWNER A/B existentes com chave pública TEST, verificação
  de tenant/permissões, contagem exata de leituras, isolamento B/anon e nenhuma API de escrita.
- qa/stock-c2-protocol.mjs: IDs próprios, baseline 2,000/0,1000, histórico vazio, payload exato,
  reconciliação de IDs, autores, links, custos, datas e imutabilidade dos recibos confirmados.
- qa/stock-c2-store.mjs e stock-c2-private.ps1: reserva é um diretório exclusivo e permanente
  no TEMP padrão, próprio da fixture C2. Journal append-only com hash encadeado, create-exclusive,
  fsync de arquivo e readback; diretório fsync em POSIX. Windows verifica ACL via .NET/PS5.1
  para não solicitar SACL/SeSecurityPrivilege. Não altera permissões de registros preexistentes.
- qa/stock-c2-browser.mjs: formulário real de perda, validação de payload, uma operação em voo,
  intenção durável antes de encaminhar cada chamada, maxRetries/maxRedirects=0, budget 1+1;
  releitura antes da auditoria e antes do aceite final; reload e histórico pela interface.
- Runtime próprio em 127.0.0.1:4191, sem tocar servidor/mutex/checkpoints C1. GETs opcionais
  externos são abortados; outra origem Supabase ou escrita fora da allowlist interrompe.
  Reconciliação mutante de alertas é bloqueada. Somente o POST de sessão de leitura com
  contrato fixado no catálogo é permitido fora das duas RPCs de negócio.

Journal: %TEMP%/nexalvo-stock-c2-475ae0c8-5a4b-45a2-ad74-1a450e553cb0,
fases RESERVED → LOSS_INTENT → LOSS_CONFIRMED → AUDIT_INTENT → AUDIT_CONFIRMED → COMPLETE.
Diretório já existente, arquivo parcial, fase incoerente ou hash divergente impedem nova execução.
Nunca mudar TEMP, máquina ou remover a reserva para conseguir outra tentativa. Exclusividade
é local: uma nova janela operacional de 20 minutos continua necessária e não é lock distribuído.
Journal tem checksum, não assinatura contra administrador do próprio notebook.

Transporte incerto, timeout, falha de readback/fsync, janela expirada após intenção, reload falho,
recibo divergente ou auditoria ambígua: parar, preservar registro e consultar somente leitura.
Recuperação exige o hash confiável do journal. Uma cauda JSON truncada pode ser observada
usando o prefixo verificado, com hash que inclui a cauda, sem editar/apagar arquivo ou continuar
escritas. Corrupção anterior, reserva sem primeiro registro ou dados não conciliáveis ficam BLOCKED
para revisão manual. Ausência momentânea de linha não prova rollback nem autoriza reenvio.

## Gates e autorização futura

O código desta publicação ainda não está autorizado a provisionar ou executar perdas.
Não foi preparada janela persistente nem preenchido token de autorização.
Primeiro revisar este pacote e seus testes; depois decidir sobre o seed de três linhas.
Após seed confirmado: capturas atuais dos SELECTs já versionados de catálogo/segurança,
revisão semântica específica C2 e digest fornecido independentemente, preflight C2 e hash
do baseline. Não preencher digest esperado automaticamente a partir da captura.

Variáveis específicas (sem valores de autorização ativos neste pacote): QA_C2_VALIDATED_CODE_SHA,
QA_C2_CATALOG_FILE, QA_C2_SECURITY_FILE, QA_C2_REVIEWED_SECURITY_SHA256;
execução futura exige QA_C2_EXECUTION_AUTHORIZED, QA_C2_AUTHORIZED_CODE_SHA,
QA_C2_AUTHORIZED_BASELINE_SHA256, QA_C2_AUTHORIZED_FIXTURE_SHA256 e
QA_C2_EXCLUSIVE_WINDOW/AT/UNTIL próprios e atuais. Código deve descender do SHA validado
com apenas docs posteriores; mudanças de código exigem novos testes/validação.
Recuperação usa QA_C2_JOURNAL_SHA256, não exige janela/autorização mutante e não salva estado.

Os critérios reais de UI, persistência, perda/movimento únicos, custos, auditoria, isolamento,
histórico residual e orçamento do plano anterior continuam todos pendentes. C2 isolada não
homologará CRUD completo ou concorrência de operadores, nem elevará o macro por contagem de testes.

## Validação e publicação

Testes C2 usam dados sintéticos; Chromium/Vite reais interceptam todas as requisições remotas.
Nenhuma sessão QA real, fixture real ou RPC de perda é usada pelos testes. Testes de filesystem
usam TEMP novo apenas no subprocesso de teste, sem acessar o registro C2 real.
CI dedicada .github/workflows/nexalvo-c2-offline.yml não recebe environment ou secrets TEST.
O commit de código leva [c2-offline], para não disparar produtores históricos da CI geral;
alterações futuras exclusivamente C2 são filtradas para a CI isolada. Workflow geral mantém
os gates de persistência anteriores e não foi habilitado para novas gravações.

[Evidência sanitizada de validação](./evidence/stock-c2-executor-package-20261102.json).
Nenhum export bruto, chave, e-mail/senha, sessão ou journal real é publicado.

## Fechamento da validação isolada

Código validado: ed3fb9433e80a24811b261a6dc5cb58c7c597c13.
[CI C2 isolada #2 PASS](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41521704525):
30/30 Linux e 30/30 Windows, zero falhas/skips; builds PASS nas duas plataformas.
Local Windows: 30/30 C2; validadores compartilhados 31/31 em bytes Git LF.
Checkout CRLF: 30/31 compartilhados por hash sensível a EOL, sem alterar fonte/hash esperado.
A primeira CI teve 28/29 no Linux porque o teste de cauda truncada criou arquivo 0644;
o guard de privacidade o rejeitou corretamente. O teste passou a criar 0600, sem relaxar o guard.
Windows da primeira CI foi cancelado pelo fail-fast, sem PASS atribuído.
A revisão final também verifica integridade do journal após cleanup; alteração rebaixa PASS a BLOCKED.
As evidências finais descendem do SHA validado apenas por documentação.
Nenhuma dessas aprovações autoriza provisionamento ou execução real.
