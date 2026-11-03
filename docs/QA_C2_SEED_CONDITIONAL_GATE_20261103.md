# C2 — seed autorizado condicionalmente; envio bloqueado pela janela/gates

Autorização específica recebida do usuário em 03/11/2026. Não solicitar novamente autorização
genérica para esse mesmo escopo. [Registro sanitizado](./evidence/stock-c2-seed-conditional-authorization-20261103.json).

Escopo: somente TEST msinksoilkluooxenecy; SQL SHA-256
6ec2dc2fada7d69f1561b2848c29a11d647aa79c6ada6068ad26f0aa71b90635;
uma transação, três INSERTs e três linhas permanentes nos IDs revisados de local/item/posição.
Saldo 2,000 e custo 0,1000, **sem movimento inicial**. Locks e resíduos documentados aceitos.
Não inclui perda, auditoria de negócio, reposição, cleanup, migração, IDs substitutos ou retry.
A/fotos, B #1253 e C1 permanecem encerradas; nenhum ciclo/sondagem será repetido.

## Conferência dirigida, sem alterar código ou guards

Base local/remota 823338b3d1156c9989744323185d1dafc62b7419, QA limpa. Comparação do closure
de imports do launcher e arquivos PowerShell/SQL leitor com o código validado
56baf2dd75c3581f8d554f7b58477405e6a6307b: sem mudança. Reutilizada a CI 69/69 Linux/Windows.
O delta do aplicativo é somente alerta de calendário de compras, não importado pelo launcher,
com CI própria 29/29. Não repetir baseline nem modificar o guard de diferenças somente docs/.

SQL de seed, reconciliação, driver e novo leitor: hashes revisados conferidos. Launcher/transporte
e ACL mantêm os hashes publicados. psql 17.11 e CA também mantêm os hashes revisados.
Os registros locais existentes contêm apenas VerifyReadOnly; nenhum SeedAuthorized e nenhum
marcador permanente presente. Ausência de tentativa remota será corroborada pela elegibilidade
da nova leitura, sem depender apenas de ausência de arquivo local.

A prova nativa anterior foi concluída às 05:07:56 UTC e venceu às 05:37:56 UTC. Além disso,
seu HEAD antecede a alteração App.jsx: não atende ao guard atual. Renovação somente leitura
é agora necessária para esta operação condicionalmente autorizada, não para manter evidência
artificialmente atualizada. Usar nova pasta de artefatos, preservar as anteriores e obter prova
no HEAD atual, com console/Password nativos, host direto TEST e TLS verify-full. Não usar
driver de seed, variáveis mutantes ou marcador permanente durante essa renovação.

## Gates antes do único envio

- Novo PASS nativo somente leitura, com mesmo backend antes/depois, empresa/OWNER ativos,
  zero colisões e contratos atuais; validade máxima 30min na admissão do launcher.
- HEAD QA limpo/revisado, hashes intactos e nenhuma tentativa de seed anterior.
- Confirmação **separada do proprietário** de início/fim UTC da janela exclusiva, até 20min,
  com pelo menos 30s restantes. O usuário informou que confirmará quando tudo estiver pronto.
- Revalidar esses gates imediatamente antes do envio. Só então pode ser criado o marcador
  exclusivo e feita a única invocação de seed. Se algum gate falhar, não afrouxá-lo.

Não há janela definida nem envio autorizado para agora. Em resultado incerto: preservar
artefatos/marcador e reconciliar somente por leitura; nunca reenviar por inferência.
Perda permanece sem autorização, inclusive depois de eventual seed confirmado.
Cobertura operacional permanece 16/60. Este documento registra autorização, não execução.

## Renovação concluída — falta somente a janela UTC

Prova nativa PASS em 03/11/2026 às **14:59:32 UTC (09:59:32 America/New_York)**,
saída 0, C2_NATIVE_READONLY_CONNECTION_ELIGIBILITY_PASS_NO_SEED.
Fonte QA limpa 6052c02d6fc5e8c77f8454206aa7ae52b9c74dc4, descendente documental do HEAD
823338b revisado acima. Não houve modificação de código/guards/SQL entre revisão e prova.

- TEST msinksoilkluooxenecy, host direto/porta 5432, banco/role postgres.
- TLS verify-full, TLSv1.3/TLS_AES_256_GCM_SHA384, mesmo backend PID 4142831,
  backend_start/endereço/porta e identidade antes e depois; READ ONLY confirmado.
- Autorização/GUC mutante ausente na sessão; marcador permanente não criado.
- Empresa/OWNER ativos, zero colisões e contrato 135e8025db9f8097377432b0ff26fe8c mantido.
  Catálogo de estoque/precisão/auditoria/leitor de perdas PASS. Não é preflight da perda.
- Hashes dos artefatos reconferidos; dados brutos privados e todas as tentativas anteriores
  preservados. Nenhuma tentativa SeedAuthorized registrada neste ambiente.
- Leitura suplementar às 14:57:28 UTC encontrou zero linhas e zero resíduos relacionados.
  ABSENT_UNCONFIRMED_NO_RETRY é observação pontual; não prova rollback nem habilita replay.

Prova válida por até 30min na admissão: **15:29:32 UTC (10:29:32 America/New_York)**.
O guard de SHA e diferenças somente docs/ permanece intacto. Revalidar hashes, marcador,
prova e elegibilidade antes do único envio. Se a prova vencer antes da janela, renovar apenas
o gate operacional necessário; a autorização condicional deste escopo não precisa ser pedida
genericamente de novo. Nenhuma janela é presumida a partir dos horários desta prova.

Estado: **preparação PASS; envio BLOQUEADO até início/fim UTC confirmados separadamente pelo
proprietário**. Não foi usado o driver de seed nem definido token mutante neste lote.
Autorização de seed ainda não consumida. Perda e auditoria de negócio seguem fora do escopo.
