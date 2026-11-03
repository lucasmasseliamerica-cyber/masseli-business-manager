# C2 — launcher operacional e conexão nativa somente leitura

**Seed/perda não executados, não autorizados. Cobertura 16/60.** Base QA limpa conferida:
1d7ae30e33c518bfb733431c1e69061f031be956. SHA histórico do código de perda validado preservado:
da7c9de270a4535245751d2297eeaf6e7c63a270. Nenhuma fonte do executor de perda, C1/B, checkpoint,
SQL/driver aprovado, main ou produção foi alterada. Novos arquivos operacionais têm revisão própria.

## Launcher preparado

[Entrada PowerShell](../qa/stock-c2-seed-launcher.ps1), [admissão/relatório](../qa/stock-c2-seed-launcher.mjs),
[transporte nativo compartilhado](../qa/stock-c2-seed-transport.mjs),
[ACL privada](../qa/stock-c2-seed-private.ps1) e [novo procedimento de leitura](../qa/stock-c2-connection-readonly.psql).

VerifyReadOnly e SeedAuthorized são modos separados. O primeiro exige console nativo visível,
SHA/árvore QA limpos, binário/CA revisados, hashes e versão 17; verifica TLS, usuário/banco,
empresa/OWNER, colisões, contrato do seed e contratos de estoque/auditoria por leitura.
Ele não copia/invoca o driver de seed, não define GUC/variável de autorização mutante e não
cria nem consome o marcador permanente. PGOPTIONS fixa default_transaction_read_only=on,
e o procedimento usa uma transação REPEATABLE READ READ ONLY.

O processo psql recebe host TEST direto fixo, porta 5432, usuário/banco postgres,
TLS verify-full/CA explícita e -X -W -v ON_ERROR_STOP=1. Não há URI com senha, variável
PGPASSWORD, serviço/pool alternativo, shell ou retry. Ambiente filho tem allowlist; descarta
PG*/PSQL*/QA_* herdados, inclusive autoridades antigas. Para tornar o prompt observável,
OSTYPE=msys é definido somente no filho psql, selecionando o caminho stdin/stderr que o
[PostgreSQL 17 sprompt.c](https://github.com/postgres/postgres/blob/REL_17_11/src/common/sprompt.c)
suporta explicitamente. stdin é a console nativa TTY, verificada antes da chamada; libpq
desabilita o eco. Node/PowerShell não leem nem encaminham a entrada da senha. LANG/LC_ALL=C
fixam o texto do prompt. Só o texto nativo reconhecido Password: é retransmitido à tela;
stderr bruto continua privado, sem publicação. TLS verify-full e o host direto não mudam.

O arquivo de status native-password-prompt-ready.json registra o texto do prompt observado,
PID e hora, sem senha ou autorização. É status de cada run, não marcador/reserva do seed.
Só anunciar espera após constatar esse evento, PID vivo, ausência de resultado final e zero
saída SQL. A leitura permite até 15min para entrada/conclusão; não há repetição automática.
PASS também exige prova de emissão do prompt. A janela/autorização do seed permanece separada.

Cada tentativa cria uma pasta privada exclusiva, intenção durável antes do processo,
snapshot exato, stdout/stderr privados e resultado sanitizado/hashes. Nenhum artefato é removido
em falha. Raw logs não devem ser publicados. forward_attempts conta invocações nativas
tentadas, não comandos SQL ou commits. Timeout/erro/recibo ausente para, preserva evidência
e nunca prova rollback. Falha ao finalizar artefatos bloqueia o resultado.

SeedAuthorized continua bloqueado até aprovação específica e janela UTC nova (30s–20min,
mínimo 30s restantes), prova nativa de leitura PASS até 30min, mesmos hashes/binário/CA e
sem mudança de código após essa prova. Mudanças posteriores somente docs/ são admitidas.
Somente então cria o marcador CreateNew/fsync antes da única invocação do driver aprovado.
Marker existente, falha SQL, desconexão, timeout, pós-check ou reconciliação não confirmados
impedem replay. Não há reposição, upsert, IDs substitutos ou cleanup. O driver original faz
GUCs e pós-check no mesmo backend físico; nunca se presume afinidade entre chamadas com pool.

## Procedência verificada

| Artefato | SHA-256 dos bytes |
| --- | --- |
| psql.exe instalado, PostgreSQL 17.11 | c290c7f0a3335f290f8c18011a1e5afa03ee3cdd628697a5f3e767e5f1d3d10d |
| Instalador EDB 17.11-5, assinatura EnterpriseDB válida | 612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072 |
| ZIP oficial EDB 17.11-5 | 80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f |
| CA Supabase, arquivo PEM | 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7 |
| Novo procedimento somente leitura | dedc768a366f55c35dbc8fe1d62496dba622a7f74d772feb3ab014df03838619 |

O executável instalado corresponde byte a byte ao ZIP oficial. O instalador tem assinatura
Authenticode válida e hash idêntico ao [manifesto Microsoft Winget](https://github.com/microsoft/winget-pkgs/blob/master/manifests/p/PostgreSQL/PostgreSQL/17/17.11-5/PostgreSQL.PostgreSQL.17.installer.yaml).
O psql.exe individual não tem assinatura Authenticode; o hash do ZIP é medição local de download
HTTPS oficial, não assinatura ou checksum publicado pelo fornecedor. O [site PostgreSQL](https://www.postgresql.org/download/windows/)
identifica a EDB como fonte dos instaladores/binários Windows.

CA obtida de https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt,
pela URL/template do [código oficial do painel](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).
Root 2021 CA, CA:TRUE, assinatura própria válida, validade 28/04/2021–26/04/2031.
Fingerprint SHA-256 DER: 807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa;
é diferente do hash do arquivo PEM. Probe sem senha/SQL confirmou cadeia e hostname TEST,
sem fallback ou downgrade. A interface Chrome foi encerrada pela ferramenta por não conseguir
confirmar a URL; nenhum acesso a credenciais/sessão do navegador foi usado como alternativa.

## Ensaio nativo descartável

[Harness](../qa/stock-c2-seed-native-harness.mjs): PostgreSQL/psql 17.11, loopback, porta dinâmica,
CA sintética e scripts novos SELECT-only. Não carrega/adapta/executa os SQLs ou driver aprovados,
não cria fixture C2 e não usa o marcador real. Exercita o mesmo transporte/recibo do launcher.

| Caso | Saída nativa | Resultado |
| --- | --- | --- |
| SELECT com recibo sintético | 0 | Aceito |
| Erro SQL, ON_ERROR_STOP | 3 | Bloqueado, sem continuação |
| Backend termina a própria conexão local | 2 | Bloqueado, sem reconexão |
| COMMIT sem recibo esperado | 0 | Bloqueado apesar de exit 0 |
| Cliente expira durante pg_sleep | timeout | Incerto, sem retry |
| CA ausente/incorreta | 2 | TLS rejeitado |
| Hostname incorreto com socket loopback | 2 | TLS rejeitado |

Adaptações explícitas: instalação local de cliente não tinha postgres.bki, então o laboratório
usou o pacote completo oficial extraído em work/. pg_ctl no Windows retinha pipes no filho;
setup passou a redirecionar para arquivos privados, preservando logs em vez de interpretar
o pipe aberto como falha do servidor. Os ensaios preparatórios falhos foram retidos. initdb
usa --no-clean; somente o servidor local criado pelo harness é parado, sem apagar arquivos.
Autenticação local sintética trust usa -w; não comprova o prompt real -W. A verificação TEST
é separada, nativa, com senha apenas no console. O caminho de seed permanece sem execução;
não se apresenta o laboratório como prova de um commit C2 real.

## Comandos para revisão

Executar em console Windows nativo, na QA limpa, com os valores públicos abaixo. Nenhuma senha
é argumento. ReviewedHead deve ser o HEAD operacional revisado e limpo, não o SHA histórico
do executor de perda. ArtifactRoot deve existir, fora do Git; a pasta de cada run recebe ACL própria.

```powershell
powershell.exe -NoProfile -File 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED\qa\stock-c2-seed-launcher.ps1' -Mode VerifyReadOnly -ReviewedHead '<HEAD_OPERACIONAL_REVISADO>' -Psql17Exe 'C:\Program Files\PostgreSQL\17\bin\psql.exe' -PsqlSha256 'c290c7f0a3335f290f8c18011a1e5afa03ee3cdd628697a5f3e767e5f1d3d10d' -CaPath 'C:\Users\lucas\Documents\Codex\2026-11-02\co\outputs\c2-operational\supabase-prod-ca-2021.crt' -CaSha256 '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7' -ArtifactRoot 'C:\Users\lucas\Documents\Codex\2026-11-02\co\work\c2-operational'
```

Futuro seed: o mesmo comando, trocando apenas o modo por SeedAuthorized e adicionando
-ConnectionEvidenceFile com o result.sanitized.json PASS, -SeedApproval com
TEST_ONLY_THREE_ROW_SEED_WITHOUT_INITIAL_MOVEMENT_20261102 e -WindowAt/-WindowUntil com a
janela expressamente autorizada. **Não executar esse comando agora.** A autoridade precisa
aceitar os [SQLs/hashes, três INSERTs, seed sem movimento inicial, locks e resíduos](./QA_C2_SEED_SAME_SESSION_PROCEDURE_20261102.md).
Perda continua bloqueada, orçamento separado até 1 RPC perda +1 auditoria, sem reposição.

Código operacional atual: 56baf2dd75c3581f8d554f7b58477405e6a6307b. O SHA histórico do código
de perda validado permanece preservado. A janela recebe SHA/hora no título, distinguindo-a
de uma janela anterior que já retornou a PS>. Senha somente no Password: nativo da tentativa ativa.
[Evidência sanitizada de procedência/laboratório](./evidence/stock-c2-operational-preparation-20261102.json).

## Tentativa original e correção de observabilidade

A primeira tentativa nativa iniciou às 04:31:42 UTC de 03/11 e terminou às 04:35:00 UTC,
197.871ms depois, exit 2, sem timeout/interrupção registrados e stdout de zero bytes.
Erro original sanitizado: FATAL: password authentication failed for user postgres.
O usuário informou que não preencheu a senha e que ainda precisa localizá-la. Portanto,
o erro não é prova de senha digitada/incorreta; a causa da submissão anterior não foi provada.
Intenção/argumentos -W, logs e resultado originais foram preservados, sem reset/replay.
Não houve SQL nessa tentativa nem criação do marcador permanente.

O transporte anterior usava o prompt de console CONIN$/CONOUT$ não observável nos logs.
Foi substituído pelo caminho nativo de console stdin/stderr descrito acima. A primeira
sondagem local registrou Password: (o literal usado por -W), diferente do prompt com nome
de usuário inicialmente esperado pelo detector. Esse diagnóstico virou regressão para
ambos os textos, sem aceitar mensagens arbitrárias como prova de prontidão.
Ensaio seguinte: prompt real observado, 3.993ms esperando sem entrada, zero saída SQL,
encerramento deliberado somente do processo local e arquivos preservados. Não se usa esse
ensaio como prova de autenticação TEST. Uma nova verificação TEST só deve ser anunciada
como aguardando senha quando seu próprio evento/PID tiver sido conferido.

Releituras complementares pelo conector TEST: empresa/OWNER ativos, zero colisões e contrato
MD5 135e8025db9f8097377432b0ff26fe8c mantido. Captura de contratos às 04:37:49 UTC de 03/11:
9 funções/10 tabelas, precisão/auditoria/leitor de perdas PASS. São leituras suplementares,
não prova de sessão nativa ou afinidade de pool. Nenhuma autorização de seed foi solicitada.

Nova observação nativa às 04:53:27 UTC de 03/11 (23:53:27 de 02/11 America/New_York):
Password: emitido pelo psql, PID vivo, stdout de zero bytes e sem resultado final; marcador
permanente ausente. Isso comprova prontidão naquele instante, **não autenticação ou leitura PASS**.
Naquela observação, o usuário ainda precisava localizar a senha do banco. Não autorizar seed por prontidão do prompt,
PASS da CI ou leituras do conector. A tentativa original teve seus hashes de artefatos reconferidos.

## Hashes finais do launcher

| Arquivo | SHA-256 dos bytes |
| --- | --- |
| stock-c2-seed-launcher.ps1 | 43374065d700c59d90ca2e0b64db641f827181046f6270bf684e0c6d135608bb |
| stock-c2-seed-launcher.mjs | 81e40a43849e420c1219d3530b86325aa9be9141c4727f3272ae56b7a3d78675 |
| stock-c2-seed-transport.mjs | 7165dae590a25cc0154cef5d7533d778b0711ecaec15703747849b9e85cdeb78 |
| stock-c2-seed-private.ps1 | 02edf3c8169f40b5df34ac78fe935799a822668cc2e63482941b1e03bc89bb19 |
| stock-c2-seed-native-harness.mjs | 8447137d1038297e20bb0d56eb2729d367c32896d72b6f59d9aba298d4a0295f |

Os SQLs e o driver aprovados permanecem com os hashes originais no procedimento anterior.
Qualquer mudança exige outra revisão/hashes.

Fechamento: [CI isolada PASS](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41580651369), código 56baf2dd75c3581f8d554f7b58477405e6a6307b: 69/69 Linux e 69/69 Windows, zero falhas/skips, builds PASS.
A segunda tentativa encerrou às 04:58:21 UTC de 03/11 com autenticação rejeitada antes das consultas; PID local encerrado, nenhuma sessão correspondente observável no TEST e hashes dos artefatos íntegros. Nenhuma repetição ocorreu durante a reconciliação.
Depois da reconciliação, o usuário confirmou que localizou a senha e solicitou nova tentativa somente leitura, preservando as anteriores. Ela continua separada de qualquer autorização de seed/perda.

## Conexão nativa somente leitura PASS — 03/11/2026

Nova tentativa autorizada pelo usuário depois de localizar a senha; as duas anteriores foram
preservadas integralmente. Fonte QA limpa na admissão: 1c8477daf79954b6e0aea863df4b60bd187cc898,
descendente somente documental do código validado 56baf2dd75c3581f8d554f7b58477405e6a6307b.
Concluída em **03/11 às 00:07:56 America/New_York (05:07:56 UTC)**: saída 0,
C2_NATIVE_READONLY_CONNECTION_ELIGIBILITY_PASS_NO_SEED.

- psql 17.11/CA com os hashes revisados; host direto TEST, TLS verify-full,
  TLSv1.3/TLS_AES_256_GCM_SHA384, sem pool, fallback ou downgrade.
- Mesmo backend PID 4099277, backend_start, endereço/porta, role/banco antes e depois.
  Role/database postgres, transaction_read_only=on e default_transaction_read_only=on.
  O relatório público conserva apenas o hash do endereço, sem IP bruto.
- Autorização/GUC de seed ausente; nenhuma criação de marcador permanente, fixture,
  movimento, perda ou auditoria. O driver de seed não foi usado nesta verificação.
- Empresa/OWNER ativos; zero colisões de local/item/posição/nome/SKU.
  Contrato de provisionamento 135e8025db9f8097377432b0ff26fe8c; catálogo de estoque,
  precisão, auditoria e leitor de perdas PASS. Não é revisão integral de segurança para perda.
- Hashes dos artefatos do run reconferidos; logs privados e tentativas anteriores preservados.
  Senha digitada somente no prompt nativo, sem ser lida/registrada pelo launcher.

Prova de leitura pode ser usada pelo launcher de seed por até 30min do fechamento, com
mesmos hashes/binário/CA e somente diferenças docs/ desde a fonte. Ela não autoriza seed.
Autorização específica e janela exclusiva continuam obrigatórias; se a prova expirar,
o launcher bloqueia antes do marcador/envio. Nenhuma expiração libera retry.

Próxima revisão/autoridade solicitável: somente **uma transação e três INSERTs** da fixture
exclusiva C2, saldo 2,000 e custo médio/último 0,1000, **seed sem movimento inicial**, aceitando
locks e resíduos descritos. IDs/SQL/hashes permanecem os aprovados. Não há reposição,
compensação, cleanup, IDs alternativos, migração ou autorização de perda.
Perda continua bloqueada e depende depois da fixture confirmada, revisão de segurança atual,
preflight autenticado PASS e autorização própria. Cobertura permanece 16/60 (26,67%).
