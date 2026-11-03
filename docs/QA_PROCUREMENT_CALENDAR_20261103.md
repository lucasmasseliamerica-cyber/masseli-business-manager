# Continuidade dirigida — alertas de compras (03/11/2026)

Base local/remota 1bb049d274ba2a51acd125c5df0328ab66ae0d3c, QA limpa, sem AGENTS.md encontrado
no repositório. Branch exclusiva automation/nexalvo-qa-actions. Nenhuma conexão TEST,
prompt, segredo, seed, perda, migração, deploy ou cleanup neste lote.

## Triagem reaproveitada

**A — aprovado:** A/fotos PASS; B #1253 17/17; C1 18/18 e 8/8. Evidências, checkpoints,
reservas e históricos preservados; ciclos e sondagens não repetidos.

**B — preparado, aguardando gate:** C2 (F01/F02/F05 corrigidos; F03/F04 documentados),
staff-user-service, idempotência de compras e pacotes financeiros/caixa. Faltam autorizações,
aplicações/fixtures e homologações reais descritas na matriz. Reutilizados sem reimplementar.
Prova nativa C2 anterior é histórica; este lote não a renova nem a prolonga.

**C — novo executável escolhido:** atraso de compras calculado como blocos de 24h desde
meia-noite UTC. A matriz mantém fuso/datas de fronteira pendentes; a entrega anterior de
compras cobre validação de formulário/resultado incerto, sem teste de evaluateProcurementAlerts.
Busca dirigida não encontrou cobertura desse avaliador. Escolhida uma entrega concreta,
sem ampliar para auditoria geral ou três tarefas artificiais.

## Reprodução e correção

Nova regressão extrai as funções reais das duas cópias do aplicativo, sem rede ou persistência.
Antes: 1/7 PASS (sincronia de arquivos), 6/7 FAIL. Exemplos:

- Nova York, esperado 02/11 e relógio 03/11 04:59:59Z: ainda dia 02 local, mas alerta aparecia.
- Fuso UTC+14, dia seguinte local: atraso não aparecia porque ainda não decorreram 24h UTC.
- Data inexistente 30/02 era normalizada para março e produzia alerta.

evaluateProcurementAlerts agora valida a data, obtém o dia civil no fuso já configurado e
compara índices de calendário. Não conta duração de dias de 23/25h como dias de 24h. Estados
terminais, tipo do alerta parcial e limiar crítico de três dias são preservados. As duas cópias
App.jsx/src/App.jsx recebem a mesma edição localizada; não há alteração de RPC/contrato.

## Verificação proporcional

- 7/7 novas regressões: fronteira local, DST, fuso positivo, limiar crítico, data inválida,
  devido hoje/futuro, estados terminais e sincronia das duas cópias.
- 22 testes existentes de compras/fornecedores e precisão de relatórios: repetidos como
  checagem focada da área alterada e do uso dos helpers existentes. Total 29/29 PASS.
- Build executado depois da correção final; CI isolada Linux/Windows registrada no fechamento.
- C2/A/B/C1 e baseline geral não reexecutados. Dados sintéticos comprovam o cálculo,
  não homologação financeira ou persistência real. Matriz permanece 16/60 (26,67%).

CI usa o mecanismo já documentado de commit [c2-offline], que mantém o build-dependency
do workflow legado TEST ignorado e impede seus jobs dependentes. Novo workflow operacional
executa somente estes 29 testes e build, sem environment/secrets TEST. Não altera o workflow
legado nem o workflow C2, evitando repetição de suas suítes aprovadas.

## Vínculo futuro e gates

Código C2 validado histórico 56baf2dd75c3581f8d554f7b58477405e6a6307b preservado, assim como
o SHA histórico do executor de perda da7c9de270a4535245751d2297eeaf6e7c63a270. O novo HEAD
tem alteração App.jsx/src/App.jsx; portanto a prova nativa anterior, vinculada a 1c8477d,
não satisfaz o gate de diferenças somente docs/ para futuro seed. Não alterar esse guard.
Antes de qualquer futura execução C2: revisão dirigida do diff/impacto e novo SHA validado,
mais prova nativa atual **somente quando houver operação autorizada que dependa dela**.
Seed sem movimento inicial exige aprovação específica/janela; perda exige outra autorização,
fixture confirmada, revisão de segurança atual e preflight autenticado PASS. Nenhum desses
gates é substituído pela CI de calendário. SQLs e arquivos de execução C2 não foram editados.

Próximos três passos concretos: (1) revisar este diff/CI e preservar a correção publicada;
(2) quando houver autorização de uma frente remota, retomar seu pacote/gates já preparados;
(3) homologar UI real dessa frente sob autorização própria, sem repetir A/B/C1 ou promover
critérios amplos apenas pelos testes isolados. Sessão encerrada não implica execução em segundo plano.

## Fechamento publicado

Código: 9245686f7f1e8f07ff5592316060962152a5f10e.
[CI operacional offline PASS](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41583825352): 29/29 Linux e 29/29 Windows, zero falhas/skips, builds PASS.
[Workflow legado TEST ignorado](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41583825095).
Build local final PASS; verificação de segredos do diff e escopo preservado PASS.
Este fechamento acrescenta somente documentação/evidência após o código testado.
