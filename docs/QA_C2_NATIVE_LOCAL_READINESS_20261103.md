# C2 — adaptador nativo em PostgreSQL descartável local

Escopo: implementação e validação local, **sem caminho operacional**. O marcador histórico
continua bloqueando a tentativa consumida; nenhum reset, substituto, novo ID de fixture ou
envio ao Supabase foi criado. Investigação histórica, A/fotos, B #1253, C1 e auditorias
encerradas não foram reabertos. Cobertura permanece 16/60.

O controlador e os 17 testes do [modelo de prontidão](./QA_C2_FUTURE_READINESS_PROTOCOL_20261103.md)
foram reutilizados. A extensão aceita um adaptador exclusivamente de cluster descartável
local; não converte evidências nativas em respostas SIMULATED. O simulador anterior permanece
separado e não é fallback em caso de dependência ausente ou falha da integração.

## Implementação e fronteiras

Arquivos em prototypes/c2-readiness/native:

| Arquivo | Responsabilidade |
| --- | --- |
| cluster.mjs | initdb PG17 próprio, certificados locais, HBA somente cert em loopback, início/parada e retenção dos arquivos |
| adapter.mjs | único psql por sessão, validação da prova SQL/TLS/cluster, framing, coordenação e término dos filhos |
| bootstrap.psql.in + identity.sql | somente leituras antes dos gates; duas provas no mesmo psql/backend |
| readiness-helper.mjs | prontidão pública, verificação de intenção/reserva e publicação exclusiva do dispatch |
| synthetic-dispatch.psql.in | transação com uma TEMP table/linha 42, assertions, COMMIT e recibo no mesmo backend |
| common.mjs | ambiente libpq fechado, hashes, persistência exclusiva e controles temporais |
| demo.mjs | comando reproduzível que cria/encerra seu cluster local e preserva evidências |
| integration.test.mjs | somente os 11 casos novos da integração nativa |

O adaptador não aceita host, string de conexão ou SQL do operador. Endereço é sempre
127.0.0.1, porta dinâmica do manifesto de um postmaster local vivo. O identificador do
cluster vem de pg_controldata antes da conexão e deve coincidir com pg_control_system na
sessão SQL real. Também se conferem o PID do postmaster/porta e os hashes de HBA,
certificados/chaves locais e binário. Nenhum bootstrap/driver operacional de seed é lido.

O cliente libpq usa verify-full e CA local fixada, certificado/chave de cliente e papel
postgres. HBA do cluster novo aceita exclusivamente hostssl/cert em loopback e rejeita
hostnossl/local. A autenticação é X.509 real: PostgreSQL exige certificado confiável e CN
do usuário correspondente, conforme [PostgreSQL 17 — cert](https://www.postgresql.org/docs/17/auth-cert.html).
Certificado com CN incorreto e CA não confiável são testes negativos reais, sem respostas
fabricadas. pg_stat_ssl confirma SSL, versão/cipher e client_dn, e a identidade inclui
cluster_id, backend_pid/backend_start, database, SQL/session role e endereço/porta locais.

O parser aceita as representações equivalentes CN=postgres e /CN=postgres produzidas pelas
pilhas nativas verificadas; não aceita um CN diferente. O formato nativo observado no Windows
precisou dessa normalização explícita. O hash e o conteúdo do certificado continuam fixados.

## Ordem efetiva do protocolo

1. O controlador fixa prazo UTC/monotônico antes de iniciar o psql; o manifesto de sessão
   e bootstrap contêm apenas controle/leitura. Dispatch executável ainda não existe.
2. Um único psql -X -f autentica por certificado com TLS verify-full. Sua primeira transação
   READ ONLY devolve a identidade real. O adaptador valida todos os campos e persiste a prova.
   Um helper é chamado sincronamente por esse psql e espera a prova validada.
3. Só então o helper recebe prontidão pública e emite ack vinculado à prova, hash da operação,
   janela e escopo NATIVE_DISPOSABLE_ONLY. Na CI/harness, a prontidão é declarada pelo operador
   sintético do laboratório. Em modo manual, o helper solicita READY no console herdado;
   psql fica aguardando o helper, sem competir pela entrada.
4. O controlador persiste intenção exclusiva/fsync e revalida a margem. Sem sucesso, não
   publica sequer a liberação para a segunda leitura. O helper confere intenção/ack/hashes,
   termina, e o bootstrap exige sucesso do helper antes de prosseguir.
5. O mesmo psql faz nova transação READ ONLY. PID + backend_start, cluster, papel, TLS e demais
   campos devem ser idênticos. Não existe reconexão ou segundo cliente entre essas fases.
6. O controlador reserva o único slot local duravelmente; falha parcial já conta como slot
   incerto. Só depois libera o helper de dispatch. Esse helper confere intenção, reserva,
   segunda prova, fontes/hash e prazo/margem. Apenas então publica dispatch.local.psql.
7. O psql exige sucesso do helper antes de incluir o dispatch. Um arquivo parcial/erro do
   helper não habilita a inclusão. Dentro da transação sintética, antes da TEMP table/INSERT,
   há assertion de backend_pid/backend_start, cluster_id e prazo UTC. A linha 42 é conferida
   antes de COMMIT; a tabela temporária é ON COMMIT DROP, sem fixture permanente.
8. Confirmação exige tag COMMIT na fase mutante, recibo/pós-condições/identidade esperados,
   exit 0 e prazo ainda válido, além de journal final íntegro. Prontidão, reserva e echo da
   fronteira não comprovam entrega SQL. Incerteza encerra definitivamente sem replay.

Arquivos de controle/permit são escritos em nomes .pending exclusivos, fsync e fechados
antes da publicação por hard link exclusivo (sem overwrite). Os .pending são retidos.
O psql espera o helper terminar e verifica SHELL_ERROR antes de qualquer inclusão. O journal
reutilizado usa create-new/fsync; arquivos de intenção/reserva já estão fechados antes de a
liberação correspondente ser publicada. Qualquer diretório de journal anterior bloqueia
reinício/resume. Nenhum desses arquivos é um marcador operacional de seed.

## Prazo, filhos e senha

Teto absoluto **120.000ms**, contado antes de abrir psql, e margem mínima **30.000ms**.
A janela só encurta o teto; autenticação, prontidão ou persistência não reiniciam relógio.
Helpers conferem UTC/monotônico e margem; watchdog do controlador cobre também espera em
prompt e helper. Nenhum timer operacional foi ampliado. Timeout significa parada, sem
alegação de rollback do servidor.

Encerramento fecha o psql e seu grupo/árvore: taskkill /T /F no Windows, grupo POSIX no Linux.
Helpers observados também são tratados quando o psql morreu antes deles. PID de psql,
helpers e shells observados são conferidos antes de registrar término. O evento exit trata
a morte do psql sem esperar close, pois um helper órfão pode manter um handle stdout aberto.
READY concorrente à morte do psql não vale como prova de backend vivo; a releitura impede
reserva/dispatch. Os testes exercitam essa corrida e verificam término dos filhos.

**Não existe senha criada, fornecida ou capturada pela automação.** O caso positivo autentica
por certificado; chave privada X.509 não é senha e fica apenas na árvore privada do laboratório,
fora do Git/pacote público. PGPASSWORD não é herdado. PGPASSFILE aponta a caminho local que
deve estar ausente, evitando leitura de credenciais do operador. -X impede psqlrc.
Não há senha em argumentos, arquivos, logs ou leitores de stdin do adaptador.

O teste de demora executa o psql real com -W e mantém seu stdin vazio/aberto, sem escrever
ou ler qualquer entrada. OSTYPE=msys seleciona o caminho padrão de prompt no Windows;
no Linux o processo separado não tem terminal de controle e usa o pipe vazio. O prompt
nativo é observado em stderr; os 120s expiram **antes da autenticação/prova, intenção,
reserva e disponibilidade do dispatch**. Trata-se de teste de espera nativa sem senha,
não de automação de senha nem de prova de console físico/SCRAM.

## Reprodução

Dependências: Node 22+, binários completos PostgreSQL 17 (incluindo share para initdb),
OpenSSL e permissão de criar cluster/porta loopback. Ausência ou versão incompatível bloqueia;
não há fallback para simulação. A demonstração automatizada real usa:

    node prototypes/c2-readiness/native/demo.mjs --pg-bin "CAMINHO_PG17_BIN" --openssl "CAMINHO_OPENSSL" --artifacts "DIRETORIO_LOCAL_EXISTENTE"

Para prontidão pública no console nativo, acrescente --manual true e execute em console com
stdin TTY. O modo manual exige READY apenas depois da prova, não solicita senha de banco.
A CI usa modo scripted-local, declarado como tal. O script sempre tenta encerrar sessão e
servidor próprios em finally; preserva cluster, logs, certificados e demais arquivos, sem
cleanup de arquivos. Não usar esses certificados de laboratório fora desse escopo.

Testes reutilizados: node --test prototypes/c2-readiness/protocol.test.mjs (17).
Integração nova: node --test prototypes/c2-readiness/native/integration.test.mjs (11), com
C2_NATIVE_PG_BIN, C2_NATIVE_OPENSSL e opcional C2_NATIVE_ARTIFACTS definidos. Um teste leva
120s intencionalmente. Nenhuma jornada, reconciliação histórica, auditoria F01–F05, build
ou suíte aprovada fora do modelo reutilizado faz parte desses comandos.

CI: modelo 17 casos em Linux/Windows; integração 11 casos próprios em Ubuntu 24.04/Windows.
Windows baixa ZIP oficial EDB 17.11-5 com SHA-256
80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f. Linux usa PG17 do
[repositório PostgreSQL](https://www.postgresql.org/download/linux/ubuntu/), versão/hash
registrados por execução. As CAs são geradas exclusivamente para cada cluster local;
não se usa nem altera a CA do Supabase. Resultados finais e hashes constam da evidência.

## Limitações e checkpoint

Autenticação nativa por certificado e TLS são reais; autenticação interativa por senha/SCRAM
não foi validada nem é reivindicada. O prompt vazio comprova somente espera/timeout antes
da exposição. Na CI, READY representa o operador de laboratório; foco/ação humana física e
o modo manual permanecem sem validação de operador real.

Testes de persistência exercitam exclusividade/erro observável e falha fechada, não queda de
energia/disco ou ataque de administrador local. Hashes são detecção de bytes/semântica,
não assinatura. Terminação por árvore/PID não substitui job objects/supervisão contra todas
as corridas possíveis de criação/reuso de PID, e nunca prova rollback. O adaptador restringe
endereço/cluster/arquivos, mas não protege uma máquina cujo administrador altera o código.

O papel postgres e a TEMP table pertencem exclusivamente ao cluster descartável. Não foi
adaptado nem carregado SQL seed operacional, e este pacote não é autorização de novo seed,
perda ou migração. assertRealExecutionBlocked continua rejeitando o caminho operacional;
diretório, nome ou protocolo novo não altera o marcador/tentativa histórica. Qualquer
continuidade real exigiria revisão e autorização específica que reconheça essa tentativa.
