# C2 — avaliação dos eventos e pausa manual

Estado: **MANUAL_DEMONSTRATIONS_PAUSED; 2/3 casos aprovados preservados**. Este registro
complementa o checkpoint anterior, sem alterar seus relatórios ou transformar ensaio
inconclusivo em PASS. Nenhum novo prompt será aberto sem decisão específica do operador.
Não houve conexão ao TEST, seed, perda, migração ou alteração do marcador histórico.
Cobertura permanece 16/60.

## Execução que efetivamente alcançou READY

Run local 03685c48-313d-4d7b-a028-67e9f097454f, todos os horários em UTC:

| Evento | Evidência / conclusão |
| --- | --- |
| 23:30:12.834 | Processo psql único iniciado; prazo absoluto local até 23:31:12.796 |
| 23:30:12.849 | Prompt nativo Password observado em stderr, sem leitura da entrada |
| 23:30:35.679720 | Início do backend 20048, conforme identidade SQL real |
| 23:30:35.763 | Primeira prova validada persistida; READ ONLY, papel c2_scram_lab, cluster local esperado, TLSv1.3 e booleano SCRAM verdadeiro |
| 23:30:35.881 | Helper registrou o prompt humano READY, depois da prova validada |
| até 23:30:44.647 | Saída do helper com NATIVE_LOCAL_GATE_STOP; bootstrap parou com divisão por zero conforme guard de SHELL_ERROR |
| 23:30:45.394 | Relatório final: STOPPED / NATIVE_PROCESS_EXIT_FAILURE, passed=false |

A autenticação também foi verificada no log do servidor para o PID correspondente, com
method=scram-sha-256. O operador confirmou no chat que houve tecla/Enter depois da prova e
do pedido de READY; nenhum conteúdo digitado foi solicitado, lido ou registrado pelo agente.

O encerramento ocorreu **no gate humano de intenção**, antes de ack aceito, intenção,
segunda prova, reserva e publicação do dispatch. Intenção ausente, reservas 0, dispatch
ausente; psql/helper/shell observados encerrados e servidor próprio parado. O positivo
humano e a demora na senha anteriores continuam PASS e não foram repetidos.

Essa execução comprova autenticação, leitura, alcance de READY e fechamento antes de
disponibilizar o envio. **Não comprova expiração enquanto aguarda READY**: o encerramento
antecedeu o prazo e houve resposta humana. O helper só publica um código genérico nessa
falha; não é possível distinguir retrospectivamente resposta diferente de READY, rejeição
por margem após a resposta ou outro erro do gate. Não se atribui a causa exata pelo stdout
ou por inferência. Não é necessário repetir para sustentar o fechamento já observado.

## Ensaio adicional iniciado antes da pausa

O diálogo de disponibilidade já aberto avançou no run local
d0cf2d97-958d-4288-bffe-64a7969c0b7c. O initdb encerrou com saída 0; o psql iniciou às
23:31:21.337, exibiu Password às 23:31:21.352 e o journal encerrou às 23:32:21.323 com
ABSOLUTE_DEADLINE. Não há prova SQL validada nem evento de READY. Portanto, autenticação
não comprovada e READY não alcançado; esse ensaio não fecha o caso de demora em READY.

O stdout tem 0 bytes e o stderr só o prompt; isso não prova a entrega ou não entrega de
SQL. A ausência de intenção/reserva/arquivo dispatch e a ordem do adaptador local comprovam
que a operação TEMP não foi disponibilizada por esse protocolo. Não há erro de autenticação
ou TLS registrado que permita atribuir a causa. O relatório específico do caso e o recibo
de término dos filhos/servidor não foram finalizados: a integridade final desse ensaio é
incompleta. Verificação de processos às 23:32:47 encontrou psql e postmaster próprios
inativos; não se converte isso em recibo retroativo. Nenhum marcador foi criado para suprir
essa ausência. Artefatos preservados, sem novo ensaio.

## Alterações dos três arquivos

Código QA: c29187a7b5b805ca3574734b611327abc91c531a.

| Arquivo | Alteração efetiva |
| --- | --- |
| native/console-mode.ps1 | Salva metadados do modo de console antes do botão de disponibilidade; após OK exige Terminal visível e foco confirmado; persiste somente esses metadados, sem capturar teclas |
| native/adapter.mjs | Evita abrir outro PowerShell de Save entre o OK e o início do psql quando o modo já foi salvo |
| native/demo.mjs | O helper de disponibilidade herda stdin do console para GetConsoleMode funcionar antes do botão; a criação da sessão e os relógios continuam posteriores ao OK |

Foi corrigida a ordem de preparação do console e acrescentada uma conferência de foco.
O subprocesso intermediário era uma hipótese de interferência com a entrada, **não causa
comprovada** da tentativa sem autenticação. O run 0368 comprovou que esse caminho corrigido
conseguiu autenticar, validar a leitura e alcançar READY. Isso não garante o encaminhamento
de todas as entradas físicas futuras e não explica a falha de finalização do run d0cf.
Não houve alteração no bootstrap, SQL sintético, persistência, teto 120s ou margem 30s.

CI 41739696474 PASS para esse SHA: seis controles SCRAM novos e uma regressão nativa
positiva afetada em Linux e Windows. Modelo 17 e suíte completa dos 11 nativos não foram
reexecutados. CI não recebe senha humana e não comprova interação física.

## Justificativa e sequência de eventual tentativa final

Nova participação só se justifica se for mantido o critério específico ainda pendente:
**autenticar, comprovar leitura e permanecer sem resposta em READY até o prazo**. A evidência
atual já serve para o fechamento observado antes de reserva, mas não substitui esse critério.
Não será aberta outra janela automaticamente; este texto não solicita nem presume decisão.

Se o operador decidir prosseguir somente com esse caso local:

1. Uma única seleção readiness-delay no mesmo demo, sem repetir positivo/demora na senha.
   Botão de disponibilidade antes do setup; cancelar encerra. Nenhum SQL operacional é lido.
2. Criar e confirmar credencial exclusiva nos dois prompts ocultos initdb, com limite de
   setup já existente; nenhum valor pelo chat, argumento, ambiente, arquivo de senha ou log.
3. Salvar modo do console, aguardar o botão de disponibilidade do psql, clicar OK e exigir
   foco do Terminal. Só então criar o único psql e iniciar a janela local de 60s, que encurta
   o teto absoluto de 120s; margem mínima 30s permanece.
4. Aguardar ver Password, informar a senha e Enter **uma vez**. Depois, retirar as mãos do
   teclado. Ao aparecer prova SQL/READY, não digitar nada, não pressionar Enter e não fechar
   a janela. Não há confirmação adicional pelo chat nessa espera.
5. O controlador deve expirar no prazo original, encerrar os filhos e o postmaster próprio,
   preservando todos os arquivos. Aceitação exige autenticação/prova/READY registrados,
   ABSOLUTE_DEADLINE, zero intenção/reserva/dispatch e recibos finais íntegros.
6. Se autenticação/READY não forem admitidos a tempo, houver resposta humana ou faltar
   recibo, registrar o caso como não comprovado e parar; nenhum timer ampliado ou repetição
   automática. O único caso permanece pendente até decisão posterior.

O laboratório continua restrito a loopback, CA/cluster/papel próprios e TEMP sintética.
Não implementa nem libera o caminho operacional; a tentativa histórica consumida e seu
marcador permanecem integralmente preservados. Perda continua não autorizada.
