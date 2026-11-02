# C1 — recaptura TEST e bloqueio de sessão antiga (02/11/2026)

## Resultado vigente — preflight autenticado real PASS (02/11/2026, 15:05 America/New_York)

O relatório sanitizado salvo no notebook foi lido diretamente após o término do launcher:
`scope=C1_CHILD_READONLY_PREFLIGHT`, `status=PASS`,
`code=C1_CHILD_READONLY_GATES_PASS_EXECUTION_NOT_AUTHORIZED`, saída **0**.
SHA-256 dos bytes do relatório: `9fbbb6057fcd70053d40a77a4421530c5298e9e317aea18eba423c01830c3374`.
Gravação do relatório: 2026-11-02T20:05:07.0864538Z.
Fonte executada: `1bb8c61d3ffacd28e95700fa32ba5dffcd8f8a07`;
código validado: `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`.

- Checks PASS: catalog, owner_a_b, permissions, read_isolation, exclusive_fixture.
- Gates PASS: parent_integrity, identity_permissions, current_security, unchanged_baseline.
- Estoque/auditoria/sondagens encaminhados: **0/0/0**; histórico apagado/fixtures criadas: **0/0**.
- parent_checkpoint_unchanged=true; reservation_available=true; registro do filho com zero entradas.
- full_homologation=false; resume_allowed=false; persistent_authorized=false; restored=false.
- Os gates de janela, reserva, intenções e autorização de execução estão BLOCKED por definição
  de PreflightOnly. Os checks de interface, movimentos, auditorias e reconciliação final do ciclo
  não foram executados. O resultado não constitui homologação C1 nem restauração.
- Duas sondagens históricas preservadas como recibos negados; nenhuma repetida.
- Digest revisado preservado:
  `0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825`.
- Catálogos novos válidos até **03/11/2026, 11:31:31 America/New_York**.
- Macro permanece **16/60 (26,67%)**, 15 pendentes/29 bloqueados; nenhum novo critério promovido.

O proprietário encerrou o console antigo PID 20680; leituras posteriores confirmaram processo e
mutex ausentes, pai íntegro e registro vazio. Um preflight somente leitura posterior foi interrompido
pelo fechamento da interface sem relatório; seu wrapper e marcador foram preservados.
A nova tentativa de leitura após reconciliação produziu o PASS acima, sem execução persistente.
Não repetir esse preflight para reproduzir evidência. Os bloqueios de mutex descritos abaixo são históricos.

**Próximo gate: nova confirmação operacional de janela exclusiva de 20 minutos e gates imediatamente
anteriores à execução.** A autorização condicional C1 já registrada não é solicitada novamente.
Não usar a janela de 25/10 nem iniciar persistência sem confirmação atual. Sem replay, segundo filho,
sondagens repetidas, compensação automática, migração ou alteração de produção.



Branch exclusiva `automation/nexalvo-qa-actions`; projeto TEST `msinksoilkluooxenecy`.
Código autorizado preservado: `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`.
HEAD local/remoto observado antes desta documentação: `06b552707994549ebb000a3bd00feb46a8f79678`, árvore limpa.

## Resultado

**PASS: recaptura e revisão por comparação integral com os artefatos anteriormente revisados.**
**BLOCKED: preflight atual e ciclo persistente; mutex de uma sessão antiga ainda retido.**
O preflight autenticado histórico foi informado como PASS pelo proprietário na transferência; não foi repetido aqui.
Nenhum novo critério operacional foi promovido: **16/60 (26,67%)**, 15 pendentes e 29 bloqueados.

## Capturas novas e proveniência

Foram executados exclusivamente os dois SELECTs versionados:
- `qa/sql/stock_journey_preflight_readonly_TEST.sql`
- `qa/sql/stock_c1_child_security_readonly_TEST.sql`

A conexão usada foi o conector Supabase com `project_id=msinksoilkluooxenecy`.
A consulta de identidade respondeu banco postgres/role postgres. Isso identifica o contexto SQL,
não equivale a sessão QA OWNER A/B e não homologa permissões de usuário. Nenhum acesso ao projeto de produção.
Não houve chamada de RPC de negócio, migração, alteração de RLS/grants, fixture ou usuário.

| Artefato novo | Captura UTC | SHA-256 dos bytes salvos |
| --- | --- | --- |
| Catálogo básico | 2026-11-02T16:31:31.512956Z | `b3941a76b05a174c477da3d9dfdb85c9ea1f9cd5fde2740f6dbe6df282b098fe` |
| Complemento de segurança | 2026-11-02T16:31:36.162433Z | `76ea3f20959486f8dce413e82635f76b7c503ccc60a2694f44a28d4d5ec27662` |

Os arquivos antigos foram primeiro identificados pelos hashes dos bytes originais registrados no
[relatório de 25/10](./QA_C1_CHILD_CATALOG_REVIEW_20261025.md). Ambos coincidiram.
A comparação recursiva de todas as seções, excluindo somente `captured_at`, não encontrou diferenças.
Não foram alterados timestamps ou hashes esperados; os horários novos vieram dos SELECTs do servidor.

A revisão semântica anterior das 12 funções, 13 tabelas RLS, 141 colunas, 22 políticas e quatro
triggers permanece aplicável ao conteúdo idêntico observado. Os 16 fingerprints de funções/triggers
permanecem cobertos por essa igualdade integral. Ressalvas de TRIGGER/REFERENCES e search_path
permanecem documentadas; a igualdade não amplia o escopo da auditoria para todo o banco.

Varredura dos resultados: nenhum padrão detectado de chave privada, JWT, Bearer, chave secret
Supabase ou URL PostgreSQL com credenciais. Exports brutos foram guardados em diretório privado
separado no notebook, fora do Git; entradas antigas e checkpoint pai não foram sobrescritos.

Após a comparação/revisão, os quatro validadores do código autorizado passaram:
catálogo, precisão, contrato de auditoria e complemento de segurança.
Digest previamente aprovado, confirmado sem mudança:
`0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825`.

Validade conjunta até **03/11/2026 às 11:31:31 America/New_York**
(2026-11-03T16:31:31.512Z). Depois disso recapturar/revisar novamente.

## Regressão e diagnóstico de fim de linha

No checkout Windows original: **21/22 PASS, 1 FAIL**, zero skips.
O teste que deriva o hash do corpo de `fn_session_access_status` da migração encontrou:
- Git: `i/lf`; disco Windows: `w/crlf`; `core.autocrlf=true`.
- Corpo com 12 CRLF: MD5 `20c0b27c97b1f6027dc515ee178c288a`.
- Corpo LF versionado: MD5 `76ef113c8bba3a485dea824f72fddc36` e SHA-256
  `113028f7873eed5445cf1e13274ac4a484256b7a65484d93e990625cb432b784`, iguais ao contrato autorizado.

O primeiro git archive herdou a conversão CRLF e reproduziu 21/22; não foi contado como PASS.
Nova cópia isolada obtida por `git -c core.autocrlf=false archive` preservou LF.
A migração extraída foi comparada byte a byte com `git show HEAD:migrations/20261016_platform_admin_TEST.sql`:
igualdade verdadeira, zero CRLF, SHA-256 do arquivo
`9f71e3e998d2c62e8d31aeb58423fde93d05ba9cd55f4fc42a29bd526292f944`.
Nessa cópia: **22/22 PASS**, zero FAIL/cancelled/skipped, saída 0.

Nenhum hash esperado, teste ou fonte SQL do checkout original foi editado para passar.
O problema de portabilidade do teste em checkout CRLF fica registrado; o resultado 22/22 cobre os bytes Git LF.
Não foi repetida a CI #225 ou a homologação histórica A/B.

## Pai, registro e mutex

Leituras sucessivas localizaram exatamente um pai com o SHA-256 original confiável.
Registro do filho: zero entradas, sem reserva/filho; QA permaneceu limpa.
A tentativa de 25/10 registrada nesta conversa parou em `C1_CHILD_WINDOWS_MUTEX_BLOCKED`,
com zero estoque/auditoria/sondagens e `execution_result_unconfirmed=false`.

Em 02/11, consulta nativa somente leitura do mutex identificou o proprietário PID 20680,
PowerShell iniciado em 25/10 às 10:11:50 America/New_York.
Leitura local sanitizada do console confirmou campo oculto de autenticação e presença de
`ExecuteAuthorized`, sem exportar console bruto, identidade ou credencial.
A captura enviada pelo proprietário também mostra essa execução antiga parada no primeiro campo oculto.
Essa janela está expirada e não deve receber credenciais nem ser retomada.

O console antigo foi identificado com título distinto e trazido à frente sem envio de entrada.
O proprietário informou Ctrl+C; na reconciliação seguinte, mutex ainda pertencia ao mesmo PID.
Foi solicitado encerrar somente esse console antigo a partir do prompt. Nenhum processo foi
terminado pelo agente, nenhum mutex foi liberado à força e nenhum launcher foi repetido.

## Próximos gates

1. Confirmar encerramento do comando antigo e verificar novamente mutex/pai/registro.
2. Se aparecer reserva, filho ou resultado incerto, parar e reconciliar somente por leitura.
3. Com mutex livre, executar somente preflight autenticado com os arquivos novos revisados;
   credenciais existentes em campos ocultos no notebook. A renovação é necessária após expiração
   dos catálogos e sessões antigas; não é repetição da recuperação histórica ou das sondagens.
4. Persistência depende de todos os gates atuais, nova janela exclusiva e avaliação do bloqueio
   anterior. Não presumir autorização para replay/segundo filho. O orçamento condicional não mudou.
5. C1 só recebe PASS com 18/18 verificações reais. Main, produção, histórico A/B e pai preservados.
