# Continuação da homologação staff no TEST

P1–P4 e R1–R4 estão encerrados. Os recibos documentam quatro Edge, quatro PATCH e quatro auditorias preservadas. O checkpoint de R4 confirmou MANAGER e EMPLOYEE inativos nos perfis e nos registros de funcionário, os campos originais restaurados e os canários preservados. A cobertura continua em **16/60**. [P1–P4](./evidence/staff-integrated-business-stopped-20261111.json) · [R1–R4](./evidence/staff-p4-recovery-pass-20261111.json)

O pacote para revisão está em `outputs/staff-permissions-continuation-review-20261111`. O manifesto SHA-256 `94c2d6bada2c182239d39c5c8f414882f2350da656e01a552332a70dfc9b96c5` vincula o plano com os payloads exatos, o controlador candidato de leituras, o checkpoint pós-R4 e os recibos anteriores. A continuação ainda depende de orçamento adicional, executor vinculado ao plano e janela exclusiva. A homologação de staff permanece suspensa.

## Preparação e conferências

1. Confirmar `msinksoilkluooxenecy`, versão e fontes de `manage-staff-user`, `verify_jwt=true`, origem local admitida e contratos SQL registrados no plano. Conferir o checkpoint pós-R4 inteiro, os quatro IDs de auditoria, a ausência de bloqueios concorrentes e de conflito de vínculo ativo. Confirmar as 40 permissões padrão antes de usar as evidências anteriores.
2. Comprovar três sessões existentes independentes de OWNER A, MANAGER e EMPLOYEE, válidas até o fim da janela. A coleta local mascarada deve registrar o recebimento e um GET de identidade por conta. A aquisição por senha ou refresh tem escopo próprio. Reservar os dois Edge de restauração e a parte final da janela antes de ativar qualquer perfil.
3. OWNER A executa `ATIVAR-M` e `ATIVAR-E`, um Edge por perfil, com os papéis originais e overrides vazios. O vínculo temporário do MANAGER usa o employee QA original. A RPC instalada valida o vínculo pela empresa e unicidade entre logins ativos. Ela aceita o registro de funcionário inativo. Os dois registros de funcionário e o cargo do EMPLOYEE permanecem no estado pós-R4. A execução exige comprovar essa condição na admissão.
4. Reaproveitar a leitura inicial de OWNER A e as 23 verificações válidas do baseline. Executar as 51 verificações pendentes, incluindo a consulta corrigida de employee da empresa B para OWNER A. Completar três leituras após G1 e duas após G2. Os recibos reaproveitados conservam os valores esperados no estado ativo dos perfis e no employee canário, que fica fora das alterações propostas.

## Controlador e envios

O candidato de leituras exige UUIDs para `business_A`, `business_B_canary` e `employee_QA_B_read_only_canary`, empresas distintas, quatro atores com UUIDs distintos e papéis e empresas correspondentes, além de 40 valores booleanos de permissões padrão, 20 por papel. `business_B_canary` é a chave usada nos três filtros de employee da empresa B. O ensaio local comparou as 74 consultas do baseline, conferiu a alteração exata dos três filtros, reaproveitou os 23 recibos válidos e rejeitou campos ausentes ou escopo divergente. O SHA-256 do controlador histórico segue `e3159952733b2edd99f490dfb983d27b5668acec194c58344ccf2ea201a42776`.

Cada linha abaixo corresponde a um POST para `manage-staff-user`, com uma tentativa. Os payloads originais dos casos N, U e G foram validados com o parser da função. Cada caso precisa de intenção e reserva duráveis, estado esperado antes do envio e leitura de confirmação do resultado. O controlador candidato gera e valida leituras localmente. Ele ainda precisa ser ligado a um executor que aceite apenas os casos do novo manifesto, a coleta das três sessões existentes e os checkpoints desta continuação.

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

No percurso completo, são nove auditorias novas, duas da preparação, cinco dos casos positivos e duas da restauração. As quatro anteriores levam o total esperado a **13** no recorte. Os 13 Edge remanescentes ficam associados somente aos 13 casos originais. O pacote está em revisão, sem uma janela de execução proposta nesta etapa.
