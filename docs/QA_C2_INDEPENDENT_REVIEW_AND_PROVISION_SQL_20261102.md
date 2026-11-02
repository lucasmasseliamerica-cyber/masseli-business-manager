# C2 — revisão adversarial e SQL de provisionamento para revisão (02/11/2026)

**Seed não autorizado/não executado. Perda C2 não autorizada/não executada.**
Base local/remota conferida: 5b15de5cac88750ae0e51f5ee3a11c204327a4e7, árvore limpa.
Executor revisado: ed3fb9433e80a24811b261a6dc5cb58c7c597c13; suas fontes não foram alteradas
neste lote. O diff novo contém procedimento, SQL para revisão, esquema/testes descartáveis e CI isolada.
C1/B, main, produção, checkpoints e reservas reais preservados. Cobertura **16/60 (26,67%)**.

## Método e conclusão da revisão

Releitura separada dos caminhos de admissão, intenção, transporte, confirmação, falha e cleanup;
invariantes confrontadas com testes adversariais novos, além dos 30 testes anteriores. Os novos
testes não reutilizam a função que querem provar como oráculo e não fazem rede remota.
É revisão técnica nesta sessão por método adversarial, não segunda assinatura humana/auditor externo.
O PASS da CI anterior não foi usado como prova de segurança de caminhos não exercitados.

**Há bloqueio aberto para futura execução de perda.** Esta revisão não promove o executor a
aprovado para executar. O provisionamento permanece uma decisão/autorização independente.

| Achado | Severidade/estado | Evidência e consequência |
| --- | --- | --- |
| F01 — GET/HEAD amplos na origem TEST | P1, OPEN / bloqueia perda | createC2Guard admite esses métodos sem allowlist de caminho; o teste REVIEW F01 admite um GET sintético /functions/v1/SYNTHETIC_UNREVIEWED sem passar por gate/intenção. GET em Edge Function não prova ausência de escrita. Nenhum GET real foi enviado. Exigir allowlist de recursos/contratos de leitura antes de liberar perda |
| F02 — timeout de transporte não vinculado ao prazo restante | P2, OPEN / decisão e correção antes de perda | route.fetch usa 20.000 ms fixos; gate verifica a janela antes e depois, mas não reserva tempo de conclusão. Uma requisição admitida perto do fim pode concluir depois. Timeout/cancelamento HTTP não prova cancelamento do trabalho no servidor. Definir margem e semântica de encerramento; nunca usar expiração como prova de rollback |
| F03 — checksum semântico, não hash dos bytes dos arquivos | P2, limitação comprovada | REVIEW F03 reescreve apenas a apresentação JSON em journal sintético e assertCurrent aceita o mesmo conteúdo. O SHA reportado identifica o envelope parseado, não cada byte. Não descrever como byte-integridade ou assinatura; preservar hashes externos dos bytes se isso virar critério de aceite |
| F04 — contador é orçamento de encaminhamento tentado | Limitação de evidência | Incrementa antes de route.fetch; erro de rede pode ocorrer sem entrega. Não prova recebimento pelo servidor. Conservadoramente consome a tentativa e impede replay mesmo com ausência de linha |
| F05 — validade de catálogo verificada na admissão | P2, OPEN / gate futuro | Catálogo/segurança têm até 24h na admissão; gate de cada RPC não recalcula sua idade. Planejar recaptura/revisão e margem para toda a janela, ou revalidar expiração antes de cada encaminhamento |

F01/F02/F05 devem ser resolvidos e novamente testados/revistos antes de pedir autorização da perda.
Este lote documenta os achados sem mudar o executor já publicado ou ocultar seus limites.
Os testes diagnósticos que confirmam um achado passam quando reproduzem o comportamento;
esse PASS não significa que o achado foi corrigido.

## Controles confirmados e falhas parciais

- Ordem LOSS_INTENT/AUDIT_INTENT → criação exclusiva → fsync → readback → gate → route.fetch.
  Falha antes do encaminhamento para definitivamente, podendo consumir reserva sem enviar RPC.
- Reserva é diretório fixo exclusivo, nunca apagado pelo executor. Novo processo não recebe handle
  de escrita; fase/recibos e maxRetries/maxRedirects=0 impedem replay no fluxo revisto.
- Perda e movimento estão na mesma transação fn_record_waste. Auditoria é uma segunda chamada,
  não atômica com a perda. Falha de reload pode impedir auditoria; logAudit pode esconder sua falha
  da UI. O executor exige recibo/cardinalidade de auditoria e não confia no toast.
- Resposta perdida após commit da perda preserva LOSS_INTENT e não envia auditoria. Resposta
  perdida da auditoria preserva AUDIT_INTENT; leitura pode observar ambas, sem autorizar continuação.
- Hash encadeado e comparação de recibos detectam mudança de conteúdo; checagem após cleanup
  rebaixa PASS provisório quando o conteúdo do journal muda. F03 limita a afirmação sobre bytes.
- Recuperação só lê e preserva intenção; uma última cauda JSON truncada usa prefixo verificado e
  checksum que inclui a cauda. Reserva sem primeiro registro, corrupção anterior e receipt ambíguo
  continuam BLOCKED para revisão manual. Nem observação de ausência libera retry.
- Exclusividade é local e operacional, não lock distribuído. Administrador do notebook pode
  adulterar dados/recalcular checksums; a cadeia não é assinatura contra esse ator. Não alterar TEMP,
  máquina, ACL ou reserva para conseguir outro envio. Queda elétrica completa não foi ensaiada.

## SQL exato proposto — um único envio futuro, não executado

[Provisionamento para revisão](../qa/stock-c2-provision-review.sql).
[Reconciliação separada somente leitura](../qa/stock-c2-provision-reconcile-readonly.sql).

O arquivo de provisionamento não é migração, não é chamado pelo executor/CI e não contém um
SET automático de autorização. O futuro executor administrativo deve verificar externamente a
conexão física **msinksoilkluooxenecy**, na mesma sessão/batch do envio único. Literal SQL,
nome do banco, IDs conhecidos e GUC de projeto não autenticam a instância por si mesmos.
Não usar produção. As checagens adicionais exigem current_database/current_user postgres,
session_replication_role=origin, e atestados de projeto/aprovação já presentes na sessão.
Os atestados são interlocks operacionais públicos, não segredos nem substitutos da autorização humana.
Não presumir afinidade de sessão entre chamadas de um conector com pool. Se ela não puder ser
garantida, não enviar o SQL; revisar o mecanismo de execução antes da autorização.

Revisar/autorizar o arquivo inteiro e seu SHA-256, não trechos selecionados. Enviar uma vez,
sem loop, retry do cliente ou repetição manual após timeout. Qualquer erro aborta a transação;
as validações usam IF/RAISE EXCEPTION, e não ASSERT que pode ser desabilitado por check_asserts ([documentação PostgreSQL 17](https://www.postgresql.org/docs/17/plpgsql-errors-and-messages.html)).
O NOTICE final significa "checagens anteriores ao COMMIT passaram", não recibo de COMMIT.

O arquivo fixa todos os dados do [plano anterior](./QA_C2_EXECUTOR_PACKAGE_20261102.md):

| Recurso | ID | Dados principais |
| --- | --- | --- |
| Local | ee6bd7b2-5e9d-41e6-8963-e1f178f54e09 | QA A, ZZ_QA_STOCK_C2_20261102_LOCATION, Storage, ativo |
| Item | 475ae0c8-5a4b-45a2-ad74-1a450e553cb0 | QA A, ZZ_QA_STOCK_C2_20261102_EXCLUSIVE, SKU ZZ_QA_C2_20261102, unit, QA, ativo, min 0/max 2, sem fornecedor/validade |
| Posição | 894e85eb-eb73-42f6-a18c-4d36c0ac0113 | Item/local acima, qty 2,000, médio/último custo 0,1000, última compra null |

created_at/updated_at usam defaults now() do servidor, iguais ao início da transação, sem edição
posterior. Nome/SKU colidentes normalizados com lower(btrim(...)) abortam. Sem upsert,
IDs substitutos, reaproveitamento de C1/B, compensação ou limpeza.

Checagens: empresa QA ACTIVE e OWNER A ativo (FOR SHARE), relações/tipos/precisão/defaults,
constraints, índices, regras, herança e triggers fixados no digest de contrato, IDs/nomes/SKU
livres, zero vínculos/histórico prévio, ROW_COUNT=1 após cada INSERT, crescimento exatamente
1+1+1 nas três tabelas, dados/custos/timestamps exatos, ausência de perdas/movimentos/auditorias
ou dependências e contrato novamente idêntico antes do COMMIT. Constraints são forçadas a IMMEDIATE.

Contrato de provisionamento lido no TEST às **20:57:02 UTC de 02/11**:
135e8025db9f8097377432b0ff26fe8c (MD5 do envelope JSONB de metadados, para detectar drift;
não é assinatura de servidor/atestado de segurança). Conferido semanticamente com definições.
Qualquer diferença exige nova captura e revisão; nunca substituir o digest esperado para obter PASS.

O SQL usa locks SHARE ROW EXCLUSIVE somente nas três tabelas alvo. Esses locks bloqueiam DML
concorrente e DDL conflitante dessas tabelas, mas não são locks por tenant: podem afetar outros
operadores TEST e precisam constar na janela/autoridade de provisionamento. lock_timeout=2s,
statement_timeout=20s, idle_in_transaction_session_timeout=30s; nenhuma repetição automática.
Não impedem toda alteração administrativa concorrente de código de função; janela sem DDL e
revisão vigente continuam pré-condições. Os locks não são realizados nesta preparação.

## Efeitos reais dos triggers/defaults/índices e orçamento

Leituras diretas de 20:55:02–21:05:41 UTC, PostgreSQL TEST 17.6; role SQL postgres.
Três tabelas ordinárias, RLS ativo, sem partições/herança/regras de reescrita, 30 colunas,
22 constraints e nove índices. Não houve chamada de função de negócio.

- Um trigger de usuário elegível: inventory_items_validate_tenant_references, BEFORE INSERT
  OR UPDATE OF supplier_id,business_id, ativo. Função postgres/plpgsql SECURITY DEFINER,
  search_path vazio, definição MD5 b08c6f8bdb740824d8850e593a482fe0. Corpo lê supplier da mesma
  empresa quando aplicável, pode lançar 23514 e retorna NEW. Não contém DML ou chamada mutante.
  No seed supplier_id=null; nenhuma referência de fornecedor é aceita/criada.
- Cinco triggers internos INSERT RI_FKey_check_ins em pg_catalog, linguagem internal:
  local→business; item→business e supplier; posição→item e local. Executam verificações e
  locks de integridade; a chave supplier null é dispensada. Não fazem cascade/INSERT de auditoria.
  Triggers internos de UPDATE/DELETE existentes não são disparados pelos três INSERTs.
- Índices: três por linha inserida (incluindo índices parciais de nome/SKU e índice FK com null),
  total esperado nove entradas de índice; são manutenção física dos três INSERTs, não novas
  linhas de negócio. Os três IDs são explícitos: gen_random_uuid defaults não são invocados.
  Seis defaults de timestamp now() são aplicados. Constraints usam comparações/built-ins revisados.
- Sob esse contrato, **zero INSERT/UPDATE/DELETE indireto adicional em tabelas de negócio**,
  zero ledger INITIAL_STOCK, perda, auditoria ou caixa. Isso não promete zero WAL, locks de tupla,
  índices, replicação, logs ou efeitos externos de consumidores já configurados; esse monitoramento
  não foi homologado aqui. Drift do catálogo aborta em vez de ampliar o orçamento silenciosamente.

**Orçamento para futura autorização do seed:** uma transação; três INSERTs diretos; três linhas
persistentes; 1 trigger de usuário + 5 invocações FK INSERT (uma com chave null); zero DML
indireto de negócio, zero RPC/auditoria/movimento, zero UPDATE/DELETE/DDL/fixtures adicionais.
Os três recursos permanecem no TEST sem cleanup automático. A exceção de saldo importado
sem movimento inicial é deliberada e deve ser expressamente aceita.

## Resposta incerta — consultas separadas, nenhuma continuação automática

Guardar antes do envio futuro: autorização específica, SQL/SHA revisados, contexto físico TEST,
hora de submissão e identificador/recibo da conexão. Se a resposta for perdida, não reenviar
o lote e não criar substitutos. Preservar o resultado/erro sem segredos.

Executar apenas o arquivo de reconciliação na conexão TEST verificada; ele abre uma transação
REPEATABLE READ READ ONLY. Não adquire lock de escrita nem chama RPCs mutantes.

| Resultado observado | Conduta |
| --- | --- |
| ABSENT_UNCONFIRMED_NO_RETRY | Ausência no snapshot não prova rollback nem fim do pedido original; continuar só investigação/leitura, sem replay |
| SEED_OBSERVED_NO_EXECUTION_AUTHORIZATION | Três linhas/valores/tempos e ausência de resíduos conferem; registrar observação e reconciliar recibo/contexto original. Não autoriza perda nem segundo seed |
| DIVERGENT_STOP_MANUAL_REVIEW | Colisão, parcial, alteração, ledger/perda/auditoria inesperados ou dados divergentes: parar; não reparar/apagar por conta própria |

Se o backend original ainda estiver ativo, investigar seu estado somente por leitura antes de
concluir qualquer ausência. Não cancelar, compensar ou reexecutar por inferência. A reconciliação
mostra estado pontual, não prova criptográfica de autoria/commit nem exclusividade global.

## Testes e limites da evidência

Novos testes: quatro probes de revisão e onze testes SQL, dados sintéticos e sem rede TEST.
[PGlite](https://pglite.dev/docs/api) 0.3.15/PostgreSQL 17.5 em memória: tabelas alvo reconstruídas do catálogo, trigger real
revisto, pais e históricos são stubs sintéticos. O runtime usa template1: somente a comparação
do nome do banco é adaptada **em memória no teste**. SQL publicado, digest, IDs, três INSERTs,
locks, RAISEs e COMMIT não são alterados. O arquivo original é testado separadamente para
confirmar que rejeita a identidade local sem escrever. Não é execução do SQL no Supabase.

Cenários: seed/valores/resíduos, segundo envio bloqueado, empresa suspensa, OWNER inativo,
colisão normalizada, trigger/coluna inesperada, trigger sintético que tentaria gravar auditoria bloqueado antes do INSERT, assertion final causando rollback integral e
reconciliações ausente/divergente sem retry. Testes diagnósticos F01–F03 documentam limites abertos.
PGlite não comprova contenção multi-sessão, cancelamento HTTP/servidor, queda elétrica, WAL,
replicação ou comportamento do conector real. Arquivos SQL novos têm LF fixado por caminho
em .gitattributes; nenhum EOL/hash esperado das fontes C1/B é alterado.

## Autorizações futuras separadas — nenhuma solicitada ou recebida aqui

1. Revisão deste SQL e dos resíduos/locks/orçamento; depois autorização **somente do seed**,
   citando explicitamente "três INSERTs e seed de saldo 2,000/custo 0,1000 sem movimento inicial",
   TEST, IDs, SHA do SQL, janela e proibição de retry/cleanup. Ela não inclui perda ou auditoria.
2. Depois da fixture confirmada: corrigir/rever os bloqueios do executor, capturar/revisar a
   segurança atual e obter preflight C2 autenticado PASS com baseline/hash íntegros.
3. Só então considerar autorização **separada da perda**, vinculada ao novo SHA validado,
   janela própria, máximo 1 RPC perda +1 auditoria e resíduos permanentes aceitos.

Uma GUC preenchida, teste isolado PASS ou a autorização antiga C1 não substitui nenhuma dessas etapas.
