# Continuação da homologação staff no TEST

P1–P4 e R1–R4 estão encerrados. Os recibos documentam quatro Edge, quatro PATCH e quatro auditorias preservadas. O checkpoint de R4 confirmou MANAGER e EMPLOYEE inativos nos perfis e nos registros de funcionário, os campos originais restaurados e os canários preservados. A cobertura continua em **16/60**. [P1–P4](./evidence/staff-integrated-business-stopped-20261111.json) · [R1–R4](./evidence/staff-p4-recovery-pass-20261111.json)

O pacote executável está em `outputs/staff-permissions-continuation-review-20261111` do workspace operacional. `manifesto-executor.json` tem SHA-256 `b7139c713a1a56351383621f8482f06f48ecc2e4bdbb22be9f1be34714deaf78` e vincula o executor, a coleta, o SQL, a prova local, os payloads, o manifesto original, os adendos aceitos e os recibos encerrados. O manifesto de revisão anterior segue com SHA-256 `94c2d6bada2c182239d39c5c8f414882f2350da656e01a552332a70dfc9b96c5`. A continuação depende do complemento de orçamento, de três sessões TEST existentes e de janela exclusiva. Staff permanece suspenso.

## Preparação e conferências

1. Confirmar `msinksoilkluooxenecy`, versão e fontes de `manage-staff-user`, `verify_jwt=true`, origem local admitida e contratos SQL registrados no plano. Conferir o checkpoint pós-R4 inteiro, os quatro IDs de auditoria, a ausência de bloqueios concorrentes e de conflito de vínculo ativo. Confirmar as 40 permissões padrão antes de usar as evidências anteriores.
2. Comprovar três sessões existentes independentes de OWNER A, MANAGER e EMPLOYEE, válidas até o fim da janela. A coleta local mascarada deve registrar o recebimento e um GET de identidade por conta. A aquisição por senha ou refresh tem escopo próprio. Reservar os dois Edge de restauração e a parte final da janela antes de ativar qualquer perfil.
3. OWNER A executa `ATIVAR-M` e `ATIVAR-E`, um Edge por perfil, com os papéis originais e overrides vazios. O vínculo temporário do MANAGER usa o employee QA original. A RPC instalada valida o vínculo pela empresa e unicidade entre logins ativos e aceita o registro de funcionário inativo. O checkpoint exige ambos os registros e o cargo do EMPLOYEE no estado pós-R4.
4. Reaproveitar a leitura inicial de OWNER A e as 23 verificações válidas do baseline. Executar as 51 verificações pendentes, incluindo a consulta corrigida de employee da empresa B para OWNER A. Completar três leituras após G1 e duas após G2. Os recibos reaproveitados conservam os valores esperados no estado ativo dos perfis e no employee canário, que fica fora das alterações propostas.

## Controlador e envios

O candidato de leituras exige UUIDs para `business_A`, `business_B_canary` e `employee_QA_B_read_only_canary`, empresas distintas, quatro atores com UUIDs distintos e papéis e empresas correspondentes, além de 40 valores booleanos de permissões padrão, 20 por papel. `business_B_canary` é a chave usada nos três filtros de employee da empresa B. O ensaio local comparou as 74 consultas do baseline, conferiu a alteração exata dos três filtros, reaproveitou os 23 recibos válidos e rejeitou campos ausentes ou escopo divergente. O SHA-256 do controlador histórico segue `e3159952733b2edd99f490dfb983d27b5668acec194c58344ccf2ea201a42776`.

Cada linha abaixo corresponde a um POST para `manage-staff-user`, com uma tentativa. O executor regenera e compara as consultas e verifica os hashes e os payloads antes da coleta. Cada caso exige intenção e reserva duráveis, estado esperado antes do envio e leitura de confirmação. Os recibos de permissão guardam apenas o caso, status e resultado do predicado.

| Ordem | Caso | Ator e verificação | HTTP esperado | Auditorias novas |
| --- | --- | --- | --- | --- |
| 1 | N1 | MANAGER sem grant, atualização de EMPLOYEE recusada | 403 `STAFF_ACCESS_DENIED` | 0 |
| 2 | N2 | EMPLOYEE, atualização de MANAGER recusada | 403 `STAFF_ACCESS_DENIED` | 0 |
| 3 | U1 | OWNER A atualiza o nome do EMPLOYEE | 200 | 1 |
| 4 | G1 | OWNER A concede `manageUsers` ao MANAGER | 200 | 1 |
| 5 | N3 | MANAGER com grant, edição do próprio perfil recusada | 409 `PROFILE_OPERATION_REJECTED` | 0 |
| 6 | N4 | MANAGER com grant, promoção de EMPLOYEE recusada | 409 `PROFILE_OPERATION_REJECTED` | 0 |
| 7 | N5 | MANAGER com grant, override de EMPLOYEE recusado | 409 `PROFILE_OPERATION_REJECTED` | 0 |
| 8 | N6 | MANAGER com grant, alteração do OWNER B recusada | 409 `PROFILE_OPERATION_REJECTED` | 0 |
| 9 | N7 | MANAGER com grant, alteração do OWNER A recusada | 409 `PROFILE_OPERATION_REJECTED` | 0 |
| 10 | U2 | MANAGER com grant atualiza o nome do EMPLOYEE | 200 | 1 |
| 11 | U3 | OWNER A repõe o nome original do EMPLOYEE | 200 | 1 |
| 12 | G2 | OWNER A revoga `manageUsers`, conferido na mesma sessão MANAGER | 200 | 1 |
| 13 | N8 | MANAGER após revogação, atualização de EMPLOYEE recusada | 403 `STAFF_ACCESS_DENIED` | 0 |

## Restauração e orçamento

`RESTAURAR-E` e `RESTAURAR-M` são as duas ações previstas no novo pacote. Cada uma restaura o perfil original com um Edge do OWNER A. O pacote especifica os estados anteriores elegíveis para cada prefixo confirmado, incluindo nomes intermediários do EMPLOYEE e a concessão de MANAGER após G1. Pular uma restauração só se o perfil já corresponder integralmente ao original e estiver inativo. Comparar o checkpoint final ao pós-R4, com avanço de `updated_at` nos perfis afetados e preservação dos canários, registros de funcionário e auditorias anteriores. Resultado incerto interrompe todos os envios e segue para reconciliação por leitura. A restauração após uma parada só é elegível com resultado determinado e checkpoint fresco igual a um prefixo confirmado.

| Recurso | Saldo verificado para o escopo | Roteiro proposto | Adicional a vincular |
| --- | --- | --- | --- |
| Edge | 13, reservados aos 13 casos N/U/G | 13 casos + 2 ativações + 2 restaurações = **17** | **4 Edge** para os quatro passos novos |
| PATCH | 0 de 4 | 0 | 0 |
| GET autenticado | 55 dos 83 do lote original após 28 usados | 56 verificações + 3 identidades = **59** | **4 GET** |
| SQL somente leitura | Orçamentos e recibos históricos preservados | 1 admissão + até 34 checkpoints por caso + 1 reconciliação se houver parada | Vincular um teto próprio de **36 leituras** para a continuação |
| POST Auth | Escopo vigente de sessão existente | 0 | 0 |

No percurso completo, são nove auditorias novas, duas da preparação, cinco dos casos positivos e duas da restauração. As quatro anteriores levam o total esperado a **13** no recorte. Os 13 Edge remanescentes ficam associados somente aos 13 casos originais.

## Validação local

Em PostgreSQL 17 descartável, o corpo da RPC de perfil conferiu com o MD5 instalado `da4d9cc2b71970e9bfe43abb4782fd75`. O ensaio usou os dois triggers de perfil relevantes e o guard de autorização da Edge, com dados sintéticos. U1–U3 e G1–G2 passaram mantendo os registros de funcionário inativos. N1, N2 e N8 foram recusados com o perfil do ator ativo, por falta de `manageUsers`. N3 recusou a autoedição, N4 e N5 recusaram mudança de papel e override por MANAGER, N6 recusou o alvo da outra empresa e N7 protegeu o OWNER. As duas ativações e duas restaurações de perfil completaram o percurso, com nove auditorias e os registros de funcionário intactos. A prova local está em `prova-employees-inativos.json`.

Sete testes novos passaram. Conferiram os 23 recibos vinculados, filtro e campo obrigatório inválidos, complemento e margem da janela, entrega única de checkpoint, coleta local mascarada, execução completa, recuperação de prefixo determinado e parada sem novos envios após perda de recibo. O SQL do checkpoint foi executado separadamente em PostgreSQL descartável e detectou o conflito de vínculo sintético. Essa validação cobre o contrato local e a orquestração. Os resultados HTTP dos casos e das permissões após ativação ainda exigem homologação no TEST.

## Procedimento após autorização e janela

1. No workspace operacional, usar o diretório fixo `work/staff-user-service/staff-permissions-continuation-20261111`. Confirmar que está livre de uma execução anterior e registrar somente `approval.json` e `edge-admission.json` antes do início. A aprovação deve conter projeto, hash do manifesto, `additional_scope_confirmed=true`, `exclusive_confirmed=true`, `stop_on_uncertainty_no_retry=true`, início, corte e fim em UTC, e SHA-256 de `edge-admission.json`. Fixar o orçamento `Edge_original_cases=13`, `Edge_additional=4`, `Edge_restore_reserved=2`, `PATCH=0`, `GET_authenticated_additional=4`, `GET_authenticated_total=59`, `SQL_read_only=36`. Janela máxima de 45 minutos com 10 finais reservados à restauração.
2. A evidência da Edge deve trazer `project`, `edge_id`, `edge_version`, `status`, `verify_jwt`, `edge_bundle_sha256`, `source_sha256` e `observed_utc`, com leitura administrativa do TEST dentro da janela. Comparar a v6, o bundle e as quatro fontes ao manifesto. Usar os gates CORS/Auth aprovados, exceto se houver divergência concreta.
3. A partir do workspace operacional, rodar `node C:/Users/lucas/Documents/NEXALVO-P005-ISOLATED/qa/staff-continuation.mjs <SHA_DO_MANIFESTO_EXECUTOR> <SHA_DA_APROVACAO>`. O processo imprime o URL loopback da coleta. Entregar somente as três sessões existentes em campos mascarados. O recibo local confirma recebimento. Cada GET de identidade confirma o usuário TEST, depois de conferir a independência e a validade das sessões até 30 segundos após o fim.
4. Para cada `SQL-NN-request.json` pendente, conferir rótulo e SHA do SQL, executar `checkpoint-continuacao.sql` pelo canal administrativo somente leitura do TEST e encaminhar somente o objeto JSON `staff_checkpoint` recém-retornado via stdin de `node C:/Users/lucas/Documents/NEXALVO-P005-ISOLATED/qa/staff-continuation.mjs --checkpoint <SHA_DO_MANIFESTO_EXECUTOR> SQL-NN`. A entrega valida idade, janela e vínculo ao pedido. O operador controla a origem da resposta SQL nesse canal. O JSON local não é uma assinatura do banco.
5. Aguardar o fechamento do diário e conferir cada recibo, a última leitura e os contadores. Após resultado incerto, atender apenas o pedido de reconciliação por leitura se ainda houver margem. Preservar a reserva, os recibos e o lock e deixar a continuação suspensa para revisão. O teto de SQL conta as leituras encaminhadas, inclusive quando falta recibo.

O operador autorizou o complemento para o manifesto acima, incluindo até nove novas auditorias e zero alterações em `employees`. O registro `complemento-autorizado.json` fica junto ao manifesto, com SHA-256 `45e8752ab31b777110df6ebf68bb2cb9151aec53d5d6de535bed7221aa33d98e`. A checagem dos 61 arquivos vinculados passou antes da abertura da janela. A cobertura operacional continua em **16/60**.

## Admissão com sessão existente de OWNER A e senhas das duas contas

Em 12/11/2026, o operador confirmou a janela de 03:52:08 a 04:37:08 UTC, com corte de homologação às 04:27:08 UTC. A Edge v6 e as quatro fontes conferiram. O formulário de três tokens encerrou antes de receber dados porque MANAGER e EMPLOYEE não tinham sessões disponíveis para entrega. O diário original contém `closed-before-input.json`, com zero Edge, PATCH, GET autenticado, POST Auth e SQL.

Os recibos da homologação anterior registram um GET administrativo e um login HTTP 200 para cada uma das duas contas. Essas permissões Auth foram consumidas. O adendo proposto `complemento-auth-senhas.json`, SHA-256 `a039fb3b56643214626e971f376ea6c3dd21f8f2d3a61cb5019dd2d755bb5c71`, vincula esses recibos, o encerramento anterior, o manifesto aprovado e o novo launcher. Ele pede um GET administrativo por UUID e um POST de login com senha atual por conta. As três confirmações de identidade continuam no teto de 59 GET autenticados. OWNER A entra com a sessão existente e zero POST de login.

Após autorização explícita do adendo e confirmação de uma janela válida, preparar `approval.json` e `edge-admission.json` em `work/staff-user-service/staff-permissions-continuation-password-20261112`. A aprovação mantém os campos e limites do manifesto base e acrescenta `auth_addendum_sha256`, `auth_explicitly_authorized=true` e o objeto `auth` do adendo. Executar `node C:/Users/lucas/Documents/NEXALVO-P005-ISOLATED/qa/staff-continuation-password.mjs <SHA_ADENDO> <SHA_APROVACAO>`. O formulário local mascarado recebe a sessão OWNER A, a chave administrativa TEST e as duas senhas atuais. O mesmo processo confirma as três identidades e mantém as sessões em memória até encerrar. O checkpoint atual precede qualquer ativação. Entregar cada checkpoint via stdin ao mesmo launcher com `--checkpoint <SHA_ADENDO> <SHA_APROVACAO> SQL-NN`.

O ensaio local bloqueou a abertura sem aprovação Auth e a admissão com token OWNER inválido, sem nenhuma chamada remota. Três regressões da coleta integrada confirmaram a permanência no mesmo processo, zero login para OWNER A na modalidade de sessão existente e interrupção antes de EMPLOYEE após despacho incerto de MANAGER.
