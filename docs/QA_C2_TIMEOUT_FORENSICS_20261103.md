# C2 — investigação do timeout preservando a tentativa consumida

**Causa imediata comprovada: timer do cliente de 120s. Causa da espera: indeterminada.**
Seed continua BLOCKED/result_uncertain, uma tentativa consumida, marcador preservado, sem
reenvio. Perda não autorizada. Nenhuma conexão ao TEST nesta investigação; reconciliação de
15:14 UTC já concluída não foi repetida. A/fotos, B #1253, C1 e cobertura 16/60 preservados.

[Evidência sanitizada](./evidence/stock-c2-timeout-forensics-20261103.json) ·
[Encerramento original, sem alteração](./QA_C2_SEED_ATTEMPT_CLOSURE_20261103.md).

## Sequência reconstruída dos arquivos existentes

HEAD inicial desta investigação: 5df21ac79a5b02ba1e11a1872b1cbbb916ec1264.
Código da tentativa: 3cebe484596b35d2998daa56eab2361c8c997195. Tempos em UTC, 03/11/2026:

| Evento salvo | Horário | Limite da evidência |
| --- | --- | --- |
| Intenção de admissão | 15:10:16.176 | Gravada antes dos gates/snapshot |
| Intenção nativa | 15:10:16.930 | Antes de spawn; não é timestamp de criação do SO |
| Prompt observado, psql PID 11332 | 15:10:16.951 | Bytes recebidos de stderr do filho, não autenticação |
| Resultado final com timedOut=true | 15:12:16.951 | Não havia eventos separados de timer, exit e close |

São 120.021ms entre intenção nativa e resultado, e 120.000ms entre observação do prompt
e resultado. O código antigo inicia o timer após spawn/listeners. Ele inclui espera humana,
conexão e execução, limitado também pela janela: Math.min(120000, restante). Não é um
timeout SQL de 120s. O servidor tinha statement_timeout separado de 20s e libpq connect_timeout
de 10s; não abrangem a espera anterior de senha. A janela ainda tinha tempo, mas não reabre
o orçamento. O handler antigo chamava stop(), que marcava interrupted=true também no timeout;
esse campo não comprova Ctrl+C, fechamento da janela ou ação do operador.

Stdout: zero bytes. Stderr: dez bytes, exclusivamente o prompt nativo, sem diagnóstico
de autenticação/DNS/rede/TLS. Não há recibo nem PID de backend no transcript. Os primeiros
SELECTs do driver usam gset, que não imprime linhas. A reconciliação anterior é observação
pontual de ausência e de nenhuma sessão correspondente; não demonstra entrega, rollback ou
COMMIT histórico. Seus resultados e classificação permanecem os originais.

Dez arquivos originais inventariados; os hashes registrados pelo relatório e pelo encerramento
foram novamente conferidos localmente. Hash do marcador continua
0de51a3f1f0e91450ce820eeff10bc71ccc9b1b7b67a0361273315f58079b34c.
Não foram lidos histórico de comandos, buffer de entrada ou senha. Nenhum arquivo original
foi regravado para acrescentar esta análise.

## Entrada, console e hipóteses delimitadas

PowerShell ConsoleHost chama Node sincronamente, sem pipeline de senha. Node exige stdin TTY
e cria diretamente o psql, shell=false, stdin=inherit, stdout em arquivo privado e stderr em
pipe drenado. O pipe transporta somente saída. Node não faz resume/read/data em stdin. O
ambiente seleciona OSTYPE=msys apenas no psql: no
[sprompt.c do PostgreSQL 17.11](https://github.com/postgres/postgres/blob/REL_17_11/src/common/sprompt.c),
isso usa stdin/stderr e desativa eco via SetConsoleMode. A semântica de inherit está na
[documentação oficial do Node 22](https://nodejs.org/docs/latest-v22.x/api/child_process.html#optionsstdio).

No [startup.c 17.11](https://github.com/postgres/postgres/blob/REL_17_11/src/bin/psql/startup.c),
-W mostra o prompt antes de PQconnectdbParams. Portanto, o prompt sozinho não comprova
conexão/TLS/backend. O retorno normal de simple_prompt imprime e descarrega uma quebra de
linha em stderr; sua ausência é compatível com espera de entrada não concluída, sem constituir
prova absoluta de que a senha não chegou ou SQL não foi enviado. Perda de observabilidade,
interrupção entre fases e outras falhas continuam possíveis.

O caminho configurado podia entregar entrada ao psql, e o controle local demonstrou essa
capacidade. Não foi encontrado consumidor concorrente de stdin no código. Porém, não havia
registro original de handle do filho, associação de console, foco, conclusão do prompt ou
backend autenticado. A declaração antiga console_input_inherited=true era configuração,
não medição; ela não resolve um eventual conflito de janela/filho naquela tentativa.

Hipóteses compatíveis: demora no prompt, entrada em outra janela/sem ENTER, falha de entrega
ao console, ou progresso posterior sem evidência suficiente. Espera após autenticação é
possível em geral, mas tem menos suporte neste transcript sem quebra de linha; não atribuir
probabilidade nem classificar como erro de senha, DNS, rede ou TLS sem diagnóstico positivo.
O timer local é a única categoria de falha demonstrada no registro.

## Reprodução local e adaptações explícitas

PostgreSQL/psql 17.11, binário SHA-256
c290c7f0a3335f290f8c18011a1e5afa03ee3cdd628697a5f3e767e5f1d3d10d, igual ao cliente instalado
e ao pacote EDB já verificado. Cluster descartável exclusivo, somente 127.0.0.1, porta dinâmica,
CA LOCAL_ONLY e TLS verify-full. Autenticação LOCAL trust, sem simular senha/SCRAM de TEST.
Console próprio com título de laboratório, nenhum acesso à janela ou entrada da tentativa real.

| Caso | Resultado observado |
| --- | --- |
| Operador demora | Prompt, mesmo console/eco desligado, nenhum input; timer encerra com stdout vazio |
| Entrada não chega | Adaptador propositalmente defeituoso com pipe aberto sem bytes; prompt e timeout |
| Autenticado/SQL demora | Observador local viu backend autenticado e pg_sleep ativo; stdout continuou vazio até timeout |
| Processo encerra antes da entrada | Filho terminado após prompt; exit/close antes do timer, nenhum envio de entrada |
| Controle de encaminhamento | Mesmo console, eco desligado; somente ENTER público enfileirado; psql conclui SELECT/recibo sintético |

Cinco casos PASS. O helper consulta GetStdHandle/GetConsoleMode/GetConsoleProcessList e só
pode enfileirar ENTER após validar laboratório, loopback e os PIDs Node/psql no mesmo console.
Não lê entrada, histórico ou teclas. Essa prova vale para a réplica, não para a tentativa antiga.
O caso com pipe é um adaptador separado e intencionalmente inválido; a API operacional não
ganhou opção de senha em pipe. Os timers curtos dos ensaios não alteram o limite operacional.

Também passaram sete regressões nativas locais: sucesso, erro SQL=3, desconexão=2, ausência
de recibo com exit=0, timeout, CA inválida e hostname inválido. Somente SQL sintético; nenhum
driver/SQL aprovado de seed carregado. Os dois servidores locais foram parados; diretórios,
logs, dados e certificados do laboratório foram retidos, zero remoções. Os ensaios anteriores
à correção final do journal também foram preservados; os dois clusters anteriores foram
parados. Nenhum marcador real
criado pelo laboratório. Arquivos aprovados e gates não foram adaptados para os ensaios.

## Correção futura preparada e limites

O transporte agora distingue TIMEOUT, SIGINT/SIGTERM, falha de transcript/callback e falha
do journal. Grava eventos exclusivos com UTC/tempo monotônico para spawn solicitado, spawn
confirmado pelo Node, prompt, timer, solicitação de término, exit e close. Spawn confirmado
é evento do cliente, não prova remota. O status informa política de stdin e TTY do pai,
mantendo input_delivery_proven=false e window_focus_proven=false. Não afirma senha recebida.

Falha de persistência de evento fecha o resultado como não confirmado e tenta terminar o
filho, sem retry; recibo com transcript/terminação não confirmados não pode gerar PASS.
Um evento final sela o journal antes de o chamador calcular os hashes; callbacks tardios de
exit/close não acrescentam arquivos após esse ponto. Se a parada foi antecipada, o evento
final informa que a terminação não foi confirmada. A regressão dessa corrida também passou.
Regressões cobrem timer versus sinal, ordem monotônica dos eventos, preservação em colisão
de arquivo e rejeição de recibo após falha de integridade. Arquivos exclusivos/fsync e hashes
locais ajudam a detectar alteração, mas não são assinatura, nem proteção contra administrador
local, relógio alterado, falha de disco/energia ou perda do processo antes do último evento.
Interrupção/kill não comprova término do backend nem rollback. Diretório e classificação
originais não são migrados para o novo formato.

O timeout operacional continua 120s limitado pela janela. Marcador permanente, orçamento,
guard de código/prova, TLS e quatro arquivos SQL/psql aprovados permanecem intactos. A correção
diagnóstica não soluciona por si só a espera humana nem habilita execução; altera código e
invalida qualquer uso futuro da prova antiga pelo guard existente.

## Opções para revisão específica

1. Manter seed bloqueado e encerrar a investigação com causa imediata comprovada e espera
   indeterminada; prosseguir apenas em lacunas independentes já autorizadas.
2. Se houver pergunta nova sobre servidor, revisar primeiro uma consulta de leitura dirigida
   a esse fato e à retenção dos registros. Não repetir a reconciliação de ausência já concluída.
3. Revisar futuramente um protocolo de prontidão/autenticação na mesma sessão, com fases
   observáveis e admissão mutante separada, mantendo teto/janela e tratamento de incerteza.
   Exigiria desenho, testes e revisão próprios; não está implementado nem autorizado aqui.

Nenhuma opção autoriza apagar marcador, trocar IDs/TEMP/máquina, repor orçamento ou reenviar.
Eventual decisão operacional exige revisão explícita da tentativa consumida; renovar janela
ou prova isoladamente não basta. Perda permanece fora do escopo e não será pedida agora.

## Validação do pacote

Launcher/transporte: 14/14 regressões PASS. Demais verificações C2 offline: 60/60 PASS nos
arquivos concluídos. A primeira rodada detectou somente dependência PGlite ausente no
ambiente local; instalada a versão 0.3.15 já fixada na CI, o arquivo afetado passou 11/11,
sem modificar testes ou SQLs aprovados para contornar o erro. Build local PASS.
Ensaios nativos finais: 5/5 cenários de console/timeout e 7/7 casos de protocolo/TLS PASS.
Hashes dos artefatos futuros estão na evidência. Código validado:
fec16b1e6cbf5cbe7feca8b65d862415e124c45e. A
[CI 41666423401](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41666423401)
concluiu PASS: Linux 74/74 e Windows 74/74, build e parse PowerShell PASS nos dois.
A publicação posterior deste resultado altera somente documentação/evidência; o código tem
os mesmos bytes do SHA validado. A suíte CI existente é exigida pelo caminho C2 alterado,
sem conexão TEST ou execução de jornadas reais encerradas.
