# NEXALVO — Checklist macro/micro para 100% de conclusão

## Entrega operacional após o cancelamento do evento
- [x] Fluxo de configuração inicial da empresa implementado. Navegação do OWNER e ausência dos atalhos para EMPLOYEE verificadas em navegador com HTTP interceptado.
- [x] Ensaio local de restauração lógica concluído. O aceite integral aguarda backup TEST autorizado e restauração isolada dos demais serviços.
- [ ] Revisar a migração TEST de fechamento de caixa, validada em PostgreSQL descartável. Homologação persistente depende de fixture e autorização.
- [x] Login OWNER no Preview TEST, empresa e unidade QA, navegação interna e sessão após reload verificados. [Evidência](./evidence/nexalvo-operational-continuation-20261111.json)
- [x] Catálogo e PDV conferidos com fixtures existentes. Relatório de outubro conciliado em leitura com 251 cancelamentos e receita zero. [Evidência](./evidence/nexalvo-published-journeys-20261111.json)
- [x] Complemento staff para os dois hashes do frontend preparado, com três testes direcionados e ensaio da admissão local PASS. [Pacote](./QA_STAFF_INTEGRATED_RENEWAL_20261111.md)
- [x] Staff TEST. Três sessões confirmadas no mesmo processo. P1–P4 PASS, com duas auditorias e consumo de 2/17 Edge e 2/4 PATCH. [Evidência](./evidence/staff-integrated-business-stopped-20261111.json)
- [ ] Staff TEST. Leitura de isolamento interrompida por filtro inválido. MANAGER e EMPLOYEE seguem ativos na fixture. Revisar primeiro a restauração isolada de R1–R4, depois a correção do filtro e o escopo dos casos pendentes. [Procedimento](./QA_NEXALVO_ENTREGA_OPERACIONAL.md#homologação-staff-da-janela-19h3020h15-utc)
- [x] Runner de compras P0.05 encerra em falha sem compensação automática. Quatro regressões locais PASS. [Implementação](../qa/p0-purchase-browser-persistent.TEST.mjs) · [Testes](../qa/purchase-compensation-regression.test.mjs)
- [ ] Jornada P0.05 persistente. Preparar vínculo dos recibos por etapa, intenção durável, orçamento e autorização própria. Nenhuma execução remota nesta etapa.
- [ ] Homologações persistentes, revisão das origens do Preview e configuração Stripe TEST. S700 física é dependência do aceite de cartão presencial. A integração de IA está adiada.
- [ ] Verificar os gates de produção. A equipe Vercel está no Hobby. A migração ao plano comercial exige aprovação do custo.

[Evidência do marco](./evidence/nexalvo-operational-continuation-20261111.json) · [Entrega operacional](./QA_NEXALVO_ENTREGA_OPERACIONAL.md)

## Histórico — evento de 15/11/2026 cancelado

- [x] Integração Stripe Terminal S700 implementada para TEST e verificada localmente com PostgreSQL descartável, HTTP interceptado e Chromium. [Pacote TEST](./QA_STRIPE_TERMINAL_EVENTO_TEST_20261111.md)
- [x] Migração `20261111130949` e duas Edge v1 confirmadas no Supabase TEST. Pós-flight PASS, 12 fontes conferidas e zero linhas nas tabelas Terminal. [Evidência](./evidence/terminal-evento-test-install-20261111.json)
- [x] [Preview QA](https://masseli-business-manager-ewdbjnobw-lucas-masseli.vercel.app) publicado com Supabase TEST e cartão desativado. Acesso inicial, troca de idioma, rota direta e reload conferidos em desktop e tela móvel. [Evidência](./evidence/nexalvo-vercel-preview-20261111.json)
- [ ] Entrar como operador TEST e fechar a configuração Stripe TEST com sandbox, empresa/unidade, localização, leitor e teto confirmados.
- [ ] Confirmar a entrega da S700, executar o ensaio publicado e aprovar a passagem para o ambiente de operação. [Checklist do evento](./QA_NEXALVO_EVENTO_20261115.md)
- [ ] Staff continua suspenso. A janela de 11/11 encerrou na coleta, antes de Auth, com zero dos 17 Edge e 4 PATCH usados. Cobertura operacional **16/60**.

## Staff — complemento registrado e coleta expirada antes de Auth (11/11/2026 UTC)

- [x] Complemento específico registrado e reafirmado com o mesmo saldo. OWNER A e MANAGER mantêm um login cada, EMPLOYEE mantém a autorização anterior. A tentativa manual MANAGER continua possivelmente consumida.
- [x] Execução de 10/11, 20:36–21:21 UTC, encerrou na coleta às 21:10:35 UTC. PID 19208 encerrado, porta local fechada e zero artefatos de encaminhamento Auth ou negócio. Registros originais preservados por hashes. [Evidência](./evidence/staff-integrated-collection-expired-20261111.json).
- [x] Renovação local preparada para a coleta sem envios. Cinco regressões novas PASS, sem repetir as seis verificações anteriores ou suítes de negócio. Qualquer tentativa Auth/negócio, processo ativo, histórico divergente ou resultado incerto bloqueia a readmissão.
- [ ] Confirmar disponibilidade e nova janela exclusiva, atualizar somente a admissão atual e executar coleta/homologação no mesmo PID. Última leitura TEST às 20:36:23 UTC de 10/11 mostrou perfis e employees MANAGER/EMPLOYEE inativos. O estado atual requer nova admissão.
**Staff suspenso. 21 casos ainda sem execução, 0/17 Edge, 0/4 PATCH e cobertura 16/60.** [Procedimento](./QA_STAFF_INTEGRATED_RENEWAL_20261111.md).

## Staff — coleta e executor integrados localmente (10/11/2026)

- [x] Mesmo PID para coleta mascarada, Auth e execução do plano aprovado. Sessões em memória, controlador sem credenciais e leituras Auth contadas uma vez. Seis verificações sintéticas passaram.
- [x] Tentativa manual MANAGER registrada como 1 Auth possivelmente consumida, status HTTP desconhecido. EMPLOYEE continua com o limite anterior disponível. Sem consumo Edge/PATCH. [Evidência](./evidence/staff-integrated-auth-20261110.json).
- [ ] Autorizar somente o POST adicional MANAGER e, na modalidade por senha, a nova tentativa OWNER A com GET por UUID. Confirmar janela após a autorização e readmitir no TEST. Staff suspenso, 0/17 Edge, 0/4 PATCH e cobertura 16/60.

## Staff — tentativa manual MANAGER registrada; ERP inativo (10/11/2026)

- [x] Operador relatou tentativa no navegador com `This NEXALVO account is inactive`. Código confere: a checagem de perfil após Auth recusa acesso e limpa a sessão local. Sem recibo HTTP manual ou sessão reutilizável comprovada. [Evidência](./evidence/staff-manager-manual-browser-login-20261110.json).
- [x] OWNER A ainda retida no formulário na conferência local (vencimento 15:45:46 UTC). O coletor M/E não está vinculado a essa sessão; nenhum novo GET/POST Auth do helper, alteração de perfil/senha, comando ou reserva de negócio.
- [ ] Usar somente a coleta Auth preparada com OWNER A utilizável no mesmo fluxo e janela válida. Considerar o login manual antes de qualquer novo POST MANAGER. Sem negócio: 0/17 Edge, 0/4 PATCH; staff suspenso e cobertura 16/60.

## Staff — autorização M/E registrada, bloqueada antes da coleta (10/11/2026)

- [x] Autorização específica preservada: até um GET administrativo e um login Auth por MANAGER e EMPLOYEE no TEST. Nenhum slot consumido. [Evidência da admissão](./evidence/staff-member-acquisition-admission-blocked-20261110.json).
- [x] Formulário OWNER A confirmado ativo localmente, vencimento registrado 15:45:46 UTC. Ele aceita tokens M/E existentes; não faz aquisição por senha e não transfere OWNER A isoladamente. Nenhum formulário novo foi aberto e nenhum gate aprovado foi repetido.
- [ ] Prosseguir somente com OWNER A legítima no fluxo da coleta e do executor e janela válida. Sem novo login OWNER A nesta etapa; 0/17 Edge, 0/4 PATCH, staff suspenso e cobertura 16/60.

## Staff — janela sem admissão M/E; coleta restrita preparada (10/11/2026)

- [x] Perfil consultado: `NO_STORED_SESSION`. Operador sem outros perfis MANAGER/EMPLOYEE. A janela 14:58–15:43 UTC não teve admissão nem handoff. Zero login M/E, Edge, PATCH ou reserva de negócio.
- [x] [Plano de aquisição M/E](./QA_STAFF_MEMBER_SESSION_ACQUISITION_20261110.md): composição em memória validada em 5 cenários sintéticos, usando o contrato de reserva aprovado. Sem rede, retry, senha nova ou nova tentativa OWNER A.
- [ ] A autorização adicional é só para até um GET por UUID e um login em cada conta MANAGER e EMPLOYEE, com OWNER A utilizável e nova janela válida. As leituras de identidade já pertencem ao lote de negócio. Staff suspenso; cobertura 16/60.

## Staff — readmissão Auth OWNER A PASS no TEST (10/11/2026)

- [x] Readmissão específica consumida: um GET administrativo, um POST Auth e um GET de identidade, todos 200. UUID e TEST confirmados; sem retry, refresh, redefinição de senha ou alteração de conta. [Evidência](./evidence/staff-owner-readmission-pass-20261110.json).
- [x] Sessão confirmada somente em memória, com vencimento 15:45:46 UTC. Adaptador novo validado em 7 cenários sintéticos; conferência local de candidatas M/E validada em 2 testes. Tentativa anterior HTTP 400 preservada.
- [ ] Janela de negócio 14:58–15:43 UTC confirmada sob condição. Falta provar MANAGER/EMPLOYEE, atualizar admissão e entregar as três sessões ao executor. Sem envio de negócio no marco Auth: 0/17 Edge, 0/4 PATCH; staff suspenso e cobertura 16/60.

## Staff — readmissão OWNER A preparada; perfil indisponível (10/11/2026)

- [x] Conferência local da sessão existente preparada sem login, refresh ou chave administrativa como sessão; 4/4 testes sintéticos. O operador informou que não consegue acessar o perfil do navegador. Sessão real não verificada.
- [x] Pedido específico preparado para 1 nova tentativa Auth OWNER A, com leituras condicionais e diagnóstico sanitizado; teste sintético do sanitizador PASS. O HTTP 400 anterior permanece sem causa registrada e com sua tentativa consumida.
- [ ] Aguardar acesso à sessão existente ou autorização específica da alternativa. Readmissão ainda exige sessões independentes e janela válida. Manifesto/adendo, 0/17 Edge e 0/4 PATCH preservados; staff suspenso. [Revisão](./QA_STAFF_OWNER_SESSION_READMISSION_20261110.md).

## Relatórios — fuso da empresa e comparação anterior no Chromium (10/11/2026)

- [x] `75ea4af4789dc987f5924a9b41ecbdf2a5b62652`: cenário novo somente local. Empresa em Nova York, navegador em Tóquio, virada de mês e dia de 25 horas. A UI mostrou Nov 1, USD 150 e 4 pedidos; comparação +50% em receita e +100% em pedidos. Ontem mostrou Oct 31 e USD 100. **1/1 PASS**, HTTP interceptado.
- [ ] Homologação com dados reais continua pendente; 16/60 sem alteração. Nenhuma verificação aprovada foi repetida.

## Staff — janela de homologação bloqueada no Auth OWNER A (10/11/2026 UTC)

- [x] Janela exclusiva 04:25–05:10 UTC, últimos 10 min reservados à recuperação. Manifesto, adendo, checkpoint, quatro fontes da Edge v6, 40 permissões padrão e estado inicial conferidos; nenhum lock concorrente nas relações revisadas no instante da leitura.
- [x] Três GETs Auth administrativos 200. Login único OWNER A recusado com HTTP 400, sem causa específica no relatório e sem resultado incerto. MANAGER e EMPLOYEE não receberam novo login. Formulário e helper encerrados; executor de negócio não iniciado.
- [x] 21 casos não enviados, 0/17 Edge e 0/4 PATCH; nenhuma intenção, reserva ou auditoria de negócio. Checkpoint final exato: perfis e employees M/E inativos e canários inalterados. [Evidência sanitizada](./evidence/staff-business-admission-20261110.json).
- [ ] Readmissão depende de uma sessão OWNER A legítima (ou autorização para nova tentativa Auth específica) e janela válida. Não reabrir o helper consumido. Orçamento de negócio preservado; staff suspenso e cobertura 16/60.

## Matriz cumulativa — preservação das evidências locais (10/11/2026 UTC)

- [x] Correção local `71debcaedcd1c716c67de0815ad26efbfc0bb14f`: a regeneração antiga excluiria 24 seções registradas. O gerador recusa sobrescrever o arquivo e oferece `--markdown` para prévia. Comando testado com SHA da matriz intacto e regressão de cobertura 1/1 PASS. Nenhum acesso ao TEST por essa correção.

## Inicialização da interface — recuperação de módulo indisponível (10/11/2026 UTC)

- [x] Correção local `1a1872a4be315ce4cd60c875c12832df74a470da`: falha de carregamento reproduzida e corrigida com recarga explícita, referência sanitizada e sem repetição automática. Chromium/checagens afetadas 5/5 e build PASS. [Evidência](./QA_APP_STARTUP_RECOVERY_20261110.md).
- [ ] Ensaio operacional e monitoramento de incidentes pendentes. CI offline Linux/Windows definida, sem publicação ou execução remota; cobertura real 16/60.

## Staff — recuperação Auth MANAGER/EMPLOYEE PASS no TEST (09/11/2026)

- [x] Formulário passou a validação local antes da rede; TEST/TLS/UUIDs e quatro checkpoints confirmados. Uma alteração de senha e um login por conta retornaram 200, com identidade verificada e uma sessão Auth observada por conta.
- [x] Autorização Auth consumida em 2 PUTs/2 logins, sem retry ou resultado incerto. Perfis ERP/employee, papéis, MFA e auditoria de negócio preservados. Tokens não persistidos; 64 registros históricos íntegros.
- [ ] Homologação de negócio ainda não executada. Requer sessões independentes e janela válida do lote já autorizado. 17 Edge/4 PATCH intactos, staff suspenso, cobertura 16/60.

## Staff — formulário encerrou na margem, sem confirmação ou rede (09/11/2026)

- [x] Única abertura na janela 17:21:55–17:31:55 UTC. Requisito local de comprimento MANAGER pendente na captura fornecida; confirmação permaneceu bloqueada naquele momento.
- [x] Encerramento em WINDOW_MARGIN_REJECTED, zero leituras TEST, alterações, logins ou reservas. Autorização intacta, staff suspenso, 17 Edge/4 PATCH e cobertura 16/60 preservados.

## Staff — formulário de coleta local validado, sem execução real (09/11/2026)

- [x] Formulário Windows com campos mascarados, contagens e confirmação somente após validação local das duas senhas e da chave. Política, TEST/TLS/UUIDs, SQL e pipeline de reservas preservados.
- [x] 8/8 verificações sintéticas da coleta WinForms, sem rede, clipboard automatizado, repetição de suítes ou alteração de conta. 60 registros de acesso anteriores íntegros.
- [ ] Abertura real depende de disponibilidade confirmada e janela válida. Autorização de acesso não consumida, 17 Edge/4 PATCH preservados, staff suspenso e cobertura 16/60.

## Staff — readmissão pós-diagnóstico sem envio Auth (09/11/2026)

- [x] Janela confirmada 17:03:14–17:13:14 UTC; histórico de acesso e diagnóstico sintético preservados, sem novos ensaios ou suítes repetidas.
- [x] Dois GETs administrativos 200. Após validar ambas as entradas, o helper encerrou com MANAGER LENGTH_24_TO_64. Zero alteração de senha, login, reserva ou resultado incerto.
- [ ] Acesso não restabelecido, autorização não consumida. Staff suspenso, homologação 17 Edge/4 PATCH intacta, cobertura 16/60.

## Staff — readmissão encerrou no comprimento local de MANAGER (09/11/2026)

- [x] Janela confirmada e separada da anterior; 36 artefatos históricos íntegros. Núcleo, política e SQL reutilizados; somente a admissão nova foi conferida.
- [x] Canal e identidades confirmados por dois GETs administrativos 200. Único diagnóstico MANAGER LENGTH_24_TO_64; zero alteração de senha, login, reserva ou resultado incerto. Processo encerrado sem reabertura.
- [ ] Acesso ainda não restabelecido. Autorização Auth não consumida e homologação 17 Edge/4 PATCH intacta. Staff suspenso, cobertura 16/60.

## Staff — diagnóstico por conta: comprimento local rejeitado (09/11/2026)

- [x] Readmissão confirmada na janela 16:05:23–16:15:23 UTC. Os 24 registros anteriores ficaram íntegros; somente os novos diagnósticos e controles de admissão foram testados.
- [x] Dois GETs administrativos 200 confirmaram TEST/TLS e UUIDs. Helper encerrado em LENGTH_24_TO_64 para MANAGER e EMPLOYEE, sem registrar valores ou comprimentos observados.
- [x] Zero PUTs, logins, SQL de checkpoint, intenções, reservas ou resultado incerto. Nenhum prompt novo foi aberto. Nenhuma conta ou perfil foi alterado pela execução.
- [ ] Acesso ainda bloqueado, autorização Auth não consumida. Homologação não iniciada; 17 Edge/4 PATCH preservados, staff suspenso e cobertura 16/60.

## Staff — readmissão encerrou na política local de senha (09/11/2026)

- [x] Janela renovada com disponibilidade confirmada, mesmo journal canônico e 12 artefatos anteriores íntegros. Somente as novas verificações da readmissão foram executadas.
- [x] Dois GETs administrativos 200 confirmaram TEST/TLS e os UUIDs. A coleta encerrou em PASSWORD_LOCAL_POLICY_REJECTED, sem SQL, permissão de envio, intenção, reserva, alteração de senha, login ou resultado incerto.
- [ ] Acesso ainda não restabelecido; autorização Auth intacta, sem nova abertura automática. Homologação 17 Edge/4 PATCH integral, staff suspenso e cobertura 16/60.

## Staff — canal Auth administrativo comprovado; sem alterações de senha (09/11/2026)

- [x] Bloqueio local de leitura de horários corrigido na mesma autorização e janela, com original preservado. Dois GETs administrativos reais 200 confirmaram TEST/TLS e os UUIDs MANAGER/EMPLOYEE.
- [x] Encerramento nativo BLOCKED em HIDDEN_DISTINCT_PASSWORDS, último prompt de confirmação MANAGER; exceção específica não registrada. Processo encerrado antes do prazo, sem intenção, reserva, PUT, login ou resultado incerto.
- [ ] Nova janela de acesso e readmissão local preservando o journal; uma alteração de senha e um login por conta continuam autorizados e não consumidos. Homologação 17 Edge/4 PATCH intacta, staff suspenso, cobertura 16/60.

## Staff — acesso Auth autorizado e helper revisado; canal pendente (09/11/2026)

- [x] Autorização adicional registrada para uma alteração de senha e um login por identidade QA existente, MANAGER e EMPLOYEE, somente no TEST. Nenhum envio ou reserva consumiu essa autorização.
- [x] Helper de console local revisado: 15/15 testes sintéticos de transporte/guards e 5/5 de checkpoints; alvos e origem TEST fixados. Sem repetição de testes ou probes aprovados.
- [ ] Confirmar disponibilidade do operador/chave existente por canal local, janela própria e leitura administrativa real antes de qualquer PUT. Nenhum prompt, mudança de senha ou login ocorreu nesta etapa.
- [ ] Homologação de negócio segue bloqueada até as sessões independentes. Manifesto/adendo/checkpoint preservados, 17 Edge e 4 PATCH integrais, staff suspenso e cobertura 16/60.

## Staff — acesso MANAGER e EMPLOYEE: proposta adicional, sem alteração (06/11/2026 local)

- [x] Proprietário confirmou ausência de credencial/sessão nas duas contas QA existentes. Leituras Auth específicas: identidades email confirmadas, não banidas/excluídas, zero sessões armazenadas e zero MFA verificados; nenhuma credencial consultada.
- [x] Proposta mínima preparada: uma atualização administrativa somente de senha por UUID e um login de conferência por conta, com efeitos de sessões/tokens/logs explicitados. Conector atual não fornece alteração de senha Auth; canal administrativo seguro e helper concreto revisto são gates prévios.
- [x] Nenhuma alteração Auth, login, convite ou prompt nesta preparação. Testes e gates aprovados não repetidos. Manifesto de56f442, adendo aceito e checkpoint occurred_at preservados; negócio permanece 0/17 Edge e 0/4 PATCH.
- [ ] Autorizar especificamente o acesso das duas identidades e comprovar as novas sessões antes de combinar janela válida para o lote já autorizado. Perfis ERP seguem inativos; staff suspenso. Cobertura 16/60 inalterada.

## Staff — adendo aceito; acesso MANAGER ainda não confirmado (06/11/2026 local)

- [x] Adendo vinculado ao manifesto original: Edge v6 com mesmo ID/bundle/quatro fontes/verify_jwt; checkpoint occurred_at corrigido validado só por leitura, original preservado.
- [x] Condições de dados/metadata da admissão passaram. Coleta local encerrada antes do processo HTTP porque o acesso MANAGER não pôde ser concluído. Nenhuma senha foi testada, redefinida ou recuperada.
- [x] Todos os 21 casos NÃO ENVIADOS: Edge 0/17, PATCH 0/4, reservas 0, novas auditorias 0; orçamento de escrita não consumido.
- [x] Leitura final confirmou perfis/employee M/E inativos, vínculos/cargos/overrides/updated_at originais, OWNER A/B preservados. Nenhuma recuperação necessária.
- [ ] Homologação real depende das sessões legítimas independentes; controle da conta e e-mail identificado não comprovam senha ou sessão atual. Nenhum novo prompt automático.
- [ ] Se necessário, renovar apenas a janela operacional depois de resolver o acesso. Autorização específica e adendo permanecem preservados; não há liberação automática de staff.

**Staff suspenso. Cobertura 16/60 (26,67%) inalterada.** C2, A/fotos, B #1253, C1, migração e gates aprovados preservados, sem repetição.

## Staff — lote autorizado, bloqueado na admissão; zero envios (06/11/2026 local)

- [x] Autorização específica de56f442 recebida para até 17 Edge/4 PATCH, com recuperação; janela 07/11/2026 04:10–04:55 UTC, últimos 10 minutos exclusivos de recuperação.
- [x] Integridade do manifesto, código e alterações locais revisadas conferida; nenhum teste/gate aprovado repetido.
- [x] Leitura atual: Edge v6, mesmo ID/hash do bundle e quatro fontes idênticas à v5, verify_jwt=true. A versão diverge do manifesto v5; não houve novo deploy neste atendimento.
- [x] Erro de preparação identificado no checkpoint: audit_logs.created_at não existe. Coluna real occurred_at; correção separada validada somente por leitura, sem substituir o SQL autorizado ou liberar envio.
- [x] Todos os 21 casos permanecem NÃO ENVIADOS; zero reservas, Edge, PATCH, auditorias novas e chamadas de recuperação. Orçamentos de escrita não consumidos.
- [x] Estado final por leitura coincide com o inicial: perfis/employee M/E inativos, overrides {}, cargo E null, vínculo M null e updated_at originais. OWNER A/B preservados.
- [ ] Retomada operacional depende de revisão específica da admissão v6 e do checkpoint corrigido, sem reautorizar genericamente os 21 payloads. Se a janela não servir mais, renovar somente a janela necessária.

**Staff suspenso; cobertura 16/60 (26,67%) inalterada.** C2, A/fotos, B #1253, C1, migração 20261104143420/13 de 13 e os probes aprovados permanecem preservados.

## Staff — entrega e gate de leitura concluídos; negócio ainda não homologado (04/11/2026)

- [x] **Código validado:** staff/recibo 79/79 e modal 16/16, CI Linux/Windows/builds PASS, reutilizados sem repetir suítes.
- [x] **Entrega real concluída:** migração 20261104143420, pós-flight 13/13 PASS e manage-staff-user v5 ACTIVE, mesmo ID, quatro fontes/import map conferidos, verify_jwt=true.
- [x] **Gate real sem negócio concluído:** origem QA 204/exata, externa 403/sem allow-origin e único POST inválido autenticado 400/INVALID_REQUEST. POST consumido; replay bloqueado. Não repetir os probes.
- [x] **Preparação atual:** [plano concreto](./QA_STAFF_BUSINESS_HOMOLOGATION_PLAN_20261104.md), inventário/dependências somente leitura, contas QA M/E controladas pelo proprietário, 21 envios propostos com payloads/recuperação; nenhuma alteração de dados executada.
- [ ] **Homologação real de negócio:** atualização de employee/perfil existente, sessões independentes e matriz de permissões OWNER/MANAGER/EMPLOYEE, concessão/revogação e isolamento staff; aguarda autorização específica e janela.
- [ ] **Recuperação real:** até quatro envios previstos no pedido, restauração semântica e nove auditorias residuais esperadas; ainda não executada.
- [ ] **Limites separados:** UI completa, rebaixamento do último OWNER, convite/SMTP e concorrência real não estão homologados nem autorizados por este pacote.

**Staff suspenso. Cobertura macro 16/60 (26,67%), 15 pendentes/29 bloqueados, sem promoção.**
C2 continua bloqueada, com tentativa/marcadores preservados; A/fotos, B #1253 e C1 não serão repetidos.
As seções históricas abaixo não renovam autorizações nem substituem este estado atual.

## C2 — conexão nativa somente leitura PASS; seed pendente de autorização (03/11/2026)

[Launcher, procedência, testes e prova nativa](./QA_C2_OPERATIONAL_LAUNCHER_20261102.md).
psql/TLS verify-full, mesmo backend e sessão READ ONLY conferidos; empresa/OWNER ativos,
zero colisões e contratos atuais PASS. Tentativas anteriores preservadas. Nenhum seed/perda,
marcador permanente ou migração executados. Futuro seed exige autorização expressa de
três INSERTs, saldo 2,000/custo 0,1000 **sem movimento inicial**, e janela exclusiva.
Perda permanece bloqueada, com autorização posterior separada. Cobertura 16/60 inalterada.


## Correções C2 publicadas para revisão — execução ainda não autorizada (02/11/2026)

[Correções F01/F02/F05, regressões e limites F03/F04](./QA_C2_EXECUTOR_HARDENING_20261102.md) ·
[Seed em sessão única e reconciliação](./QA_C2_SEED_SAME_SESSION_PROCEDURE_20261102.md).
Os achados abertos descritos nas seções históricas abaixo foram tratados no novo executor.
Seed/perda continuam pendentes de autorizações separadas; nenhum envio ao TEST neste lote.
SQLs revisados e C1/B preservados; cobertura 16/60 (26,67%) inalterada.


## Revisão C2 e SQL de seed — sem autorização (02/11/2026)

[Achados, SQL exato e procedimento de reconciliação](./QA_C2_INDEPENDENT_REVIEW_AND_PROVISION_SQL_20261102.md).
Revisão encontrou bloqueio aberto no GET/HEAD da guarda C2; perda não liberada.
Seed separado proposto: 1 transação/3 INSERTs, sem movimento inicial, sem auditoria/cleanup;
triggers/constraints/índices conferidos por leitura. Nenhum envio de provisionamento ou perda.
Autorização do seed deverá aceitar expressamente saldo importado sem movimento; autorização
da perda será outra, após fixture confirmada, revisão atual e preflight autenticado PASS.
Cobertura 16/60 (26,67%) e C1/B preservadas.


## Pacote C2 preparado — execução não autorizada (02/11/2026)

[Executor separado, fixture proposta, orçamento e revisão](./QA_C2_EXECUTOR_PACKAGE_20261102.md).
Intenção durável/reserva própria, UI com budget 1 perda +1 auditoria, bloqueio de replay e recuperação só leitura.
Seed proposto separado: três linhas (local/item/posição), 2,000 a 0,1000, ainda não criadas.
Testes isolados não homologam C2 real. C1/B preservadas; cobertura 16/60 (26,67%) inalterada.


## Preparação C2/perdas — somente leitura (02/11/2026)

[Plano, orçamento e critérios](./QA_C2_WASTE_READONLY_PREPARATION_20261102.md) ·
[Evidência sanitizada](./evidence/stock-c2-readonly-preparation-20261102.json).
Triagem real TEST: cinco itens QA no tenant A, nenhuma fixture C2 elegível selecionada.
C1/B preservadas; C1 tem histórico e reserva consumida. Contratos atuais de perda/movimento/leitor/auditoria revisados.
Proposta futura: uma perda 0,125, no máximo 1 RPC perda +1 auditoria, sem reposição;
resíduo permanente de perda/movimento/auditoria exige aceite específico. **C2 não executada**;
faltam fixture, executor/preflight próprios, autorização e nova janela. Cobertura **16/60 (26,67%)** inalterada.


## Estado vigente — C1 real encerrada PASS (02/11/2026)

[Fechamento por critério e limites](./QA_C1_CHILD_REAL_CLOSURE_20261102.md) ·
[Evidência real sanitizada](./evidence/stock-c1-child-real-pass-20261102.json).

**C1: 18/18 checks e 8/8 gates PASS**, saída 0, `C1_CHILD_REAL_UI_CYCLE_RESTORED`.
Relatório lido diretamente no notebook, salvo em 02/11 às 20:09:52 UTC (15:09:52 America/New_York).
Quatro RPCs estoque + quatro auditoria, seis movimentos e quatro auditorias reconciliados;
zero sondagens repetidas, histórico apagado ou fixtures criadas.
As duas posições retornaram a 2,000, custo médio 0,1000; pai original preservado.
Hash do filho conferido após execução; registro contém reserva e filho. **Reserva consumida:
sem replay, segundo filho ou nova execução.** Não apagar checkpoints/registro.

- [x] C1 real: ajuste, transferência de ida/retorno, reload, histórico e restauração de quantidade/custo.
- [ ] C2/perdas, CRUD completo de estoque e concorrência autenticada com operadores reais.

A cobertura macro continua **16/60 (26,67%)**, 15 pendentes/29 bloqueados, estoque 2/4.
O critério amplo de UI exige também cadastro/edição e perdas; a reconciliação já estava aprovada
pelo ciclo B e recebe corroboração, sem crédito duplicado.
`full_homologation=true` no relatório refere-se ao escopo C1, não ao aplicativo inteiro.
Autorização/janela C1 não se estendem a C2, compras, financeiro ou migrações.
Código validado `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`, CI #225, A/B, main e produção preservados.

As seções abaixo são histórico anterior ao fechamento; bloqueios de C1 nelas foram superados
somente no escopo e pela evidência real vinculada acima. Não repetir testes aprovados.



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



## Estado vigente — recaptura C1 e mutex antigo (02/11/2026)

[Relatório, evidências sanitizadas e limites](./QA_C1_RECAPTURE_AND_MUTEX_20261102.md).

- Recapturas reais TEST por SELECT: catálogo/segurança sem diferença de conteúdo para os artefatos
  revisados em 25/10, exceto captured_at; hashes originais antigos primeiro conferidos.
- Quatro validadores PASS; digest aprovado inalterado. Validade conjunta até
  **03/11/2026 às 11:31:31 America/New_York**. Exports novos privados, fora do Git.
- Regressão em bytes Git LF: **22/22 PASS**. Checkout Windows CRLF: **21/22, 1 falha**
  por hash sensível a EOL; causa demonstrada e fonte original preservada. Ver relatório.
- Preflight autenticado histórico: **PASS informado pelo proprietário na transferência**;
  não confundir os bloqueios documentais antigos abaixo com o estado histórico posterior.
- Preflight atual e C1 real: **BLOCKED**. Mutex pertence a uma sessão antiga do PowerShell
  parada em autenticação com ExecuteAuthorized/janela expirada; não fornecer credenciais nela.
  Cancelamento/encerramento e nova reconciliação ainda necessários.
- Pai com SHA-256 original preservado, registro do filho vazio nas leituras desta retomada.
  Nenhum novo launcher iniciado, RPC de negócio ou operação persistente nesta etapa.
- Macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados. CI #225 e código autorizado
  `4f8e908d987fced2a2dc3ddc5914b408d5a5881e` preservados; somente documentação publicada.

As seções anteriores abaixo são histórico; a janela antiga e as capturas de 25/10 estão expiradas.
Nova execução exige gates atuais e janela exclusiva própria; nenhum replay, recuperação histórica
ou sondagem repetida está liberado por esta atualização.


## Revisão vigente — catálogos C1 aprovados para preflight somente leitura (25/10/2026)

[Revisão independente e próximo comando Windows](./QA_C1_CHILD_CATALOG_REVIEW_20261025.md).
[Evidência sanitizada](./evidence/stock-c1-child-catalog-review-20261025.json).

- [x] Dois anexos reais recebidos e varridos: zero segredos detectados; dados, não instruções.
- [x] 12 funções/13 tabelas RLS/141 colunas/22 políticas/4 triggers revisados. Corpos e fingerprints
  de 16 definições conferidos com fontes anteriores/versionadas e renderização PostgreSQL descartável.
- [x] Digest calculado após revisão e aprovado pelos validadores do código 4f8e908:
  `0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825`.
- [x] Validadores de catálogo/precisão/auditoria/complemento PASS; regressões focadas 22/22 PASS.
  Código autorizado inalterado, CI #225 preservada 1001/1001; não repetir baseline por docs.
- [x] Escala observada de qty_ordered/received_qty: numeric(12,3). Não homologa compra/RPCs de criação/recebimento.
- [ ] Preflight autenticado do filho no Windows, pai/hash/ACL originais, baseline atual e ausência de reserva.
- [ ] Nova janela exclusiva e ciclo real C1; autorização condicional 045bc93 já recebida, não pedir novamente.

**PASS de revisão, BLOCKED de homologação real.** Zero envios de estoque/auditoria/sondagens no TEST,
nenhum pai acessado/alterado, nenhum filho criado. Os JSONs brutos não foram versionados.
As capturas conjuntas expiram em 25/10/2026 às 22:11:43 America/New_York; não recapturar antes disso
sem divergência/motivo, nem editar timestamps. O comando preparado é exclusivamente -PreflightOnly.
Ressalvas de TRIGGER/REFERENCES e search_path=public documentadas; nenhum grant ou função alterado.
Macro 16/60 (26,67%), 15 pendentes/29 bloqueados; A/B preservadas, C1 real não homologada.

## Histórico — autorização condicional recebida, antes dos anexos

O proprietário autorizou expressamente **uma única execução futura**, exclusivamente no TEST
`msinksoilkluooxenecy`, branch QA e SHA de código
`4f8e908d987fced2a2dc3ddc5914b408d5a5881e`, fixture
`ZZ_QA_STOCK_C_20261022_EXCLUSIVE`. [Registro sanitizado](./evidence/stock-c1-child-conditional-authorization.json).
A autorização não precisa ser solicitada novamente dentro desse escopo. Ela não substitui os gates.

- [x] Autorização condicional recebida: ajuste +0,125; transferência 0,500 SOURCE→TARGET;
  transferência inversa 0,500; ajuste final −0,125. Limites: 4 RPCs estoque + 4 auditoria,
  seis movimentos, zero sondagens repetidas; preservar pai/histórico, sem replay/compensação automática.
- [x] QA local/remota sincronizadas; SHA autorizado ancestral, somente docs posteriores.
  CI #225 preservada: 1.001/1.001 PASS, 9 jobs PASS / 4 persistentes BLOCKED. Não repetir baseline sem mudança de código.
- [ ] Pai original/hash/ACL íntegros, baseline atual e ausência de filho/reserva: não observados nesta sessão.
- [ ] Catálogos TEST atuais e revisão independente/digest: faltam exports; sessão sem integração SQL.
- [ ] Preflight autenticado do filho: não executado; faltam acesso ao notebook e configuração segura QA.
- [ ] Nova janela exclusiva: ainda não confirmada; confirmar somente quando os pré-requisitos estiverem prontos.

**BLOCKED antes de qualquer gravação.** Zero envios estoque/auditoria/sondagens nesta sessão.
Nenhum pai acessado/alterado ou filho reservado. Não presumir ausência global de reserva; verificar
no notebook antes de iniciar. A limitação da sessão não significa indisponibilidade global do notebook.
Não modificar o código autorizado, produção/main ou permissões para contornar os bloqueios.
Macro 16/60 (26,67%) preservada; C1 real ainda não homologada.

Próxima ação necessária: obter os resultados atuais, pela conexão comprovadamente TEST, de
`qa/sql/stock_journey_preflight_readonly_TEST.sql` e
`qa/sql/stock_c1_child_security_readonly_TEST.sql`. Revisar metadados e definições divergentes
antes de aprovar o digest. Não enviar checkpoint, credenciais, tokens ou paths privados.
Depois executar somente o preflight do [launcher dedicado](./QA_C1_CHILD_EXECUTOR_20261024.md).
A autorização já recebida só poderá ser usada após todos os gates passarem e na nova janela confirmada.

## Histórico — pacote do executor filho e CI #225 (24/10/2026)

[Pacote, revisão de segurança, gates e comandos Windows](./QA_C1_CHILD_EXECUTOR_20261024.md).
[Evidência verificável](./evidence/stock-c1-child-executor-ci225-20261024.json).

- [x] Executor filho dedicado e launcher separado implementados; pai imutável, reserva única
  local, oito gates, quatro operações delimitadas, intenção durável, reconciliação independente.
- [x] Recuperação somente leitura sem replay, segundo filho, compensação automática ou remoção
  de checkpoint; perdas de resposta, concorrência, expiração e falhas de persistência testadas.
- [x] Código **4f8e908d987fced2a2dc3ddc5914b408d5a5881e** publicado só na QA. [CI #225](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/40143125326):
  **1.001/1.001 PASS**, zero FAIL/SKIP nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED**.
  PowerShell 5.1/7, PostgreSQL descartável, Chromium e preflight geral autenticado PASS.
- [x] Local: **691/691 regressões +34/34 browser**, zero FAIL/SKIP; build/parse Edge PASS.
  CI #223/#224: 998/1000, 2 FAIL do mesmo teste Windows; alias TEMP corrigido e comprovado na CI #225.
- [x] SELECT complementar de segurança e SELECT de precisão/contratos de compras preparados;
  executados em PostgreSQL descartável. Não representam captura atual do Supabase TEST.
- [x] npm audit: runtime 0; três alertas moderados build/dev conhecidos. Tetos agregados da QA
  remota preservados e limite por pacote acrescentado; nenhuma dependência declarada corrigida.
- [ ] Captura TEST vigente, revisão independente de funções/ACL/RLS/triggers e digest aprovado.
- [ ] Preflight autenticado **do filho com o pai original**, baseline atual e janela exclusiva.
  O PASS do preflight geral da CI não substitui esse gate. Sessão sem Desktop Commander/SQL;
  isso não significa que o notebook esteja indisponível globalmente. Não pedir segredos no chat.
- [x] Autorização condicional posteriormente recebida para 4 RPCs estoque + 4 auditoria / 6 movimentos / 0 sondagens;
  ver registro vigente acima. Nenhuma movimentação C1 ou auditoria foi enviada; demais gates permanecem pendentes.
- [ ] C1 real 18/18; escala atual de compras, idempotência instalada e jornadas de compra/financeiro;
  perfis MANAGER/EMPLOYEE reais continuam pendentes, sem novas contas ou alterações persistentes.

Macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados, sem promoção por mocks ou CI.
Recuperação do pai já encerrada PASS; A/B preservadas, B 17/17. Não repetir sondagens,
recuperação antiga ou ciclo normal. Main/produção e checkpoints reais não acessados/alterados.

## Histórico — recuperação C1 concluída, baseline CI217 (23/10/2026)

[Fechamento real, plano e gates](./QA_C1_RECOVERY_CLOSURE_AND_CONTINUATION_20261023.md).
[Evidência sanitizada](./evidence/stock-c1-readonly-closure-reported-20261023.json).

- [x] Recuperação autenticada Windows confirmada pelo usuário: baseline inalterado, stage0,
  movimentos0/auditorias novas0, quantidades2/2, custos0,1/0,1, hash original preservado.
- [x] Diagnóstico local Windows PASS: Vite/Chromium disponíveis, estoque0/auditoria0/checkpoint0,
  full_homologation=false. Não identifica retroativamente a exceção original.
- [x] Recuperação formalmente encerrada sem compensação; não repetir comandos já comprovados.
- [x] Avaliador puro de continuação preparado: exige pai íntegro em PROBES_CONFIRMED, zero
  operações/pending, sondagens B/anon negadas, contratos e baseline atuais. READY_FOR_REVIEW
  não habilita escrita e não é preflight autenticado. Nenhum checkpoint real foi recebido.
- [x] Correção P0 independente: compras preservam quantidades com três casas (0,125/0,004),
  rejeitam precisão excedente e mantêm arredondamento monetário e proteção de replay local.
- [ ] Executor filho específico: ainda não implementado. Manter modo normal e --continue/--resume
  bloqueados; preservar pai, garantir um único filho e nunca repetir sondagens ou resultado desconhecido.
- [ ] C1 persistente: nova autorização específica, CI do executor, Auth/ACL/RLS/contratos atuais,
  comparação integral com o pai e janela exclusiva real. Nenhuma gravação liberada neste lote.
- [ ] Compras reais: conferir escala das colunas e contratos implantados por leitura; D permanece
  desativada, sem criar/receber/pagar/reverter pedidos no TEST.

Código publicado: **c26878a625d004025b3cd579dc891ae5af588af0**. [CI #217](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39964380706): **855/855 PASS**, zero FAIL/SKIP nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED pelo gate**.
Local: **598/598 regressões +31/31 browser**, zero FAIL/SKIP; build PASS.
Macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados; recuperação de segurança não promove
critérios macro de jornada UI. A/B preservadas; B17/17. Main e produção intocadas.

## Histórico — C1 interrompida, recuperação somente leitura (23/10/2026)

[Diagnóstico, integridade e procedimento seguro](./QA_C1_STARTUP_RECOVERY_20261023.md).
Código publicado: **e28a317e00062da16363a22f1f1cf53e15e6815c**; [CI #215](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39958446001): **827/827 PASS**, zero FAIL/SKIP nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED**. Windows PS5.1/7 e preflight autenticado PASS.

- Código original confirmado pelo usuário: C1_EXECUTION_UNCONFIRMED; PROBES_CONFIRMED,
  pending=null, confirmed=0, duas sondagens negadas, zero operações de estoque/auditoria.
  SQL independente informado: saldos2/2, custos0,1/0,1 e nenhum movimento/perda.
- A causa específica Windows não é identificável pelo código genérico. Corrigidos mismatch
  do executável Chromium, falta de timeout/identificação do Vite e diagnóstico por etapa.
  O polling histórico já tratava ECONNREFUSED; não atribuir a falha a essa hipótese descartada.
- Recuperação stage0 confirma baseline sem alegar restauração/ciclo/UI; checksum original
  obrigatório e zero reenvios/probes. Runtime local separado não autentica ou abre checkpoint.
- CI #214 falhou: colisão de nomes TEST/test no Windows, 798/826 PASS e28 FAIL; corrigida sem
  relaxar árvore limpa. Nova regressão global reproduziu a falha e impede reincidência.
- **572/572 regressões locais +29/29 browser local PASS**, zero FAIL/SKIP. Build, parser
  PowerShell e parse Edge PASS. npm: zero runtime; sete alertas build/dev continuam pendentes.
- **Somente -ReadOnlyRecovery do checkpoint original está previsto agora.** Não executar
  outro preflight/janela/ciclo/sondagem/compensação ou remover checkpoint. A sessão não tem
  Desktop Commander ou sessões QA; isso não implica indisponibilidade global do notebook.
- C1 real continua BLOCKED. A/B preservadas; macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados.
  Nenhum critério operacional foi promovido por mocks/CI. Main/produção/TEST sem mutações C1.

## Histórico — leitura segura e diagnóstico C1 (22/10/2026)

[Correção do bloqueio de leitura e procedimento somente PreflightOnly](./QA_C1_READ_REJECTION_20261022.md).
Código publicado: **9a0c5c025e14e335271195d76a658492857dba53**. [CI #213](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39870484891): **792/792 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes BLOCKED/ignorados pelo gate**.

- O SELECT direto de waste_transactions é incompatível com os grants reais informados. O erro foi reproduzido sem rede; o relatório antigo agregado não identifica sozinho a requisição exata do Windows.
- C1 e preflight genérico agora usam a RPC existente fn_read_waste_transactions_secure, com contrato histórico revisado e pin MD5/SHA-256/atributos. Não criar RPC ou ampliar SELECT/RLS.
- Diagnóstico sanitizado identifica etapa/recurso/ator/método/status e códigos upstream permitidos; não inclui URL, query, UUID, mensagem, credencial ou dados pessoais. Falhas continuam BLOCKED, sem retry/fallback.
- **538/538 regressões locais PASS**, incluindo 20 diagnósticos e 18 PostgreSQL descartável; build e análise de duas Edge Functions PASS. Histórico de perdas, inclusive sem ledger associado, continua obrigatório.
- **C1 real BLOCKED:** atualizar catálogo somente leitura com waste_reader_contract e repetir apenas -PreflightOnly no notebook; não executar movimentações, perdas, compensação ou auditoria.
- A/B e checkpoints preservados. Macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados, sem promoção por simulação ou CI.

## Histórico — reconciliação do contrato de auditoria C1 (22/10/2026)

[Análise semântica, evidências e preflight somente leitura](./QA_C1_AUDIT_CONTRACT_20261022.md).
Código publicado: **a60c0980ceb6005a90f99f8072af9b4b6639af02**. [CI #212](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39807483674): **768/768 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes BLOCKED/ignorados pelo gate**.

- O fingerprint real informado `ab9a6025c3457cb489b7ac24de19feb5` foi reproduzido exatamente da migração pós-cutover. Ela acrescenta validação de empresa ACTIVE ao corpo antigo; identidade/empresa continuam derivadas da sessão. Não é mera formatação nem vulnerabilidade comprovada.
- Contrato C1 exige somente a versão pós-cutover, MD5/SHA-256 e atributos completos. Baseline antiga, atributos ausentes/NULL, ACL/owner/path/assinatura/retorno divergentes bloqueiam.
- **514/514 regressões locais +24/24 browser HTTP simulado PASS**, zero falhas/skips; build, parser PowerShell e análise das duas Edge Functions PASS. PostgreSQL descartável comprovou a diferença semântica e negações antes do INSERT.
- Nenhuma função implantada, migração/rollback histórico, fixture, checkpoint, estoque ou auditoria TEST foi alterada. Nenhuma consulta SQL ou chamada C1 local; a CI executou seus checks habituais de autenticação/leitura.
- **C1 real BLOCKED:** executar catálogo atualizado e preflight autenticado no notebook; janela exclusiva continua obrigatória antes de qualquer movimentação. Não solicitar credenciais pelo chat nem usar service_role como usuário.
- A/B e macro **16/60 (26,67%)**, 15 pendentes/29 bloqueados, preservados. CI/mocks não promovem homologação real.

## Histórico — executor C1 antes da reconciliação do contrato (22/10/2026)

[Pacote C1, limites, Windows e recuperação somente leitura](./QA_C1_STOCK_20261022.md).
Código validado: **9ec21c609a196a4a30e9028e02faf4a581b29962**. [CI #209](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39800164617): **760/760 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes BLOCKED/ignorados pelo gate**. [Evidência](./evidence/stock-c1-ci-209-20261022.json).

- Proprietário informou patch de precisão instalado, fixture exclusiva pronta e preflight Windows real **5/5 PASS**. Evidência informada, sem observação direta nesta sessão; não reaplicar migração.
- Entregues quatro passos delimitados (ajuste +0,125; transferência 0,500; inversa 0,500; ajuste final), checkpoint privado, mutex, guard por sessão e recuperação sem escrita. C2/perdas fora da autorização.
- Auditoria de transferências e confirmação de falha sem repetir estoque corrigidas; transporte rejeita replay, concorrência, sessão errada e leituras truncadas.
- Local: **506/506 regressões +24/24 browser HTTP simulado PASS**, build e análise das duas Edge Functions PASS. Windows C1: 10/10 PS 5.1 e 10/10 PS 7 com arquivos sintéticos. Não são homologação C1.
- Gate npm corrigido: erro/incompletude bloqueiam sem falso zero. Oito regressões PASS. Auditorias completas: runtime zero; sete alertas conhecidos de desenvolvimento/build permanecem (cinco altos, dois moderados), sem atualização de dependências.
- **C1 real BLOCKED:** faltam credenciais QA seguras, acesso Windows/SQL nesta sessão, catálogo com c1_audit_contract e atestado da janela exclusiva. A autorização C1 foi recebida; não solicitar autorização genérica novamente.
- Executar o SQL de catálogo atualizado somente leitura; depois launcher local/preflight. Escrita Windows apenas com CI aprovada, sessões reais, fixture íntegra e janela confirmada externamente.
- Não há modo de retomada com escrita/compensação automática. Resultado desconhecido exige reconciliação somente leitura e preservação de checkpoint/histórico.

**A/B preservadas; macro 16/60 (26,67%), 15 pendentes e29 bloqueados.** C1 não promovida.
Quatro jobs persistentes da CI continuam OFF. Não alterar main, produção, usuários/claims ou Administração Comercial; não repetir #1253. Site comercial, Stripe e licenciamento automático seguem congelados.

## Histórico — preparação C anterior ao executor C1 (22/10/2026)

[Pacote C, evidências, procedimento Windows e sequência de autorizações](./QA_C_STOCK_20261022.md).
Código **16813e0022600344b4f08b5acee6c9c0569cb201**. [CI #204](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39723549123):
**712/712 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED**.
[Evidência CI](./evidence/stock-c-ci-204-20261022.json). Local: 63/63 regressões relacionadas e 3/3
browser HTTP simulado PASS; build PASS. C Windows: 4/4 PS 5.1 e 4/4 PS 7, somente arquivos sintéticos.

- [x] Quantidade de estoque preservada em três casas e custo inicial em quatro; entradas incompatíveis e seleção de inativo bloqueadas antes do RPC. PT/EN atualizado.
- [x] Preflight C somente leitura, SQLs de catálogo/fixtures/precisão e inventário de contratos D/E preparados e testados.
- [x] Bug de precisão reproduzido na função histórica em PostgreSQL descartável; patch/rollback exatos preparados e verificados, sem aplicação no TEST.
- [x] Concorrência local de transferências opostas, deriva de custo no retorno com médias diferentes e retenção de perda comprovadas; não equivalem à C real.
- [ ] C real: credenciais OWNER A/B, catálogo vigente e fixtures C dedicadas ainda não verificados nesta sessão.
- [ ] Patch TEST: revisão/preflight real e autorização específica de aplicação, em janela sem outras gravações.
- [ ] C1 persistente: fixture/janela/snapshot/compensação e autorização própria. C2: decisão sobre histórico de perda residual.

Preflight nesta sessão: **BLOCKED C_SECURE_QA_CREDENTIALS_REQUIRED**, antes de rede. Credencial
administrativa não foi utilizada como usuário QA. Sem integração SQL/Desktop Commander nesta
sessão; não declarar notebook offline. Sem fixtures elegíveis confirmadas, não criar ou reutilizar
histórico. Executor entregue é **somente leitura**, sem modo persistente e sem tocar checkpoint B.

Legado interno: b5ac605f98d630ec318651bfb70eda63; alvo preparado: 27bb16e1ab20acc78ef5bb2f25eb9c04.
Mudança previne diferença entre saldo arredondado e movimento com mais de três casas; não repara
histórico. Não substituir hashes por drift desconhecido nem aplicar/rollback com base apenas na CI.

**A/B preservadas; B 17/17. Matriz real permanece 16/60 (26,67%), 15 pendentes e 29 bloqueados.**
Nenhuma nova homologação real foi inferida dos testes. Não repetir #1253, estorno ou recuperação.
Não alterar main, produção, usuários/claims ou habilitar grupos persistentes. D/E continuam
aguardando seus próprios contratos atuais, pré-requisitos e autorizações. Comercial segue congelado.

## Atualização vigente — B #1253 concluída por conciliação (21/10/2026)

[Relatório final B e origem dos 17 checks](./QA_B_CLOSURE_20261021.md).
**17/17 PASS (100% do escopo B), zero FAIL/BLOCKED**: 14 PASS da execução original, fornecidos
pelo usuário, mais três invariantes finais PASS da recuperação real autenticada somente leitura.
UI, replay e isolamento de escrita provêm do campo checks original; não foram deduzidos de mocks
ou reexecutados. Os relatórios anteriores e seus códigos BLOCKED permanecem preservados.
Checkpoint inalterado, histórico preservado, estoque/custo restaurados, financeiro1/1/líquido0,
três auditorias, zero novas vendas/reversões na recuperação informada.

Código: **62c90fa51ad37c86151d80fc59fd5f1c578e41fe**. 46/46 regressões locais e build PASS.
[CI #203](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39719354496):
**685/685 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes
BLOCKED/ignorados pelo gate**. [Evidência da CI](./evidence/sale-b-closure-ci-203-20261021.json).
A CI executou regressões e seus checks habituais; não repetiu a venda, estorno ou recuperação B.

- [x] Campo checks original recebido: 14 PASS e três BLOCKED históricos preservados.
- [x] Recuperação real informada: três checks finais PASS, checkpoint inalterado e zero forwards.
- [x] Conciliação B: 17/17 PASS sem repetir venda, estorno ou compensação.
- [x] Matriz operacional: **16/60 (26,67%)**, 15 pendentes e 29 bloqueados; somente dois critérios macro promovidos.
- [ ] Demais pagamentos/recibos/devoluções e demais jornadas operacionais do aplicativo.
- [ ] C/D/E persistentes: pré-requisitos e autorização específica continuam necessários.

As evidências são reais informadas pelo usuário, sem observação direta do Windows nesta sessão.
JSON completos/SHAs exatos das execuções não foram recebidos; isso está registrado na proveniência.
Não confundir o SHA do avaliador com o SHA executado originalmente. **Não repetir a venda #1253,
estorno, compensação ou recuperação.** Comandos de retomada abaixo são históricos, superados
pelo fechamento com as evidências originais. Site comercial/checkout/licenciamento automático
seguem congelados. Não declarar 100% do aplicativo.

## Atualização vigente — inicializador Windows de #1253 (21/10/2026)

[Diagnóstico seguro e comando exclusivo ReadOnlyRecovery](./QA_B_WINDOWS_LAUNCHER_20261021.md).
Código do pacote: **`032fa87fcbb79863da4c043a4008e45ac90d15b6`**.
[CI #202](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39635483262):
**680/680 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes
BLOCKED/ignorados pelo gate**. [Evidência da CI](./evidence/sale-b-windows-launcher-ci-202-20261021.json).
PowerShell 5.1: 11/11 PASS; PowerShell 7: 11/11 PASS, exclusivamente arquivos sintéticos.
41/41 regressões locais e build PASS. Recuperação não instala navegadores/npm nem reaplica ACLs
na pasta existente. Guards de caminho literal/TEMP/reparse point, ACL exclusiva, snapshot,
credenciais ocultas, projeto TEST e hash antes/depois preservados. Exceções retornam somente
códigos/etapas fixos. ValidateLauncherOnly testa localmente sem credenciais nem Supabase.

- [x] Regressão nativa Windows 5.1/7 com pasta preexistente, ACLs/bytes preservados e mutex liberado.
- [x] Bloqueio de ACLs inseguras e caminhos inválidos, sem credenciais ou correção automática de ACL.
- [ ] Inspeção somente leitura do checkpoint original #1253 no notebook, ainda não executada nesta sessão.
- [ ] Homologação B integral: conferir todos os 17 critérios e evidências originais.

Nenhuma nova venda, reversão, escrita de negócio no TEST ou alteração do checkpoint original.
O bloqueio inicial do notebook não foi reproduzido contra sua pasta real; os novos códigos permitem
identificar a etapa sem expor detalhes. CI/mocks não promovem B a PASS. Matriz macro preservada:
**14/60 (23,33%)**, 15 pendentes e 31 bloqueados. Não repetir venda/estorno ou usar SHA anterior
para executar o launcher atualizado. Procedimentos de nova jornada abaixo são históricos.

## Atualização vigente — recuperar #1253 somente por leitura (21/10/2026)

[Auditorias corrigidas e comando de recuperação](./QA_B_AUDIT_RECOVERY_20261021.md).
O usuário confirmou venda #1253 cancelada, receita/despesa USD0,49, movimentos −0,25/+0,25,
estoque1/custo0,10 e as três auditorias. A execução original terminou BLOCKED por defeito no LIKE.
Código validado **`65029918238f2e51200addef9963797c5a998e5d`**. [CI #196](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39618474475):
**658/658 PASS**, zero falhas/skips nos testes executados; **8 jobs PASS, 4 grupos persistentes BLOCKED**.
[Evidência real da CI](./evidence/sale-b-ci-196-20261021.json).
25/25 regressões locais e build PASS. Correção preserva empresa/número/ações/cardinalidade;
recuperação somente leitura confere invariantes e mantém bytes/fase/flags do checkpoint original.
**Não repetir venda, estorno, preflight normal ou criação de fixture. Usar apenas ReadOnlyRecovery.**
A inspeção real ainda não foi executada nesta sessão. B integral segue BLOCKED, matriz14/60 (23,33%).
Procedimentos de nova jornada/compensação abaixo são históricos e não autorizam novas operações.

## Atualização vigente — configurações ativas B corrigidas (21/10/2026)

[Correção e comando Windows de preflight](./QA_B_SETTINGS_CONTRACT_20261021.md).
Código validado **`c515d8a4fb47570821db81913f0342bc3c14b9dc`**. [CI #195](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39608013041):
**652/652 PASS**, zero falhas/skips nos testes executados; **8 jobs PASS, 4 grupos persistentes BLOCKED**.
[Evidência real](./evidence/sale-b-ci-195-20261021.json).
O bloqueio real informado pelo usuário foi reproduzido e corrigido: `payment_method` e `channel`
singulares, `active === true`, Other obrigatório e canal existente válido. REST inclui/filtra active.
19/19 regressões B e build PASS. Fixture e catálogo já preparados: repetir **somente o preflight
Windows autenticado**, sem recriar fixture/export SQL, mantendo todos os gates e sua validade.
Nenhuma venda ou alteração de dados TEST nesta correção; cobertura real permanece 14/60 (23,33%).
As referências e comandos de entregas anteriores abaixo são históricos; usar o novo SHA acima.

## Atualização vigente — helpers reconciliados após cutover (21/10/2026)

Código aprovado: **`5f9d5aad2ec826c75072f96721cc9a3ab054a707`**. [CI #194](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39605307683):
**649/649 PASS**, zero falhas/skips nos testes; **8 jobs PASS, 4 grupos persistentes BLOCKED**.
[Resultado verificável](./evidence/sale-b-ci-194-20261021.json). Usar esse SHA em `ValidatedCodeSha`.
B real permanece BLOCKED até o novo catálogo e preflight Windows dessa fixture passarem.

[Revisão semântica, hashes e preflight Windows](./QA_B_HELPER_RECONCILIATION_20261021.md).
Os hashes informados de `current_business_id` e `user_can` foram reproduzidos exatamente pela
compilação das definições versionadas em PostgreSQL 17. Mudança legítima: empresa ACTIVE,
perfil ativo e search_path vazio. Baseline B atualizado; baselines históricos de aplicação/rollback
preservados. Nenhuma função/migração implantada, claim, estoque ou financeiro foi alterado.
Fixture exclusiva já identificada pelo usuário; falta revalidação autenticada de seu estado atual.
B permanece BLOCKED até novo export real com os oito hashes/ACLs e preflight Windows PASS.
Cobertura real inalterada: **14/60 (23,33%)**. Não usar SHA anterior à reconciliação como aprovação
do novo executor; a entrega indica o novo SHA validado. Histórico abaixo preservado.

## Estado vigente — A real confirmada; B autorizada e preparada (21/10/2026)

Código B publicado: `7b33a0bc22713bcaef0bcfaf04bf44d9fbae01d9` (inclui `9c3184c`).
[CI #193](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39600731619):
**646/646 PASS**, zero falhas/skips nos testes executados; **8 jobs PASS, 4 grupos persistentes BLOCKED**.
A correção de erro em modo somente leitura está incluída e coberta por regressão com zero chamadas
de compensação. CI não comprova venda B persistente nem validação nativa do novo PowerShell.

Ler [B-Jornada: executor e procedimento seguro](./QA_B_JORNADA_20261021.md).
QA sincronizada por fast-forward para `ea19a2a1a5f7be5a9e309f27dac0b28057098c8e`, preservando
os commits anteriores. O usuário confirmou A `REAL_PHOTO_JOURNEY_RESTORED`, dois uploads,
restauração, isolamento e zero resíduos, com SQL independente. A não foi reexecutada nesta sessão.
[Proveniência sanitizada](./evidence/photo-a-journey-user-confirmed-20261021.json).
Somente Storage promovido: **14/60 (23,33%)**, 15 PENDENTES, 31 BLOQUEADOS.

B está expressamente autorizada: **uma** venda QA de quantidade 1, total até **USD 1**, Other,
replay do mesmo ID e um estorno oficial, sem Stripe. Executor Windows separado, snapshot privado,
catálogo atual obrigatório, negação A/B/anônimo e reconciliação implementados. Homologação B
continua **BLOCKED**: esta sessão não possui credenciais QA A/B, integração SQL atual ou acesso
Windows; fixture/unidade/janela exclusiva não foram comprovadas. Nenhuma venda B foi executada.
Validação nativa do novo wrapper Windows ainda BLOCKED. Não repetir A nem pedir novamente
permissão para o escopo B já autorizado. C/D/E persistentes, novas fixtures e migrações exigem
suas próprias autorizações. Histórico abaixo preservado; suas pendências A estão superadas.

- [x] A real: Storage privado, substituição/remoção/reload, isolamento e restauração confirmados pelo usuário.
- [x] B: gates, executor, SQLs somente leitura, browser simulado e regressões locais preparados/aprovados.
- [ ] B real: preflight e 17 checks, estoque/custo restaurados, financeiro líquido zero e histórico preservado.
- [ ] Windows B: execução nativa do mutex/ACL e preflight com sessões seguras.

## Estado vigente — integração e correções P0 publicadas

[Relatório consolidado](./QA_OPERATIONAL_INTEGRATION_20261020.md). Commits `9b381e8` e `396afac`
preservados pelo merge `50fc57b`; CI #187 **612/612 PASS** e CI #188 **627/627 PASS** no código
`9f0fbca`. Cada CI executou oito jobs; quatro grupos persistentes ficaram BLOCKED/ignorados pelo gate.
Não chamar de 12/12 jobs aprovados. CI final #189, código `441634a`: **629/629 PASS**,
oito jobs PASS e quatro grupos persistentes BLOCKED; evidências no relatório vigente.

- [x] Histórico Git integrado/publicado sem force push; dois testes antigos de Storage corrigidos.
- [x] Upload incerto protegido; executor de fotos e prompts ocultos preparados; 30/30 regressões locais.
- [x] Compra rápida por RPC/unidade, cálculo canônico de custos e seleções ativas corrigidos no código QA.
- [x] Criação de insumo incerta e validação PDV antes do pagamento protegidas; browser HTTP simulado aprovado.
- [x] Migração **preparada, não aplicada** de idempotência de compras nega permissão NULL;
  sete testes PostgreSQL descartável, incluindo concorrência e rollback que preserva histórico, aprovados.
- [x] Exportações CSV protegidas contra fórmulas em texto não confiável; regressões locais aprovadas.
- [ ] A-Jornada real: sessões QA seguras, janela exclusiva, fixture/snapshot/compensação comprovados.
- [ ] Windows/PowerShell nativo e isolamento real de objetos desta jornada ainda não homologados.
- [ ] Jornadas B/C/D/E e implantações financeiras/compras exigem escopos/autorização separados.

Infra Storage/quatro policies já instaladas, conforme usuário. Não reaplicar. A autorização A-Jornada
já existe. Nenhum critério real novo foi promovido: **13/60 (21,67%)**, 15 PENDENTES, 32 BLOQUEADOS.

Atualizado: 2026-10-20. Fonte: Issue #1, relatórios P0.01/P0.04/P0.05, CI #116, CI #118, CI #121–#126, [CI #126 tentativa 2](./QA_DELIVERY_CI_126_ATTEMPT2_20261015.md), CI #159, [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726), [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977), [CI #172](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39124630797), CI #174, [auditoria definitiva do catálogo público](./QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md), [auditoria privada](./QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md) e [pacote de autoridade única](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md).
Escopo de trabalho: somente `automation/nexalvo-qa-actions` e Supabase TEST `msinksoilkluooxenecy`. Não modificar produção, main ou publicar deploy.

## Regras de status
- [x] = **VERDE: concluído e comprovado** por teste/execução com evidência.
- [ ] = **PENDENTE ou BLOQUEADO**; o texto identifica o motivo. Nenhuma inferência de homologação por simples abertura de tela ou mock.
- Macro concluído somente quando **todos** os seus micros obrigatórios forem concluídos, houver regressão verde e aceite humano.
- Não confundir SQL com JWT simulado, browser com RPC mockado e browser com gravação real.

## Publicação e CI confirmadas — 20/10/2026

`8faade0`, `a472146` e `ea72a16` publicados e confirmados no histórico remoto QA, sem force push.
[CI #183](./QA_DELIVERY_CI_183_20261020.md): **594/594 TAP PASS, 0 FAIL, 0 SKIPPED** nos testes
executados; **8 jobs PASS, 4 jobs persistentes BLOCKED (SKIPPED pelo gate)**. Não são 12/12 PASS.
Autenticação Git/push resolvida por helper temporário seguro. Menções abaixo ao bloqueio de
publicação são históricas e estão superadas; API GitHub 403 não impediu observação HTML real.
[Próximo lote persistente preparado](./QA_OPERATIONAL_PERSISTENT_BATCH_01.md): nenhuma execução
autorizada/ativada, compras browser OFF. Checkout/comercialização automática congelados.

- [x] Publicação dos commits preservados e CI segura #183 comprovadas.
- [ ] Quatro grupos persistentes e jornadas do próximo lote; autorização específica pendente.

## P0 obrigatório — Stripe Terminal exclusivamente online (20/10/2026)

Política e contratos: [P0_STRIPE_TERMINAL_ONLINE_ONLY.md](./P0_STRIPE_TERMINAL_ONLINE_ONLY.md).
Terminal operacional é P0; site comercial, checkout Stripe e licença automática continuam congelados.
Modo Stripe explícito bloqueia cartão sem backend/leitor comprovados, sem confirmação manual ou offline.
Núcleo/reconciliação preparados e testes simulados não equivalem a leitor/pagamento TEST real.
Matriz **v2: 13/60 (21,67%)**, 15 PENDENTES e 32 BLOQUEADOS; oito critérios novos de Terminal,
nenhum promovido a verde. A v1 13/52 (25%) abaixo é histórica, substituída como cobertura vigente.
Sem deploy, migração, cobrança ou outra gravação TEST nesta entrega.

- [x] Política, bloqueio fail-closed e traduções dos seis estados preparados no código QA.
- [ ] Backend Stripe autenticado, tentativa durável/locks e commit financeiro idempotente.
- [ ] Webhook assinado/deduplicação e recuperação real após timeout/reinício.
- [ ] Leitor/simulador oficial, pagamentos Stripe TEST e todos os estados UI reais homologados.

## Prioridade operacional vigente — 20/10/2026

Site comercial, checkout Stripe e licença automática congelados. Administração Comercial preservada.
Usar a [matriz operacional v1](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md): **13/52 critérios (25%)**,
14 PENDENTES e 25 BLOQUEADOS. Este denominador explícito não é uma soma dos checks históricos abaixo.
Correções/interfaces simuladas não foram promovidas a jornadas reais aprovadas.
[Relatório desta entrega e autorizações necessárias](./QA_OPERATIONAL_P0_20261020.md).
Quatro grupos persistentes da CI agora exigem autorização manual; push automático os registra
BLOCKED. Não confundir zero falhas no escopo executado com ausência de jornadas bloqueadas.

## M0 — Infraestrutura, isolamento e qualidade contínua (parcial)
- [x] Branch de QA isolada e workflow TEST configurado. Última baseline integral confirmada pelo usuário: CI #174, 12/12 jobs e 489/489 PASS.
- [x] CI #159: 12/12 jobs, 470/470 TAP, 0 falhas, 0 skips; preflight OWNER A/B e todos os produtores autenticados aprovados.
- [x] Pacote integrado de homologação preparado: manifesto com hashes/dependências, comparação de catálogo somente leitura, confirmação externa obrigatória do TEST, runner Windows sem escrita, backend versionado de gestão de equipe e rollbacks que preservam histórico. **274/274 regressões estáticas**, build e auditoria runtime aprovados localmente; CI #158 integralmente verde. [Evidência](./QA_FINAL_HOMOLOGATION_PACKAGE_20261017.md).
- [x] Primeiro catálogo real TEST revisado: 31/31 tabelas com RLS, 53 policies, 58 funções, 48 `SECURITY DEFINER`, 568 grants; 25/25 tabelas do contrato e 39 RPCs implantadas têm presença/assinaturas compatíveis, sem acesso `anon` demonstrado. CI #159 aprovou 470/470. [Evidência](./QA_REAL_CATALOG_REVIEW_20261017.md).
- [x] Segundo export público sanitizado e revisado: 58/58 corpos, 53/53 policies, 568 grants de tabela, 3.547 de coluna, 114 índices, 196 constraints e cinco triggers. O original passou varredura de segredos e não foi versionado. [Evidência](./QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md).
- [x] Export privado sanitizado e revisado: dois schemas, quatro tabelas privadas com RLS/negação direta, duas sequências, sete funções (seis definers), cinco wrappers compatíveis, zero acesso `anon` e zero leitura/escrita direta de `authenticated`. O gate OWNER/tenant do backup e os locks de provisionamento foram confirmados. [Evidência](./QA_PRIVATE_SECURITY_CATALOG_AUDIT_20261018.md).
- [x] [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726): 12/12 jobs e 485/485 verificações raiz aprovadas, zero falhas/skips, incluindo preflight autenticado, regressões de catálogo privado e browser smoke.
- [ ] **BLOQUEADO NO TEST:** o plano implantado usa `nexalvo_platform.operators`; há um operador ativo e zero claims assinados. O pacote de cutover atômico está preparado e impede duas autoridades globais simultâneas, mas Edge deploy, claim, preflight 12 checks, migração, pós-preflight 20 checks e homologação real exigem as autorizações sequenciais documentadas. [Evidência](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md).
- [x] Drift das três funções reconciliado: os corpos são byte-idênticos; somente os tipos de retorno ficaram qualificados por `public` sob `search_path=pg_catalog`. Captura bruta fora do Git, zero segredos/PII. Migração e rollback agora fixam hashes de corpo, atributos e definições canônicas.
- [ ] **ARTEFATO PRE-APPLY NÃO RETIDO:** a migração fail-closed foi autorizada e o Supabase TEST reportou `success: true`, mas o resultado separado dos 15 checks pré-aplicação não foi fornecido para retenção. Essa lacuna documental não autoriza reaplicação nem rollback.
- [x] Bug do contador administrativo corrigido: claim ausente/JSON `null` agora conta como operador sem `SUPERADMIN`. O resultado real correto é 1 operador ativo sem claim e `authority_models_aligned=false`; há regressões específicas para os dois casos nulos.
- [x] [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977): 12/12 jobs, 487/487 verificações raiz, zero falhas/skips; preflight autenticado e browser smoke aprovados no commit `f34232e8`.
- [ ] **PROVA ADICIONAL:** reexecutar o export privado ampliado para colunas, constraints, índices, grants de uso e default privileges; a versão recebida não continha esses metadados. Reter também fingerprint da matriz global atual.
- [x] **APLICADO SOMENTE NO TEST:** `20261017_catalog_security_hardening_TEST.sql` retornou `success: true`. Verificação independente confirmou bloqueio de salário/custo, trigger tenant, prefixo `Client:`, zero EXECUTE anônimo e zero policy para `PUBLIC`; o pós-preflight oficial corrigido foi posteriormente confirmado em **16/16 PASS**. Não reaplicar nem executar rollback sem nova autorização.
- [ ] **ALTA, CORREÇÃO PREPARADA:** `fn_save_user_profile` implantada permite escalonamento indireto de overrides entre duas contas não-OWNER com `manageUsers`. O pacote `staff-user-service` agora fixa o fingerprint legado, instala a substituição OWNER-safe e revoga o EXECUTE autenticado legado. Migração + Edge Function ainda exigem autorização e homologação real no TEST.
- [x] **MÉDIA, MITIGAÇÃO APLICADA NO TEST:** `fn_write_audit` agora marca eventos cliente com `Client:` e a verificação independente confirmou o prefixo. Identidade/tenant continuam server-side; o limite e o fingerprint de destino ainda precisam do pós-preflight oficial corrigido.
- [x] Supabase TEST com duas empresas OWNER e testes de isolamento HTTP/RLS; relatório P0.01.
- [x] Scripts de estoque e compras em SQL com BEGIN/ROLLBACK executados e verificados; relatório P0.04/P0.05.
- [x] Gate de dependências publicado: runtime exige zero alertas moderados ou superiores; auditoria completa falha para pacote/advisory novo, severidade crítica ou aumento sobre o teto conhecido. CI #124 aprovou o gate.
- [ ] Sete alertas de build/desenvolvimento permanecem (5 altos, 2 moderados); migração Tailwind 4 e regressão visual continuam pendentes, sem `npm audit fix --force`.
- [x] Reconciliação estática do hardening publicada em `ff1db15`: os três drifts eram apenas qualificação de tipo de retorno; corpos implantados iguais ao histórico, rollback exato e guards de corpo/atributos/ACL preparados.
- [x] [CI #171](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39123639069): **12/12 jobs, 488/488 PASS, 0 FAIL, 0 SKIPPED**, incluindo preflight OWNER A/B, acesso multiempresa e browser.
- [x] [CI #172](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39124630797), commit `97ee435`: **12/12 jobs, 489/489 PASS, 0 FAIL, 0 SKIPPED**; preflight autenticado `PASS [OK]`. Inclui a regressão que proíbe `pg_catalog.position(...)` e exige as quatro chamadas `pg_catalog.strpos(...)` do pós-preflight.
- [x] **PÓS-PREFLIGHT OFICIAL:** a versão corrigida de `catalog_security_hardening_preflight_readonly_TEST.sql` foi confirmada em **16/16 PASS** no TEST. O hardening público deixa de ser bloqueio para o próximo cutover; a evidência informada não autoriza reaplicação.
- [ ] Validação de backup restaurado em ambiente isolado e plano de recuperação.
- [ ] Aceite humano da release candidata, critérios de go/no-go e checklist de publicação (sem executar publicação automaticamente).

- [x] Regressão da identificação global e traduções comerciais em `ef193dd`: local **109/109**, build PASS; [CI #180](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096) **12/12 jobs, 539/539 PASS, 0 FAIL, 0 SKIPPED**. [Agregado](./evidence/platform-admin-ui-ci180-20261020.json). O gate OWNER A/B não homologa a Edge SUPERADMIN, que permanece 503.

## M1 — P0.01 Autenticação, perfis e permissões (aberto)
- [x] Matriz SQL de 20 permissões por 4 perfis: 80/80, mais 8/8 casos especiais, sob ROLLBACK. [Relatório](./P0_01_PERMISSIONS_20261012.md).
- [x] Login real de OWNER A/B e isolamento HTTP entre empresas, incluindo operações privilegiadas rejeitadas.
- [x] Preflight OWNER A/B completo após fixture Employee B: employees e sale_items por facade/SELECT direto, negação cruzada, estoque e isolamento de compra. CI #126 tentativa 2.
- [ ] **BLOQUEADO:** perfis QA MANAGER/EMPLOYEE existentes e controlados, porém inativos; faltam autorização de reativação/vínculos e sessões independentes na admissão. Este lote não exige configurar novos Secrets.
- [ ] Login real e testes HTTP/RLS/RPC completos para MANAGER e EMPLOYEE.
- [ ] Playwright real para botões, páginas, restrições e operações por perfil.
- [ ] Overrides personalizados, desativação e revogação de acesso durante sessão, auditoria.
- [x] Runner somente leitura MANAGER/EMPLOYEE e sete regressões fail-closed preparados em `edead39`; [CI #127](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38776559766) aprovou os guards. [Procedimento](./QA_REAL_ROLE_PREFLIGHT.md).
- [x] Workflow manual de perfis restrito à branch QA e Environment TEST publicado em `ba4e7d4`; oitavo guard e [CI #128](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38777105413) aprovados. A execução live não foi disparada.
- [x] Plano TEST-only para duas identidades independentes e dois vínculos ativos preparado com descoberta somente leitura, aplicação idempotente, auditoria e compensação exata; cinco regressões locais aprovadas. [Procedimento](./QA_REAL_ROLE_ACCOUNT_PLAN.md). Nenhum SQL, convite ou alteração de senha foi executado.
- [x] **Preparação atual somente leitura:** Auth/vínculos/FKs/dependências dos candidatos e turnos fechados conferidos; controle das duas contas confirmado pelo proprietário. Isso não autoriza reativação nem comprova sessões reais. [Pacote staff](./QA_STAFF_BUSINESS_HOMOLOGATION_PLAN_20261104.md).
- [ ] **BLOQUEADO:** execução real do runner de perfis depende das duas contas TEST ativas, ligadas a employees distintos da empresa A, e quatro segredos armazenados no GitHub Environment. O runner live continua fora da CI padrão.

## M2 — P0.02 Convites e ciclo de autenticação (aberto)
- [x] **Diagnóstico local de recuperação:** mensagens/status/códigos sanitizados, destino restrito ao TEST, chave pública validada, resposta 2xx verificada e sessão normal anterior removida após sucesso. **14/14 regressões unitárias e 4/4 browser com HTTP interceptado** aprovadas; isso não altera senha real nem comprova e-mail/login. [Evidência corrente](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [ ] **BLOQUEADO — tentativa atual OWNER QA TEST:** reproduzir recuperação com link novo e login real bem-sucedido. E-mail recebido e formulário aberto foram relatados; a tentativa terminou em erro genérico, sem status/código coletado. O marco manual histórico abaixo não homologa este incidente.
- [x] Login/logout, refresh, refresh revogado após logout, credenciais inválidas e JWT malformado.
- [x] UI rejeita links de convite/recuperação expirados simulados, sem expor token.
- [ ] Convite real por e-mail, aceitação e primeiro login de QA: houve tentativas/relatos anteriores, mas ainda falta evidência inequívoca de aprovação ponta a ponta na matriz atual.
- [x] **Recuperação de senha e troca de credencial, conforme registro de teste manual anterior (06/10):** senha antiga recusada e senha nova aceitou login no Dashboard. **Evidência histórica conversacional, ainda não reproduzida na matriz QA atual; entrega de e-mail não confirmada por artefato independente.**
- [x] **Expiração real de JWT, conforme teste anterior de 06/10:** fora da tolerância de ~30 segundos, REST 401 `JWT expired` e Auth 403. **Evidência histórica conversacional; não equivale à homologação da matriz atual.**
- [ ] Revogação durante sessão ativa, comportamento multi-dispositivo e regressão autenticada no TEST.

## M3 — P0.03 Vendas, pedidos, caixa e financeiro (aberto)
- [x] RPC TEST de venda/reversão idempotente, compensação financeira e replay, com CI verde.
- [x] OWNER B impedido de vender em caixa fechado, sem efeitos financeiros.
- [x] **Correção preparada e revisão estática de despesa Cash:** normalização do meio de pagamento, lock do caixa, isolamento antes de mutações, saldo por tipo contábil, rejeição de valores/saldos especiais e audit log atômico; 6/6 regressões locais. O artefato é TEST-only e **não foi aplicado**. [Relatório](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [ ] **BLOQUEADO:** executar a prova SQL `BEGIN/ROLLBACK` somente depois de autorização para aplicar a correção no TEST; confirmar também a fórmula implantada de fechamento/reversão e os grants efetivos.
- [ ] **PREPARADO, AINDA NÃO HOMOLOGADO:** wrapper `fn_create_expense_idempotent`, chave empresa/request ID, payload completo, frontend opt-in e provas rollback foram publicados em `6ab4f48`. Migração não aplicada, flag desligada e replay/concorrência reais no TEST pendentes; o RPC implantado continua sem essa garantia.
- [ ] Jornada completa de venda real pela interface, carrinho, descontos, impostos e cliente.
- [x] PDV utilizável aprimorado: cartões visuais com inclusão rápida e quantidade, fotos HTTPS com fallback, validação finita de descontos/impostos, seletores ativos e recuperação de falha do adaptador de cartão. **37/37 regressões afetadas** e build local aprovados. [Evidência](./QA_POS_USABILITY_20261015.md). Upload para Storage e venda persistente real continuam pendentes.
- [x] Catálogo rápido do PDV possui busca por nome/SKU/categoria sem sensibilidade a acentos, filtro combinável e limpeza de estado vazio. **35/35 regressões afetadas** e build local aprovados. [Evidência](./QA_POS_USABILITY_20261015.md). A jornada persistente permanece pendente.
- [x] Recibos históricos de vendas canceladas identificam reversão/falha e seu horário; comprovante de cartão não afirma reembolso do processador, e ticket de cozinha permanece bloqueado após cancelamento. **39/39 regressões afetadas** e build local aprovados. [Evidência](./QA_SALES_RECEIPTS_20261016.md). Integração real com adquirente e impressão física continuam pendentes.
- [x] Movimentos e fechamento de caixa validam tipo, motivo e valores finitos antes de qualquer RPC; entradas inválidas comprovadamente fazem zero chamadas remotas e a prévia não apresenta infinitos. **36/36 regressões afetadas** e build local aprovados. [Evidência](./QA_CASH_REGISTER_FINITE_VALIDATION_20261016.md). A jornada persistente e o SQL implantado permanecem pendentes.
- [x] Falha ao salvar depois de qualquer pagamento confirmado preserva a mesma venda para retry exclusivo do salvamento, alerta antes de sair e exige confirmação para descartar a recuperação; o pagamento não é executado novamente. [Evidência](./QA_CONFIRMED_PAYMENT_RECOVERY_20261016.md). Adquirente real e recuperação por webhook continuam pendentes.
- [ ] Todos os métodos de pagamento, pagamentos mistos, cancelamentos e devoluções.
- [ ] Abertura/fechamento, sangria/suprimento e conciliação de caixa pela interface.
- [ ] Concorrência determinística venda vs. fechamento e falha de rede durante commit.
- [ ] Conferência de relatórios financeiros e isolamento por perfil/empresa.

## M4 — P0.04 Estoque e movimentações (aberto)
- [x] Ajuste, perda, transferência, saldo e ledger testados via SQL reversível.
- [x] Leitura segura de estoque e transações corrigida no frontend; regressão de interface.
- [ ] Cadastro/edição de itens, ajustes, perdas e transferências completos no Playwright real.
- [x] Interface de estoque endurecida: valor total protegido por `viewFinancials`, quantidades especiais/negativas rejeitadas também no fallback local, transferência incerta bloqueada até refresh e histórico filtrável/expansível. Nove regressões novas e build local aprovados. [Evidência](./QA_INVENTORY_USABILITY_20261015.md). Playwright autenticado e gravações reais permanecem pendentes.
- [x] Cadastro de insumos agora permite editar metadados, desativar e reativar sem alterar quantidade/custo do ledger; preserva histórico, bloqueia operações em itens inativos, impede desativar ingrediente de produto ativo e exige locais ativos nas transferências. **40/40 regressões afetadas** e build local aprovados. [Evidência](./QA_INVENTORY_CATALOG_20261016.md). Persistência autenticada e revisão visual continuam pendentes.
- [ ] Estoque insuficiente, unidades, locais, duplicidade e histórico vinculado pela interface.
- [ ] Concorrência de múltiplos usuários, replay e timeout de gravações.
- [ ] Conciliação de saldos/custos médios e trilha de auditoria persistente.

## M5 — P0.05 Compras e fornecedores (aberto)
- [x] **Guard local de compensação:** fallback do teste persistente agora exige pagamentos revertidos e ledger financeiro líquido zero; cinco regressões unitárias aprovadas. **Não significa compensação executada no banco.** [Evidência](./P0_02_RECOVERY_P005_GATE_20261014.md).
- [x] SQL reversível: pedido Ordered, recebimento parcial/total, pagamento, sobre-recebimento/sobrepagamento rejeitados, reversão e cancelamento.
- [x] Leitura segura de pedidos/itens e isolamento HTTP de histórico de pagamentos.
- [x] Validações negativas no formulário de compras (quantidade zero, custo negativo, desconto excessivo).
- [x] Interface de compras endurecida: fornecedor/local ativos, método e datas válidos, valores não finitos rejeitados, resposta de commit incerta bloqueia reenvio; custos exigem `viewFinancials` e pagamentos exigem `paySuppliers`. **48/48 regressões afetadas**, build e audit runtime aprovados. [Evidência](./QA_PURCHASE_SUPPLIER_USABILITY_20261015.md). Não equivale à jornada persistente P0.05.
- [x] Contrato positivo de criação Ordered/Draft na UI com RPC interceptada (MOCK — não prova persistência).
- [x] Teste Playwright persistente TEST escrito, opt-in e sintaxe verificada em CI #112 (não executado).
- [ ] **BLOQUEADO:** executar criação persistente via browser com OWNER TEST e compensação controlada; exige preflight autenticado PASS no SHA publicado e autorização específica. O teste permanece fora da CI padrão.
- [ ] Recebimento parcial e total real via UI, pagamento e reversão, estoque restaurado e financeiro líquido zero.
- [ ] Reversão/cancelamento em erro parcial, atraso de commit, falha de rede e repetição; confirmar audit trail.
- [ ] Corrida de recebimentos simultâneos e verificação de transições proibidas.
- [ ] Decidir/testar migração de idempotência de compras em TEST; atualmente OFF/não instalada.

## M6 — P0.06 Rede, resiliência e concorrência (aberto)
- [x] Browser-smoke P0.05 tornado determinístico: login OWNER B continua real, fixtures exclusivas do formulário são interceptadas e validadas contra TEST/empresa B, e nenhuma compra persistente é executada. [Evidência](./QA_BROWSER_SMOKE_FIX_20261016.md).
- [x] CI #144: `browser-smoke` 51/51, 12/12 jobs e agregador QA aprovados no commit `22603c1`, após corrigir os cenários desatualizados de desconto no PDV e fornecedor ativo em compras. [Execução](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38899806097).
- [x] Browser offline/reconexão e sessão preservada em smoke.
- [x] Testes de replay financeiro e falha simulada após commit.
- [ ] Interrupção real no envio e na resposta durante gravações de venda, estoque e compra.
- [ ] Retry seguro após timeout, prevenção de duplicidade e recuperação consistente da UI.
- [ ] Testes de contenção simultânea de operações críticas, reconciliação e telemetria.

## M7 — P0.07 Arquivos, fotos e isolamento multiempresa (aberto)
- [ ] Upload de imagens de produtos com formato, tamanho, segurança e mensagens de erro.
- [x] Integração de upload privado preparada: JPEG/PNG/WebP até 5 MB, prévia, substituição/remoção, referência estável, URLs assinadas curtas em lote e compensação de upload não vinculado. Bucket/políticas e homologação real continuam bloqueados até preflight e autorização de migração TEST. [Evidência](./QA_PRODUCT_IMAGE_STORAGE_20261016.md).
- [ ] Leitura/download/remoção de arquivos autorizados; isolamento real entre empresas.
- [ ] Testar URL pública/assinada, cache, revogação, substituição e exclusão.
- [ ] Permissões de Storage e políticas RLS, incluindo tentativa de acesso cruzado.
- [x] Políticas Storage TEST-only preparadas para SELECT por empresa e escrita com `manageRecipesAndCosts`, caminho UUID estrito, bucket privado e rollback que recusa apagar objetos. Aplicação e tentativa real de acesso cruzado permanecem pendentes. [Evidência](./QA_PRODUCT_IMAGE_STORAGE_20261016.md).

## M8 — P1 Cadastros, operação e UX (aberto)
- [ ] Produtos: criação, edição, desativação, foto, SKU, preço, receita, custos e duplicidades.
- [x] Catálogo valida e normaliza nome, SKU, categoria, preço, descrição, foto e receita; bloqueia duplicidades, valores especiais e ingredientes inválidos/inativos antes do RPC. [Evidência](./QA_PRODUCT_CATALOG_20261016.md). Upload Storage e persistência autenticada continuam pendentes no item amplo acima.
- [x] Cadastro/edição preserva e valida URL HTTPS da foto, mostra prévia e persiste `image_url` pelo RPC existente; lista e PDV exibem a imagem com placeholder em erro. Upload binário/Storage permanece pendente.
- [x] Clientes: criação/edição de nome, telefone, e-mail, aniversário e notas compartilham validação; contatos duplicados são bloqueados, histórico permanece vinculado e valores exigem `viewFinancials`. **7/7 regressões locais** e build aprovados. [Evidência](./QA_CUSTOMER_USABILITY_20261015.md). Persistência autenticada e perfis reais continuam na homologação pendente.
- [x] Fornecedores: formulário de criação/edição valida duplicidade de nome/e-mail e site, normaliza campos, desativa quando há histórico e trata falhas de exclusão/alteração; valores históricos exigem `viewFinancials`. [Evidência](./QA_PURCHASE_SUPPLIER_USABILITY_20261015.md). Persistência real e matriz MANAGER/EMPLOYEE permanecem pendentes.
- [x] Catálogo de fornecedores: busca normalizada por nome/contato/telefone/e-mail/produtos e filtros de ativos, inativos e todos. **31/31 regressões afetadas** e build local aprovados. [Evidência](./QA_SUPPLIER_CATALOG_20261016.md). Persistência autenticada permanece pendente.
- [x] Funcionários — interface independente de contas: formulário valida salário/local/hierarquia, protege salário por `viewFinancials`, desativa sem apagar histórico e o ponto trata entrada, saída e pausas sem falso sucesso. **43/43 regressões afetadas** e build aprovados. [Evidência](./QA_EMPLOYEE_WORKFLOWS_20261015.md). Convites e sessões reais MANAGER/EMPLOYEE permanecem em M1/M2.
- [x] Tarefas — interface: criação/edição valida funcionário ativo, data e prioridade; conclusão bloqueia concorrência, falhas são exibidas e exclusão exige confirmação. [Evidência](./QA_EMPLOYEE_WORKFLOWS_20261015.md). Persistência com perfis reais continua pendente.
- [ ] Relatórios: totais, filtros, períodos, exportação, consistência com ledger.
- [x] Relatórios respeitam `viewFinancials` na interface: P&L, receita, margens, custos, valores e exports financeiros não são renderizados sem permissão; contagens operacionais permanecem disponíveis. Cinco regressões novas e build local aprovados. [Evidência](./QA_REPORT_FINANCIAL_GUARD_20261015.md). Isso não substitui RLS/API nem conclui a homologação integral de relatórios.
- [x] Fórmulas e filtros corrigidos: P&L exclui imposto da receita e o informa separadamente, descontos são rateados por produto, ranking de clientes respeita o período, tempos inválidos/cancelados são excluídos e datas personalizadas são validadas. **35/35 regressões afetadas** e build aprovados. [Evidência](./QA_REPORT_ACCURACY_20261015.md). Conciliação com fechamento contábil real ainda permanece pendente no item amplo acima.
- [ ] Configurações: persistência, permissões, idioma, fuso, regras e preferências.
- [x] Configurações agora validam nome, moeda, imposto e listas antes da escrita; moeda e fuso carregados alimentam os formatadores compartilhados, e o fuso pode ser selecionado na interface. [Evidência](./QA_SETTINGS_USABILITY_20261016.md). Persistência autenticada e preferências completas ainda permanecem no item amplo acima.
- [ ] Responsividade desktop/tablet/mobile, acessibilidade, rolagem, estados vazios e erros.
- [x] Base responsiva compartilhada corrigida: modal com rolagem/safe area, botão desabilitado efetivo, formulários adaptáveis, sidebar rolável, ações móveis visíveis, textos longos e valores zero preservados, mensagens comuns traduzidas e ARIA básico. **77/77 regressões afetadas** e build aprovados. [Evidência](./QA_RESPONSIVE_UI_20261015.md). Revisão visual autenticada e acessibilidade completa permanecem no item amplo acima.
- [x] Acessibilidade de teclado: modais fecham com `Escape`, gerenciam/restauram foco, linhas/cartões acionáveis respondem a `Enter`/`Espaço`, históricos e tarefas usam botões semânticos e buscas possuem nome acessível. **47/47 regressões afetadas** e build local aprovados. [Evidência](./QA_KEYBOARD_ACCESSIBILITY_20261016.md). Auditoria assistiva integral permanece pendente.
- [ ] Performance com volumes realistas, carga, paginação e degradação.
- [x] Bundle de produção dividido: arquivo principal reduzido de 587,61 kB para 426,97 kB, com React e ícones em chunks cacheáveis; build sem alerta de chunk acima de 500 kB. [Evidência](./QA_BUILD_CODE_SPLITTING_20261016.md). Volumes realistas, paginação e métricas de campo permanecem pendentes.
- [ ] Backup/restauração isolados e ensaio de recuperação.

## M9 — P2 Produto SaaS, lançamento e operação (aberto)
- [ ] Onboarding de empresa, usuários, localizações e configurações iniciais.
- [ ] Planos, limites, assinatura, faturamento e inadimplência.
- [ ] Administração SaaS e observabilidade sem acesso indevido a tenants.
- [x] Fundação frontend da Administração Comercial separa SUPERADMIN de OWNER, confia somente em `app_metadata`, não enumera tenants pelo cliente público e exige Edge Function protegida para listagem e mutações confirmadas. [Evidência](./QA_PLATFORM_ADMIN_FOUNDATION_20261016.md).
- [x] Pacote técnico da Administração Comercial preparado: claim assinado revalidado no Edge e nas RPCs, listagens server-only, licença vitalícia/revogação idempotentes, auditoria privada, cutover atômico, recuperação, rollback fail-closed e suspensão aplicada ao contexto RLS/RPC/export. PostgreSQL descartável: pós-preflight 20/20, negações 4/4 e rollback PASS. [Evidência](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md).
- [x] Migração comercial aplicada no TEST: usuário confirmou pós-preflight **20/20** e contratos **3/3**. GETs reais desta sessão confirmaram empresas **200** (três), auditoria **200** (zero), três RPCs no OpenAPI e ator inexistente negado **403/42501**. Leitura via credencial de servidor não equivale ao JWT SUPERADMIN pela Edge. [Evidências e limites](./QA_PLATFORM_ADMIN_UI_RUNTIME_20261020.md).
- [x] Identificação frontend SUPERADMIN separada do papel tenant EMPLOYEE e traduções comerciais PT/EN implementadas; regressões de renderização/permissões locais aprovadas. Não altera claims ou acesso financeiro tenant.
- [ ] **HOMOLOGAÇÃO REAL DA ADMINISTRAÇÃO COMERCIAL:** Edge ainda **503 PLATFORM_NOT_CONFIGURED**. CORS local **204 PASS**, origem desconhecida **403 PASS**. Faltam acesso de gestão aos Secrets e sessão segura SUPERADMIN para leitura real pela Edge/painel. Não reaplicar migração, trocar claim ou promover EMPLOYEE. [Estado vigente](./QA_PLATFORM_ADMIN_UI_RUNTIME_20261020.md).
- [ ] Suporte, logs, incidentes, monitoramento e alertas.
- [x] Recuperação de falha global da interface: Error Boundary acessível PT/EN evita tela vazia, não repete operações, oferece remontagem/recarga e emite somente referência local sanitizada. Envio, persistência e alerta externo de telemetria continuam pendentes no item amplo. [Evidência](./QA_APP_CRASH_RECOVERY_20261016.md).
- [ ] Privacidade, termos, documentação de uso e operação.
- [ ] Piloto real supervisionado, correção de feedback e aceite final.
- [ ] Revisão de segurança, backups, plano de rollback e aprovação explícita para lançamento.

## Critério para 100%
Todos os macros M0–M9 precisam estar completos, com evidências reproduzíveis, regressão sem falhas/skips, testes E2E reais, isolamento entre empresas, restauração validada e aceite humano. A CI #116 NÃO constitui homologação de 100%.

## Atualização operacional
A cada tarefa concluída: (1) verificar execução real e logs; (2) trocar somente o micro correspondente para `[x]`; (3) anexar commit/CI/SQL ou evidência; (4) atualizar a Issue #1; (5) só então marcar macro completo. Não assinalar tarefas por promessa ou mock.

## Reconciliação de evidência histórica M2 (2026-10-14)

Consulta a registros de conversas anteriores encontrou resultados de 05–06/10/2026: recuperação de senha com rejeição da antiga e acesso ao Dashboard com a nova; expiração real de JWT com HTTP 401/403 após tolerância. Essas duas tarefas passam a ter marca verde **com qualificação explícita de evidência manual histórica**, não como novos testes automatizados na CI #112. Convite real/aceitação e revogação em sessão ativa não foram comprovados nessa busca. Reexecutar na instância TEST isolada para homologação formal; não confundir a instância ou identidade histórica com as fixtures atuais sem verificar. Nenhuma alteração em autenticação ou banco foi realizada nesta reconciliação.

## Auditoria transversal de testes históricos — reconciliação de 2026-10-14

**Fontes:** registros das conversas anteriores (04–11/10), Issue #1 e relatórios/CI atuais. Esta seção impede repetir testes exploratórios já feitos, mas distingue o ambiente/escopo de cada prova. Nenhum teste foi reexecutado nesta auditoria.

### M3 — Caixa e vendas: micros históricos adicionais
- [x] **Concorrência de dois pagamentos**: relato de execução em TEST em 04/10: dois pagamentos simultâneos de $6 contra saldo $10, somente um aceito, saldo $4; estorno e fechamento sem diferença. **Não equivale** a corrida de venda versus fechamento de caixa; cenário distinto, portanto esse último continua pendente.
- [x] **Venda/caixa e estorno em transação reversível**: 11/10, venda de $10, caixa aberto com $100, pagamento Cash vinculado, cancelamento/estorno; despesa de $12,50 e estorno, todos sob ROLLBACK. Também existem testes persistentes de replay financeiro na CI.
- [x] **Navegação de 13 áreas e venda por UI**: registros de 07/10 indicam login OWNER, produto/tarefa, venda Cash, replay sem duplicidade, estorno e rejeição de quantidade zero, com seis eventos de auditoria. **Ambiente histórico não homologado como CI TEST atual**; não substituir por isso a jornada E2E integral P0.03.
- [ ] **Ainda falta** cobertura sistemática de todos os meios de pagamento, split, impostos, perfis, estados e concorrência determinística de venda vs. fechamento.

### M4 — Estoque: micros históricos adicionais
- [x] **Transferência de ida e retorno, recebimento e perda**: relatos de 07/10 em TEST; no relatório atual, ajuste/perda/transferência via SQL ROLLBACK também aprovados.
- [ ] **Ainda falta** Playwright completo de cadastro, ajuste, perda, transferência e concorrência persistente com usuários reais. O ajuste estava incompleto no checkpoint histórico de 07/10, embora SQL posterior tenha passado.

### M5 — Compras: micros históricos adicionais
- [x] **Recebimento parcial/total, pagamentos parciais e rejeição de valores excedentes**: 11/10 em testes transacionais com rollback; reforçado pelo script P0.05 TEST executado em 13/10.
- [x] **EMPLOYEE bloqueado de comprar/pagar em teste de permissão**: registro de 11/10, contexto SQL/role simulado; **não equivale** a login real EMPLOYEE.
- [ ] **Ainda falta** a jornada persistente completa pela interface e compensação automática em falha, mesmo que as regras de negócio já tenham sido validadas em SQL.

### M8 — Clientes, fornecedores, relatórios e pessoas: micros históricos adicionais
- [x] **Cliente cadastrado, editado e arquivado**: 07/10, quatro campos gravados e três eventos de auditoria, segundo registro anterior. **Teste histórico**; não afirmar que toda a suíte de validação/duplicidades/isolamento por perfil esteja completa.
- [x] **Fornecedor cadastrado, editado e excluído**: 07/10, segundo registro anterior. **Teste histórico**; cenários com histórico vinculado e restrições ainda pendentes.
- [x] **Filtros de relatórios**: 07/10, seis períodos, período personalizado e datas invertidas, segundo registro anterior. **Teste histórico**; conferência exaustiva dos totais e exportações ainda pendente.
- [x] **Restrições de salário por perfil**: 11/10, OWNER permitido e MANAGER/EMPLOYEE customizado negados, com rollback; não substitui matriz de login real e interface por perfis.
- [ ] **Ainda faltam** edição e duplicidades com todos os estados, permissões reais de MANAGER/EMPLOYEE, ponto, pausas, tarefas, filtros/exportações e testes de regressão abrangentes.

### M9 — Auditoria e recuperação: micros históricos adicionais
- [x] **Edge Function de escrita e restauração**: 06/10, HTTP 200, alteração lida e restauração confirmada; duas entradas de auditoria registradas, perfil permaneceu inativo. **Teste pontual de compensação, não restauração de backup**.
- [ ] **Ainda faltam** restauração integral de backup, teste de rollback Vercel, monitoração, onboarding, planos e aceite de piloto.

### Regra de deduplicação
Antes de criar qualquer novo teste, verificar se a mesma combinação **ambiente + usuário/role + interface/API/SQL + ação + caso + resultado** já possui evidência. Se existir, reutilizar a evidência e testar apenas a lacuna específica (por exemplo, não repetir recebimento SQL já aprovado quando falta recebimento Playwright real). Testes históricos de produção não autorizam novos acessos ou alterações na produção. Não marcar como concluído um macro com base em micros parciais.

## Continuação automatizada — integração local dos guards de autenticação

- [x] Guards previamente confirmados de papel desconhecido e refresh concorrente reintegrados ao HEAD atual da QA, junto dos testes de recuperação/compensação: **33/33 checks locais, zero falhas/skips**, build e sintaxe do runner persistente aprovados. Evidências e limites em [QA_CONTINUATION_BLOCKERS_20261014.md](./QA_CONTINUATION_BLOCKERS_20261014.md). Não representa login/recuperação reais ou nova CI.
- [ ] Recuperação real OWNER QA, autenticação/isolation com perfis independentes MANAGER/EMPLOYEE, revalidação autenticada dos grants `employees`/`sale_items` e compras persistentes continuam bloqueados até a evidência da CI/preflight corrente e as autorizações indicadas no relatório.
- [ ] Sete entradas npm de desenvolvimento/build persistem na nova auditoria; runtime reporta zero. Não há correção compatível oferecida pela simulação nesta execução.

## Entrega publicada — CI #116

- [x] Correções de autenticação, diagnóstico de recuperação e guards de compensação publicadas em `83bac13b201916a8504e44b827e369be437da3ce`; [CI #116](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38674528976) terminou Success com **10/10 jobs e 231/231 TAP**, zero falhas/skips. [Evidências](./QA_DELIVERY_CI_116.md).
- [x] Procedimento seguro QA A/B e preflight fail-closed preparados; CI #126 tentativa 2 comprovou o preflight autenticado no runner GitHub.
- [ ] Execução local/Windows do preflight, recuperação real OWNER QA e compras persistentes continuam pendentes nos gates documentados; compras não foram habilitadas.

## Candidato corrente — despesas Cash, recuperação e preflight (2026-10-15)

- [x] Validação local: **54/54 testes estáticos**, **4/4 browser de recuperação interceptado**, build Vite aprovado, zero falhas e zero skips; `App.jsx` e `src/App.jsx` idênticos. [Evidências e limites](./QA_DELIVERY_CASH_PREFLIGHT_20261015.md).
- [x] Preflight convertido em gate autenticado somente leitura antes de todos os jobs autenticados; valida OWNER A/B, fixtures positivas, isolamento e SELECT direto de `employees`/`sale_items`. O runner persistente P0.05 continua ausente da execução padrão.
- [x] **Histórico resolvido:** [CI #118, tentativa 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38752124497) identificou `FIXTURE_EMPLOYEE_B`; a fixture foi posteriormente criada por processo autorizado e a CI #126 tentativa 2 aprovou o preflight completo.
- [ ] Migração Cash e prova SQL não executadas. Recuperação SMTP/troca/login real, idempotência de despesa, schemas privados Supabase, MANAGER/EMPLOYEE e compra persistente permanecem abertos.

## Automação P0.03 publicada — CI #121

- [x] Código opt-in e regressões para idempotência de despesas, retry seguro e bloqueio de valores não finitos no caixa publicados em `6ab4f48774f2d4dff6b34cb9acc77e54e017898e`; nenhuma migração aplicada. [Evidência](./QA_DELIVERY_EXPENSE_REPLAY_CI_121_20261015.md).
- [x] [CI #121](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38759292268): build/static e API anônima passaram, total parcial **70/70**, zero falhas/skips nesses produtores.
- [x] **Bloqueio histórico resolvido:** o plano de fixture foi autorizado e executado externamente no TEST; CI #126 tentativa 2 liberou os oito jobs autenticados e o agregado completo.
- [ ] Aplicação das migrações P0.03, provas rollback e concorrência real exigem autorização específica no Supabase TEST. O rollout de despesas permanece desligado.

## Continuação automatizada — CI #124

- [x] Plano persistente e compensável da fixture `employees` B publicado em `189610f`; o usuário informou execução autorizada no TEST e a CI confirmou sua visibilidade/isolamento. [Procedimento](./QA_EMPLOYEE_B_FIXTURE_PLAN.md).
- [x] Export canônico somente leitura publicado em `45f67f2`; o primeiro resultado implantado foi recebido e revisado em 2026-10-17. Como ele trouxe apenas metadados parciais, foi preparado um segundo export para corpos, ACLs e matriz completa. [Resultado](./QA_REAL_CATALOG_REVIEW_20261017.md).
- [x] Gate de auditoria publicado em `9600dea`; validação local **78/78**, build PASS, runtime audit zero e full audit 7 conhecidos. [CI #124](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38761093906) aprovou **83/83 TAP parciais** (78 static + 5 API), zero falhas/skips nesses produtores.
- [x] Registro histórico: CI #124 bloqueou corretamente em `FIXTURE_EMPLOYEE_B`; o bloqueio foi resolvido e revalidado na CI #126 tentativa 2.
- [x] Preflight reordenado sem skips em `04ff861`/`f436a76`: [CI #126](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38762019506) aprovou **84/84 TAP parciais** e, antes de alcançar `FIXTURE_EMPLOYEE_B`, comprovou estoque A, isolamento da compra A→B e `sale_items` A/B direto/entre empresas.
- [x] Bloqueio `employees` B resolvido: preflight e oito jobs seguintes aprovados na CI #126 tentativa 2.

## Aprovação do preflight — CI #126 tentativa 2

- [x] Fixture Employee B ativa foi informada como criada e confirmada no TEST; esta sessão não executou a escrita.
- [x] [CI #126 tentativa 2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38762019506): preflight `PASS [OK]`, **12/12 jobs**, **274/274 PASS**, zero falhas e zero skips.
- [x] OWNER A/B, tenant, produtos, `employees`, `sale_items`, estoque e isolamento de compra aprovados no preflight somente leitura; os oito jobs autenticados foram liberados e aprovados.
- [ ] MANAGER/EMPLOYEE independentes, SMTP recovery/invite, catálogo implantado, migrações P0.03 e P0.05 persistente continuam pendentes. A aprovação OWNER A/B não cobre esses fluxos.
