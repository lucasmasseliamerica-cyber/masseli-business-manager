# Staff — pacote de homologação de negócio para revisão

**PREPARADO, NÃO AUTORIZADO E NÃO EXECUTADO. Staff suspenso.** Cobertura operacional
permanece **16/60 — 26,67%**. A coleta desta preparação foi somente leitura no TEST
`msinksoilkluooxenecy`; não houve alteração de usuários/empregados/permissões,
configuração, convite, deploy ou migração. Nenhuma suíte aprovada foi repetida.

HEAD de origem: `a474a083a5602ff4cf6bde491c9ab6dc2dd5bd0a`, branch
`automation/nexalvo-qa-actions`. Código de negócio validado: `37c2fde874ccf716b5d73d98fc20ffb2bbe15b57`.
Alterações deste pacote no repositório são somente documentação/evidência.

## Evidências reutilizadas, sem renovação por execução

- Migração `20261104143420`, pós-flight **13/13 PASS**; não reaplicar nem repetir.
- Edge `manage-staff-user` **v5 ACTIVE**, ID `9dad0ab5-fd65-43da-be56-da79c3cec5ba`,
  verify_jwt=true, fontes e import map conferidos. Bundle SHA-256
  `50a95817b3363fdbcbfd97b25f20b2c84a98cfdb93d5ade00e2fb5316897ef0d`.
- CORS/Auth/configuração: origem QA 204/exata, externa 403/sem allow-origin e POST
  inválido autenticado 400/INVALID_REQUEST. **O POST anterior está consumido e seu
  journal continua bloqueado.** Este plano não reutiliza sua autorização ou marcador.
- Staff/recibo **79/79** e modal **16/16**, CI Linux/Windows/builds PASS; reutilizados.
  A admissão local corrigida tem **49/49 sintéticos**; não foram repetidos nem
  usados para promover cobertura operacional.
- Reaproveitados: QA_STAFF_RECOVERY_PATCH_20261103, QA_REAL_ROLE_ACCOUNT_PLAN,
  QA_REAL_ROLE_PREFLIGHT, parseStaffRequest/validStaffProfileReceipt, contrato da
  fn_manage_staff_profile e atualização otimista de employees do frontend.

O plano anterior propunha 8 Edge/7 RPCs/2 auditorias com atores ainda indefinidos.
Este pacote fixa os atores existentes, explicita a preparação/recuperação antes
omitidas e acrescenta somente os gaps necessários: MANAGER sem manageUsers,
MANAGER autorizado a editar campo comum, e revogação com o mesmo JWT. A tentativa
de rebaixar o último OWNER foi substituída por negação de edição de OWNER por
MANAGER com payload sem alteração de privilégios. O teste perigoso continua fora
deste lote, sem falso PASS.

## Contas, empresa e estado inicial real

Empresa A: `d627563b-2ce4-491d-8cf6-141ef28d0f63` — NEXALVO QA - EMPRESA FICTICIA.
Empresa B canário: `3849b750-20f7-4929-8699-737a4e1983c8` — ZZ_QA_PLATFORM_20261009_AUTO.

| Uso | Perfil existente | Estado observado | Vínculo |
| --- | --- | --- | --- |
| Ator OWNER A, não alterar | f37e9907-47c4-48bf-94b7-9a6fa5de1f88 / qa_owner | OWNER ativo, overrides {} | employee 30000000-0000-4000-8000-000000000003, ativo, preservado |
| Ator MANAGER M | 96042557-c717-4750-9dd1-88b36958c6d1 / qa.temp.manager.20261005 | MANAGER inativo, overrides {}, employee_id null | propor vínculo ao employee M abaixo |
| Ator/alvo EMPLOYEE E | 0e03a482-5b3c-4225-baf7-4ae1ab7e9e58 / qa.temp.employee.20261005 | EMPLOYEE inativo, overrides {} | employee E abaixo, já vinculado |
| Canário OWNER B, não alterar | 88eddcda-d8b5-4474-b5d7-19860dd97fba | OWNER ativo, overrides {}, employee_id null | somente alvo de negação/leituras |

Employee M: `09abb5af-1074-4a97-9391-19639ef67faf`, nome QA TEMP MANAGER 20261005,
inativo, job_title/location_id/manager_id/notes null, sem perfil vinculado.
Employee E: `7e2fbd68-117a-444e-9f7e-d4014b36ecbd`, nome QA TEMP EMPLOYEE 20261005,
inativo, mesmos campos opcionais null, vinculado somente a E.
Versão inicial de ambos: `2026-10-05T03:54:42.104+00:00`.

Os Auth das quatro identidades existem, estão confirmados, não deletados e não
banidos na coleta. O proprietário **confirmou controlar M e E**. Isso não comprova
sessões independentes atuais: a admissão precisará de JWTs válidos e correspondência
Auth/perfil de OWNER A, M e E em canal local seguro. Nenhum e-mail, senha, JWT ou
metadata Auth foi lido/salvo nesta preparação. Não haverá convites, reset, criação
de Auth ou configuração de Secrets/GitHub para obter as sessões.

**Não são fixtures vazias.** M tem 14 auditorias, 1 venda, 1 despesa, 2 cash_flow,
9 movimentos de inventário, 2 compras e 1 perda associados como ator; E tem
7 auditorias, 1 venda, 1 despesa, 2 cash_flow, 5 movimentos e 1 perda. Cada employee
tem 1 venda e 1 turno histórico, ambos os turnos fechados/com saída. Não há tarefas,
subordinados ou vínculo SUPERADMIN nos candidatos. Os detalhes/counts estão no
snapshot sanitizado. A reativação permite acesso aos dados QA segundo o papel
durante a janela e exige autorização explícita; não adotar essas contas por inferência.
Não apagar ou alterar suas dependências. A opção antiga de criar novas identidades
fica desnecessária neste lote, condicionada ao controle confirmado das existentes.

## Escopo exato e distinção dos dois registros

P2 comprovará atualização do **employee existente**: active false→true e cargo null→
`QA Homologacao Staff 20261104`; nenhum salário, local, hierarquia ou turno muda.
U1/U2 comprovarão atualização do **perfil de acesso public.users** desse employee,
via Edge v5. Mudar o nome no perfil não muda employees.name. Nenhum desses testes
constitui CRUD completo, ponto/tarefas ou homologação de todas as telas.

Os payloads completos e estados antes/depois estão em `docs/evidence/staff-business-plan-20261104.json` e
o pacote local congelado de payloads; a tabela individual está em a tabela ao final deste documento. Todos os corpos Edge
foram conferidos localmente pelo parser aprovado, sem executá-los ou repetir suíte.
Os PATCHs alteram somente os campos listados e updated_at. O timestamp de envio é
gerado uma vez, registrado na intenção e enviado com filtro id+empresa+versão atual;
o texto de placeholder do JSON de revisão nunca deve ser enviado como timestamp.
Não usar upsert, IDs substitutos ou outro endpoint em caso de zero linhas.

## Sequência e orçamento de alterações

| Etapa | Ação exata | Limite de envios | Efeito/auditoria esperado |
| --- | --- | --- | --- |
| P1/P2 | OWNER A reativa employees M/E; P2 também fixa cargo acima | 2 PATCH | 2 updates employees, 0 auditorias automáticas |
| P3/P4 | OWNER A reativa perfis M/E, M vinculado ao employee M; papéis originais e overrides {} | 2 Edge | 2 updates users + 2 auditorias |
| N1/N2 | MANAGER/EMPLOYEE sem manageUsers tentam update válido de outro perfil | 2 Edge | 403 STAFF_ACCESS_DENIED; 0 RPC, 0 update/auditoria |
| U1 | OWNER A muda nome do perfil E para QA STAFF OWNER UPDATE 20261104 | 1 Edge | 200/recibo exato; 1 update + 1 auditoria |
| G1 | OWNER A concede somente manageUsers:true ao MANAGER M | 1 Edge | 1 update + 1 auditoria; nenhum outro override |
| N3–N7 | M tenta self, role de E, overrides de E, alvo OWNER B e alvo OWNER A | 5 Edge | 409 PROFILE_OPERATION_REJECTED; até 5 RPCs rejeitadas, zero update/auditoria |
| U2 | M autorizado muda somente nome de E para QA STAFF MANAGER UPDATE 20261104 | 1 Edge | 1 update + 1 auditoria |
| U3 | OWNER A repõe nome original de E: QA TEMP employee | 1 Edge | 1 update + 1 auditoria |
| G2 | OWNER A remove manageUsers de M, preservando M ativo e papel MANAGER | 1 Edge | 1 update + 1 auditoria |
| N8 | Mesmo JWT de M tenta update válido após revogação | 1 Edge | 403 STAFF_ACCESS_DENIED, sem RPC/update/auditoria |
| R1/R2 | OWNER A restaura integralmente os campos de perfil E/M do baseline, ambos inativos; M employee_id null | 2 Edge de recuperação | 2 updates + 2 auditorias |
| R3/R4 | OWNER A restaura employees E/M inativos e cargo E null | 2 PATCH de recuperação | 2 updates employees; sem auditoria automática |

**Máximo total: 21 envios capazes de escrever = 17 Edge + 4 PATCH**, incluindo os
8 casos de negação. Nunca classificá-los como simples leitura porque devem falhar.
Orçamento por caso: uma tentativa de encaminhamento, inclusive se resultado incerto.

No percurso aprovado completo: até **14 tentativas RPC de perfil** (9 bem-sucedidas,
5 rejeitadas); **9 updates users, 4 updates employees e 9 auditorias append-only**.
Preparação: 4 HTTP/2 auditorias. Homologação: 13 HTTP/5 auditorias. Recuperação:
4 HTTP/2 auditorias. Não há RPC de auditoria separada nem reposição automática.
Rejeições esperadas não consomem auditoria; se um guard falhar, o caso pode escrever:
parar no primeiro resultado inesperado, sem tentar os demais para atingir a contagem.

Triggers employees conferidos para esta proposta: o guard de salário só valida;
o guard de referências valida e pode obter advisory lock se a hierarquia mudar.
Os PATCHs não mudam salário/hierarquia; não há INSERT de auditoria nesses triggers.
Os triggers users são de validação. A auditoria de cada update de perfil é INSERT
na mesma transação da fn_manage_staff_profile; se falhar, a transação não confirma.
O pareamento real será conferido, mas não haverá injeção artificial de falha de
auditoria, timeout ou quebra de rede para reproduzir suítes já aprovadas.

## Verificações somente leitura, separadas do orçamento de escrita

Antes da janela: conservar as evidências aprovadas; não repetir 13/13, CORS ou o
POST inválido consumido. Na admissão, conferir somente drift relevante de fontes/
identidade da Edge, snapshots, vínculos, contas e capacidade de usar as sessões.
Se houver drift, suspender a execução e revisar; não refazer entregas aprovadas.

Na janela, até **83 GETs de contrato**, sem operações de negócio:

- 3 `/auth/v1/user` + 3 perfis próprios para vínculo exato Auth→perfil→empresa.
- 60 GETs `rpc/user_can?p_permission_key=...`: 20 permissões para OWNER A/M/E após
  P3/P4 e antes de G1; comparar OWNER todas true e M/E com role_default_permissions
  do snapshot. Dois GETs adicionais manageUsers, após G1=true e G2=false, com o mesmo JWT M.
- 9 GETs users adicionais: outro perfil A por cada ator; OWNER B por cada ator
  (sempre zero); depois de G1 M vê E e não B; depois de G2 M não vê E.
- 6 GETs fn_read_employees_secure: um canário de salário/mascaramento por ator e
  um employee B por ator (sempre zero). Guardar booleans, não salários em evidência.

83 é teto, não meta; não repetir leituras aprovadas sem pergunta nova. Todos os
caminhos/consultas são explícitos, sem GET/HEAD amplo nem Edge/recursos não revisados.
Não disparar o runner real-role inteiro: ele também verifica financeiro/exportações
e faz login por senha, fora deste lote. Reutilizar seus contratos e gates.

Até **44 checkpoints SQL READ ONLY**: baseline + antes/depois de cada um dos 21
envios + final. `qa/sql/staff_business_checkpoint_readonly_TEST.sql` é a consulta preparada. Conferir
rows/versões, diferenças semânticas e conjunto de IDs das auditorias antes/depois,
incluindo actor, alvo, empresa, action e role/active esperado. Exigir +1 auditoria
correspondente por sucesso de perfil e +0 por negação/PATCH. Não usar só contagem
global: U1→U2, por exemplo, tem o mesmo alvo e deve manter a atribuição correta.

Isolamento atual A→B: M tenta update de OWNER B em N6 e todos os atores têm leituras
users/employee B vazias; OWNER B e employee QA B permanecem canários intactos.
Não alterar o canário B nem a fixture usada pelo preflight histórico. O sentido
B→A autenticado específico staff não será reivindicado como provado neste lote;
o isolamento OWNER A/B histórico aprovado permanece reutilizado, sem repetição.

## Recuperação, autorização e resíduos

R1–R4 fazem parte do pedido: até 2 Edge e 2 PATCH, somente após estado confirmado
e compatível com a máquina de estados/payloads revisados. Recuperar perfis primeiro,
employees depois. Se uma linha já estiver semanticamente no baseline, pular sua
recuperação, sem consumir envio. Não reexecutar caso já reservado/confirmado.

Todos os campos originais de perfil são repostos; active/cargo originais de employees
são repostos e os demais campos ficam intocados. **updated_at avança e não é
restaurado**. As 9 auditorias e seus IDs/timestamps/actor snapshots são resíduos
esperados e não serão apagados. Não remover contas/Auth, employees ou histórico
financeiro/estoque. A compensação antiga para apagar fixtures novas não se aplica
às contas históricas selecionadas. O rollback que reabre a RPC insegura é proibido.
Restaurar public.users.active=false não revoga os JWTs nem altera Auth: as sessões
podem continuar válidas no serviço de autenticação. O guard staff deve voltar a
negar o perfil inativo; revogação global/sign-out de sessões não é reivindicada nem
incluída no orçamento. Nenhuma senha, banimento ou identidade Auth será alterada.

Resultado incerto consome o slot e interrompe **todos** os envios, inclusive
recuperação, até reconciliação somente leitura e revisão específica do estado.
Ausência de linha/auditoria numa leitura não libera retry. Divergência inesperada,
perda de OWNER, resposta fora do contrato ou campo fora dos estados previstos
também bloqueiam a recuperação automática. O pedido normal não é autorização para
UPDATE administrativo arbitrário ou reabertura da RPC. Eventual recuperação de
estado não previsto precisará apenas da autorização adicional correspondente.

## Janela e critérios de aceite

Proposta: janela exclusiva de **até 45 minutos**, início/fim UTC a confirmar; últimos
10 minutos reservados exclusivamente a R1–R4 e conferência. Sem staff UI/API/jobs
paralelos ou DDL TEST. Não iniciar novos casos de homologação após início da reserva
de recuperação, nem qualquer envio após o fim. Expiração não é rollback. Renovação
de janela, se necessária, é operacional e não refaz a jornada/autorização completa.

Cada caso exige intenção durável com hash dos bytes/payload, ator, alvo, estado
antes, orçamento e prazo, seguida de reserva exclusiva antes do envio. Uma chamada
por vez; nenhum loop automático de mutações ou recuperação. RPC de perfil não
recebe updated_at esperado: a conferência prévia mais quiescência é controle
operacional, não CAS de servidor. O pending do frontend é por aba, não idempotência
global. Clientes/abas paralelos e remoção manual de armazenamento devem ser impedidos
operacionalmente. O helper do POST inválido consumido não será adaptado/desbloqueado.

Aceite exige: recibos exatos, persistência no TEST, +1/+0 auditoria por caso,
isolamento e canários intactos, permissões reais nas três sessões, revogação no
mesmo JWT, recuperação semântica final e artefatos duráveis preservados. NÃO
reivindicar PASS para: UI completa/feedback em navegador, último OWNER rebaixado,
concorrência real, convite/SMTP/recovery, falha parcial induzida ou permissões de
outros módulos não exercidas. A presente etapa é API/REST/RPC real planejada,
sem frontend publicado ou homologação UI por inferência.

**Autorização atual de escrita deste lote: nenhuma.** O pedido específico está em
o pedido específico do pacote local de revisão e será vinculado ao SHA-256 de `manifesto.json`. Staff permanece suspenso
mesmo após eventual sucesso, até aceite explícito. C2, A/fotos, B #1253 e C1 preservados.


## Casos individuais

| Caso | Fase | Ator → alvo | Envio máximo | Resultado esperado | Linhas/auditorias esperadas |
| --- | --- | --- | --- | --- | --- |
| P1 | SETUP | OWNER_A → 09abb5af-1074-4a97-9391-19639ef67faf | 1 PATCH | 200 | 1 / 0 |
| P2 | SETUP | OWNER_A → 7e2fbd68-117a-444e-9f7e-d4014b36ecbd | 1 PATCH | 200 | 1 / 0 |
| P3 | SETUP | OWNER_A → MANAGER | 1 POST | 200 | 1 / 1 |
| P4 | SETUP | OWNER_A → EMPLOYEE | 1 POST | 200 | 1 / 1 |
| N1 | HOMOLOGATION | MANAGER → EMPLOYEE | 1 POST | 403 STAFF_ACCESS_DENIED | 0 / 0 |
| N2 | HOMOLOGATION | EMPLOYEE → MANAGER | 1 POST | 403 STAFF_ACCESS_DENIED | 0 / 0 |
| U1 | HOMOLOGATION | OWNER_A → EMPLOYEE | 1 POST | 200 | 1 / 1 |
| G1 | HOMOLOGATION | OWNER_A → MANAGER | 1 POST | 200 | 1 / 1 |
| N3 | HOMOLOGATION | MANAGER → MANAGER | 1 POST | 409 PROFILE_OPERATION_REJECTED | 0 / 0 |
| N4 | HOMOLOGATION | MANAGER → EMPLOYEE | 1 POST | 409 PROFILE_OPERATION_REJECTED | 0 / 0 |
| N5 | HOMOLOGATION | MANAGER → EMPLOYEE | 1 POST | 409 PROFILE_OPERATION_REJECTED | 0 / 0 |
| N6 | HOMOLOGATION | MANAGER → OWNER_B | 1 POST | 409 PROFILE_OPERATION_REJECTED | 0 / 0 |
| N7 | HOMOLOGATION | MANAGER → OWNER_A | 1 POST | 409 PROFILE_OPERATION_REJECTED | 0 / 0 |
| U2 | HOMOLOGATION | MANAGER → EMPLOYEE | 1 POST | 200 | 1 / 1 |
| U3 | HOMOLOGATION | OWNER_A → EMPLOYEE | 1 POST | 200 | 1 / 1 |
| G2 | HOMOLOGATION | OWNER_A → MANAGER | 1 POST | 200 | 1 / 1 |
| N8 | HOMOLOGATION | MANAGER → EMPLOYEE | 1 POST | 403 STAFF_ACCESS_DENIED | 0 / 0 |
| R1 | RECOVERY | OWNER_A → EMPLOYEE | 1 POST | 200 | 1 / 1 |
| R2 | RECOVERY | OWNER_A → MANAGER | 1 POST | 200 | 1 / 1 |
| R3 | RECOVERY | OWNER_A → 7e2fbd68-117a-444e-9f7e-d4014b36ecbd | 1 PATCH | 200 | 1 / 0 |
| R4 | RECOVERY | OWNER_A → 09abb5af-1074-4a97-9391-19639ef67faf | 1 PATCH | 200 | 1 / 0 |
