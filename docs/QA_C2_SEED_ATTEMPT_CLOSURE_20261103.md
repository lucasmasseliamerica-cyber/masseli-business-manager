# C2 — tentativa única consumida; resultado incerto; sem retry

**Parar o envio. Marcador e todos os artefatos preservados.** A autorização condicional e
a janela recebidas foram usadas em uma única invocação nativa; não autorizam outro envio,
mesmo com tempo restante na janela. Perda continua sem autorização. Cobertura 16/60.

[Registro sanitizado](./evidence/stock-c2-seed-attempt-reconciled-20261103.json) ·
[Autorização e estado atualizado](./evidence/stock-c2-seed-conditional-authorization-20261103.json).

## Admissão e orçamento

Autorização explícita do usuário: somente TEST msinksoilkluooxenecy, SQL SHA-256
6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635, uma transação e três
INSERTs de saldo 2,000/custo 0,1000 sem movimento inicial, IDs revisados, locks e resíduos aceitos.
Janela confirmada: 2026-11-03T15:08:00Z–2026-11-03T15:28:00Z, sem outras operações ou DDL.

Admissão no HEAD QA limpo 3cebe484596b35d2998daa56eab2361c8c997195, apenas documentação
posterior à prova nativa PASS de 14:59:32 UTC, válida até 15:29:32 UTC. Código/dependências,
binário/CA e SQLs/driver com hashes revisados; zero tentativas SeedAuthorized anteriores e
marcador inexistente antes da admissão. O SQL autorizado e os guards não foram alterados.

O launcher criou exclusivamente o marcador permanente antes de invocar o psql; seu hash:
0de51a3f1f0e91450ce820eeff10bc71ccc9b1b7b67a0361273315f58079b34c.
Vínculo do marcador ao HEAD e aos hashes de seed/driver/reconciliação conferido.
Uma invocação nativa tentada não é prova de recebimento de SQL ou COMMIT no servidor.

## Resultado da única tentativa

- Início 15:10:16.930 UTC; fim 15:12:16.951 UTC de 03/11/2026
  (10:10:16–10:12:16 America/New_York), dentro da janela.
- Status BLOCKED, C2_SEED_NATIVE_RESULT_UNCONFIRMED_NO_REPLAY; result_uncertain=true.
- Limite do cliente de 120s atingido; processo terminado pelo launcher. interrupted=true
  decorre do encerramento pelo timer, sem evidência de interrupção manual do usuário.
- exitCode=null, timedOut=true, spawnError=false, promptObserved=true, attempts=1.
- Stdout vazio; stderr de 10 bytes contém somente o prompt nativo Password:.
  Sem diagnóstico de autenticação/DNS/rede/TLS e sem recibo de COMMIT. Não inferir que o
  usuário digitou/não digitou a senha nem que o servidor fez rollback a partir disso.
- Processo local psql PID 11332 encerrado; console PowerShell pode continuar aberto em PS>.
  Não digitar senha no PS>. Nenhum segundo psql de seed foi iniciado.
- Logs, snapshots, relatório, intenção e status do prompt preservados com hashes conferidos.
  Dados brutos permanecem privados; senha não foi capturada pelo launcher.

## Reconciliação exclusivamente de leitura

Arquivo congelado stock-c2-provision-reconcile-readonly.sql, SHA-256
304361cbf214905fdd0511af9f33764606187008ea42f45524149e4878ab1fb6, executado somente como
leitura no TEST pelo conector. Não foi usado o driver de seed nem outra conexão nativa mutante.

Snapshot às 15:14:00 UTC: **ABSENT_UNCONFIRMED_NO_RETRY**, zero local/item/posição e rótulos,
zero posições relacionadas/movimentos/perdas/auditorias/receitas/linhas de compra. Observação
pontual, não prova de rollback, não atestado de entrega/ausência de SQL e não permissão de replay.

pg_stat_activity às 15:14:01 UTC: zero sessões com application_name nexalvo-c2-seed-once,
zero correspondências na faixa de início/fim da tentativa e zero sessões ativas desse nome.
Nenhum PID de backend original foi obtido pelo psql; a busca por aplicação/horário é o limite
da identificação disponível. Não há sessão correspondente observável, sem alegação de prova
criptográfica sobre o histórico do servidor.

## Estado final e continuidade

Autorização **consumida como tentativa**, resultado de entrega/commit **não comprovado**.
Fixture não observada na reconciliação; não declarar provisionamento PASS, rollback comprovado
ou operação nunca enviada. Nenhuma perda/auditoria de negócio/reposição/migração/cleanup foi
iniciada pelo agente. A/B/C1 e seus históricos/checkpoints preservados, sem repetição.

Não apagar, mover ou substituir marcador; não trocar TEMP/máquina/IDs; não prolongar timer,
alterar guard ou reexecutar por inferência. A janela restante não reabre o orçamento. Eventual
continuidade é somente investigação/leitura e revisão manual do resultado e da autorização
consumida; esta publicação não solicita nem presume nova autorização ou tentativa.
