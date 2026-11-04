# C2 — fechamento definitivo da preparação SCRAM local

**CLOSED_WITH_DELIMITED_BLOCKER.** A única tentativa final autorizada foi executada e
encerrou BLOCKED. Não haverá outra abertura manual automática, correção ou rodada de testes
neste escopo. Positivo manual e demora na senha permanecem PASS, com bytes originais
preservados. O caso de timeout aguardando READY permanece **não comprovado**. Cobertura 16/60.

O operador confirmou disponibilidade antes da abertura. Foi selecionado exclusivamente
readiness-delay no demo existente; os outros casos não foram repetidos. Código executado:
c29187a7b5b805ca3574734b611327abc91c531a, preservado no HEAD documental
87445e578451508197f9aa9629c885d40549bb3c antes desta execução. Nenhum arquivo de implementação
foi alterado nesta tentativa. Teto 120s, margem 30s e janela local encurtada de 60s inalterados.

## Fatos da tentativa final

Run local 19f977e5-efa0-45b3-9b24-9f16bed50b0c. Horários abaixo em UTC de 04/11/2026
(no notebook America/New_York, noite de 03/11/2026, UTC−05:00):

| Evento | Evidência |
| --- | --- |
| 03:10:44.113 | initdb terminou com exit 0, sem timeout; entrada apenas nos prompts ocultos nativos |
| 03:10:46.939 | Disponibilidade/foco do Terminal confirmados antes do início da sessão |
| 03:10:47.005 | Único psql iniciado; prazo fixado em 03:11:46.966 |
| 03:10:47.021 | Password nativo observado, sem captura da entrada pelo agente |
| 03:11:04.229 | Prova READ ONLY persistida/validada, backend 15740, TLSv1.3, identidade local e booleano SCRAM verdadeiros |
| 03:11:04.358 | Prompt humano READY efetivamente registrado pelo helper, após a prova validada |
| até 03:11:31.151 | stderr contém NATIVE_LOCAL_GATE_STOP e o erro SQL de aborto previsto no bootstrap |
| 03:11:31.798 | Journal final STOPPED / NATIVE_PROCESS_EXIT_FAILURE, antes do prazo absoluto |
| 03:11:31.802 | manual-scram-case-result.json: passed=false, sem intenção, reserva ou dispatch |
| 03:11:31.972 | Recibo de parada do postmaster próprio: stopped=true, files_removed=0 |

A autenticação SCRAM foi confirmada no log de servidor para o backend correspondente,
além do HBA fixado e da prova SQL. Não houve erro de autenticação/TLS registrado.

O operador informou que sua captura mostra READY após o prompt e saída BLOCKED/2. Essa
observação é registrada como relato do operador; nenhuma nova captura de teclado, tela,
clipboard, histórico ou senha foi feita. Texto READY na tela não equivale a ack aceito.
operator-ack.local.json está ausente e não há evento OPERATOR_DECLARED_READY.

## Motivo comprovável e limite da classificação

O helper de prontidão terminou com falha; o bootstrap identificou SHELL_ERROR e executou
seu aborto SQL, interrompendo o psql. O controlador registrou NATIVE_PROCESS_EXIT_FAILURE.
Isso ocorreu **antes da intenção e antes da expiração**, portanto não é timeout em READY.

O helper captura falhas publicando apenas NATIVE_LOCAL_GATE_STOP. O código específico
interno da falha não foi persistido. Assim, os artefatos não permitem afirmar se houve
rejeição por margem, resposta inválida ou outra falha do gate. O relato de READY após o
prompt também impede alegar espera comprovadamente sem resposta humana. Não se atribui
uma causa primária por inferência e não se corrige/reexecuta o helper nesta preparação.

## Fronteira e finalização conferidas

- Ausentes: ack de prontidão, intenção, liberação de intenção, segunda prova, reserva,
  liberação de dispatch, arquivo dispatch, permit e evento de fronteira mutante.
- Contador: zero tentativas de encaminhamento/reservas, conforme relatório e journal.
- Journal: sequência CREATED → NATIVE_READ_PROOF → FINAL, sem lacunas; checksum semântico
  da prova confere com a prova validada; estado/motivo finais conferem com o relatório.
- Recibos: término de psql/helper/shell observados confirmado; parada do servidor próprio
  confirmada; nenhum arquivo removido. Psql e postmaster foram também observados inativos.
- Arquivos JSON duráveis e respectivos .pending existentes conferidos por hashes de bytes;
  as fontes fixadas no manifesto continuam com os mesmos hashes. Nenhum artefato antigo
  foi corrigido retroativamente. Não houve criação de recibo ausente para ensaio anterior.

A ausência de stdout ou de linhas não foi usada como prova de não envio. A ausência dos
artefatos de liberação/publicação, a sequência de eventos e os guards do adaptador local
demonstram que a operação TEMP não foi disponibilizada nesta execução.

## Resultado agregado e limites restantes

| Caso | Resultado preservado |
| --- | --- |
| Positivo humano: SCRAM → leitura → READY → mesma sessão → TEMP sintética | PASS anterior, não repetido |
| Demora na senha, antes de intenção/reserva/dispatch | PASS anterior, não repetido |
| Demora sem resposta aguardando READY até o prazo | BLOCKED na tentativa final; não comprovado |

Os dois PASS anteriores e esta tentativa ocorreram em laboratórios locais separados;
não se apresenta isso como uma única execução completa. A lacuna restante é o timeout
autenticado sem resposta em READY, com causa primária do gate indisponível nos eventos.
O fechamento com bloqueio não é aprovação do critério pendente nem nova proposta de ensaio.

CI do código inalterado: [41739696474](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41739696474),
Linux/Windows PASS, seis controles SCRAM e uma regressão nativa afetada por plataforma.
Nenhuma suíte foi reexecutada nesta tentativa final; modelo 17 e suíte completa dos 11
nativos continuam preservados. CI não recebe senha humana nem valida interação física.
Hashes detectam alterações de bytes/semântica, sem assinatura ou garantia contra
administrador local, queda de energia ou morte abrupta da máquina/controlador.

O adaptador permanece limitado ao cluster próprio em loopback, CA local, papel de laboratório
e template TEMP sintético. Não aceita host/SQL operacional nem implementa prova Supabase,
fixture, autoridade ou envio real. Nenhuma conexão ao TEST, seed, perda, migração, cleanup
ou alteração/acesso ao marcador histórico ocorreu. A tentativa seed histórica continua
consumida/bloqueada; perda continua sem autorização. Esta preparação está encerrada.
