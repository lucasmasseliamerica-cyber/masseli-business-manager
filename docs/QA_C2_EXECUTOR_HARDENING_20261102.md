# C2 — correções F01/F02/F05 e nova revisão de falhas

**Preparação somente. Seed e perda não autorizados nem executados.** Base preservada:
94604e6fd8d4ccefdf219f226d1861ad8aaadaf7, branch automation/nexalvo-qa-actions.
Nenhuma conexão, autenticação ou chamada ao TEST neste lote. C1/B, reservas, checkpoints,
main e produção preservados. Cobertura operacional permanece **16/60 (26,67%)**.
Esta revisão de código/testes não equivale a preflight autenticado ou homologação real C2.

## Achados tratados

| ID | Resultado | Controle e regressão |
| --- | --- | --- |
| F01 | Corrigido no executor | Allowlist de caminhos, métodos, projeções de colunas armazenadas, filtros e argumentos. Edge Functions e caminhos desconhecidos abortam, inclusive GET/HEAD/OPTIONS na origem TEST. Headers de schema aceitam apenas public. Cliente e navegador usam a mesma política; teste Chromium passa por essa guarda também nas leituras |
| F02 | Corrigido na admissão/transporte; limite servidor permanece | Antes de cada envio do navegador, timeout = min(20.000 ms, prazo restante − 5.000 ms); prazo = min(fim da janela, expiração dos dois catálogos). Exige pelo menos 10.000 ms restantes. Recalcula após fsync/readback da intenção. Testes: margem insuficiente sem intenção, expiração após intenção sem envio, timeout real de 7s quando restam 12s, commit simulado seguido de timeout sem replay |
| F03 | Semântica corrigida; limitações explícitas | Checksum semântico encadeado separado de SHA-256 dos bytes de cada arquivo e SHA-256 do manifesto ordenado de nomes/tamanhos/hashes. Reformatação JSON mantém o checksum semântico, muda o manifesto e bloqueia assertCurrent. Nenhum deles é assinatura |
| F04 | Nomes/semântica corrigidos | stock_forward_attempts e audit_forward_attempts contam tentativas de encaminhamento, incrementadas imediatamente antes do transporte. Uma tentativa incerta consome o orçamento mesmo se não houve entrega. Não são contadores de commits/recebimento |
| F05 | Corrigido no executor | Entradas de catálogo/segurança copiadas e fixadas na admissão; validadores completos e idade recalculados antes de cada RPC, incluindo RPCs leitores e depois da intenção durável. Expiração de catálogo e de segurança exercitada após LOSS_INTENT e após AUDIT_INTENT; zero envio subsequente |

Leituras encaminhadas: users, businesses, locations, inventory_items, product_recipes,
audit_logs, purchase_orders e cash_flow; RPCs leitores current_business_id, user_can,
fn_session_access_status e os quatro leitores seguros de estoque/movimentos/compras/perdas.
O contrato completo de segurança precisa corresponder à captura revisada e válida. A guarda
não considera GET uma prova de ausência de DML; somente os contratos fixados são admitidos.
O status POST aceita somente corpo vazio; OPTIONS aceita os caminhos exatos previstos.

Áreas auxiliares que a aplicação tenta ler fora desse catálogo são explicitamente abortadas
sem rede e sem resposta sintética: produtos, fornecedores, vendas, clientes, fidelidade,
despesas, caixas, tarefas, turnos, alertas e leitores auxiliares relacionados. O relatório
conta auxiliary_reads_blocked. Podem aparecer erros nessas áreas; não são critérios C2 nem
aceite integral da aplicação. Recurso desconhecido fora dessa lista encerra os futuros writes.
fn_reconcile_business_alerts continua bloqueado sem encaminhamento.

## Caminhos de falha novamente revistos

1. Antes da reserva: SHA/branch/árvore, contrato, segurança, OWNER A/B, isolamento e fixture
   falham fechados. Nenhuma autorização C1 habilita C2.
2. Antes do envio: gate, baseline estável, payload exato, fase e orçamento; intenção criada
   exclusivamente, fsync/readback, nova verificação de journal, contratos, idade e margem.
   Falha nessa etapa pode consumir a reserva sem consumir tentativa de RPC. Nunca apaga/reseta.
3. Após encaminhar perda: qualquer timeout, erro HTTP/JSON, recibo divergente, interrupção ou
   expiração para o fluxo. LOSS_INTENT pode permanecer com perda+movimento já commitados.
   Auditoria não é enviada depois de perda incerta. maxRetries=0, maxRedirects=0.
4. Entre perda e auditoria: o contrato real mantém perda+movimento na transação da perda;
   auditoria é outra RPC/transação. Falha parcial pode deixar perda sem auditoria. Nova intenção
   e todos os gates são obrigatórios antes da auditoria. Não completar a auditoria por replay.
5. Após auditoria incerta: AUDIT_INTENT permanece; leitura pode observar ambas sem retomar.
   Sucesso visual/toast não comprova auditoria; recibos/cardinalidades/custos/histórico são exigidos.
6. Fechamento: guarda verifica falhas também após fechar o contexto; COMPLETE exige reconciliação.
   Integridade do journal é conferida novamente depois de fechar runtime/sessões. Alteração
   rebaixa PASS provisório para BLOCKED. Falha de cleanup nunca libera replay.

Recuperação --recover-readonly exige agora **dois** valores externos confiáveis:
QA_C2_JOURNAL_SEMANTIC_CHECKSUM e QA_C2_JOURNAL_BYTES_MANIFEST_SHA256 (parâmetros PowerShell
JournalSemanticChecksum e JournalBytesManifestSha256). O relatório publica também
journal_file_byte_hashes e journal_is_signature=false. Uma cauda final truncada é preservada;
o manifesto inclui seus bytes e o checksum semântico se refere ao último registro completo.
Sem prefixo verificável, há bloqueio para revisão manual, nunca criação de novo journal.

## Limitações que continuam relevantes

- Timeout/cancelamento HTTP limita a espera do cliente; não comprova rollback, interrupção ou
  término do servidor. A margem de 5s é controle de admissão, não prazo garantido de commit.
  Qualquer resultado incerto exige parada e reconciliação somente leitura, sem retry, reposição,
  compensação, auditoria avulsa, IDs substitutos ou cleanup. Ausência pontual não libera replay.
- Reserva/mutex são locais e operacionais, sem lock distribuído. Administrador local ou código
  com a mesma identidade pode mudar arquivos e recalcular hashes; não há assinatura, segredo
  de integridade ou resistência a esse ator. Verificar hashes externos fora da pasta do journal.
- Fsync foi exercitado, queda elétrica não. Windows não fornece o fsync de diretório usado
  no Linux. Nenhum teste comprova durabilidade contra toda falha de hardware/armazenamento.
- Segurança é revalidada contra capturas fixadas até 24h, sem recaptura automática ou prova
  contínua do servidor. Janela operacional sem DDL/outros operadores e revisão atual seguem
  obrigatórias; drift concorrente administrativo não é eliminado pelos gates locais.
- Testes Chromium são simulados, sem rede TEST. SQL em PGlite é local/descartável e não prova
  contenção real, TLS ou afinidade do conector. Driver psql foi revisado estaticamente, ainda
  não executado em uma sessão real. Autenticação e preflight C2 reais continuam pendentes.

## Seed separado e publicação

[Procedimento exato de sessão única, hashes, orçamento e reconciliação](./QA_C2_SEED_SAME_SESSION_PROCEDURE_20261102.md).
Os dois SQLs revisados mantêm bytes/hashes; o novo driver .psql é artefato separado e somente
para revisão. Ele não é importado pelo executor ou executado pela CI. Futuro seed exige aceite
expresso do **seed sem movimento inicial**. A autorização da perda é posterior e separada,
após fixture confirmada, revisão de segurança atual e preflight autenticado PASS.

Orçamento da perda: até **1 tentativa de RPC perda + 1 de auditoria**, sem reposição automática.
Provisionamento tem orçamento próprio: 1 transação/3 INSERTs e efeitos físicos/locks descritos
no procedimento. Não se somam novas fixtures ao orçamento da perda.

Evidência de testes/CI e SHA validado será registrada no fechamento desta publicação.
