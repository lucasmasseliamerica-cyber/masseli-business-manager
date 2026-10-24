# C1 — recuperação encerrada e plano de continuação (23/10/2026)

**Atualização de código em 24/10:** o [executor filho dedicado foi implementado e revisado](./QA_C1_CHILD_EXECUTOR_20261024.md),
com CI #225:1.001/1.001 PASS,9 jobs PASS / 4 persistentes BLOCKED. Este documento preserva o plano e
fechamento históricos de 23/10. As referências abaixo a executor ainda não implementado descrevem
esse estado histórico. Persistência continua sem autorização; pai original e A/B intocados.

Branch exclusiva `automation/nexalvo-qa-actions`; Supabase TEST `msinksoilkluooxenecy`.
**Não executar ajustes, transferências, compensações, sondagens, migrações ou operações financeiras.**
Checkpoint original e jornadas A/B preservados. Não repetir a recuperação já comprovada.

## Fechamento formal da recuperação

**CONCLUÍDO / PASS: recuperação autenticada somente leitura e diagnóstico local Windows.**
A fonte é a confirmação real agregada fornecida pelo proprietário nesta conversa; esta sessão
não observou diretamente o notebook ou recebeu checkpoint, credenciais ou relatórios integrais.
O commit remoto documental `1a47f7536335518955ec9e910681fbf0f093b93d`, que registrou o diagnóstico
local anterior, foi incorporado por fast-forward, preservando o histórico.

| Critério | Resultado real informado | Conclusão |
| --- | --- | --- |
| Baseline | baseline_unchanged=true; stage=0 | PASS: nenhuma movimentação iniciada |
| Quantidade | SOURCE 2,000 / TARGET 2,000 | PASS: posições originais preservadas |
| Custo médio | 0,1000 / 0,1000 | PASS: custos originais preservados |
| Histórico | movement_rows=0; audit_rows_added=0 | PASS: nenhuma operação ou auditoria nova |
| Checkpoint | recovery_checkpoint_unchanged=true; SHA-256 original preservado | PASS: não alterado; valor do hash mantido localmente |
| Runtime | C1_LOCAL_RUNTIME_READY_NOT_HOMOLOGATION | PASS: Vite/Chromium iniciam atualmente |
| Efeitos do diagnóstico | estoque 0/auditoria 0/checkpoint 0; full_homologation=false | PASS dentro do escopo de diagnóstico |
| Ciclo C1 de interface | Nenhum ajuste ou transferência executado | BLOCKED: não homologado |

[Evidência real sanitizada e proveniência](./evidence/stock-c1-readonly-closure-reported-20261023.json).
Não alegamos restauração: não existia alteração de estoque a compensar. A causa exata do erro
histórico C1_EXECUTION_UNCONFIRMED continua desconhecida e não precisa ser inventada para
fechar a recuperação. A execução original e o checkpoint permanecem preservados.

## Decisão: mesma fixture, continuação específica e pai imutável

A mesma fixture é **candidata condicional**, pois não houve operação, movimento ou perda.
A recuperação comprovada não autoriza uma nova gravação nem garante que o estado continuará
igual na próxima janela. A necessidade de outra fixture não decorre desta interrupção.

| Alternativa | Avaliação |
| --- | --- |
| Reexecutar o launcher normal | Proibido: deve continuar bloqueando qualquer checkpoint anterior |
| Apagar, mover, editar ou marcar o checkpoint como concluído | Proibido: perderia a proteção contra replay e a evidência original |
| Criar nova fixture imediatamente | Desnecessário pela evidência atual e não autorizado; não serve para contornar resultado desconhecido |
| Continuação específica, com filho novo vinculado ao pai | Plano preferido, condicionado aos gates abaixo; executor ainda não implementado |

Foi implementado `qa/stock-c1-continuation-plan.mjs`: avaliação pura, sem I/O, Auth, browser,
ambiente, modo CLI, escrita ou acesso ao checkpoint original. Ela recebe bytes/snapshot já
obtidos pelo chamador, exige hash original e envelope íntegros, PROBES_CONFIRMED, zero pending,
zero operações, duas sondagens B/anon DENIED, oito gates históricos, contratos atuais e baseline
completa. O snapshot deve ter no máximo 5min, o catálogo no máximo 24h. Toda divergência bloqueia.

O resultado máximo é `READY_FOR_REVIEW`, nunca PASS de preflight ou autorização. Flags de
execução, autorização e homologação permanecem false; o relatório não inclui UUIDs, payloads,
runId, caminhos, bytes ou identidades. **O planejador não foi executado com o checkpoint real**,
que não foi disponibilizado nesta sessão. Os testes usam somente dados sintéticos.

## Gates obrigatórios antes de propor execução

1. **Executor específico preparado e revisado:** modo separado do normal, negado por padrão,
   autorização nova, testes Windows/Node/browser e CI do SHA exato. `--continue` e `--resume`
   continuam rejeitados hoje; não existe comando persistente liberado neste pacote.
2. **Integridade local:** hash original confiável, ACL privada e caminho literal sem links;
   pai lido somente; nunca alterar suas permissões ou conteúdo para ultrapassar um bloqueio.
3. **Identidades atuais:** novas sessões temporárias OWNER A/B existentes, empresas/perfis
   ativos, permissões exigidas e isolamento de leitura. Não reutilizar senha/token no chat
   ou credencial administrativa no lugar de usuário.
4. **Segurança atual:** catálogo vigente, precisão e auditoria fixadas, funções/grants/ACL/RLS
   pertinentes revisados. O catálogo de estoque sozinho não comprova todas as políticas nem
   ausência de mudanças desde as sondagens. Sem essa comprovação, bloquear; não repetir as
   duas sondagens já confirmadas ou ampliar privilégios para obter PASS.
5. **Baseline atual completa:** comparar com o pai imediatamente antes da reserva, após
   estabilização e antes do primeiro envio: quantidades 2/2, custos 0,1/0,1, mesmos metadados,
   receita/compras/perdas/movimentos ausentes e auditorias anteriores intactas.
6. **Janela exclusiva nova:** confirmação operacional independente, mutex/lock local e prazo
   máximo 30min, incluindo prompts. O atestado não é lock distribuído; nenhuma execução em
   outro notebook/processo pode compartilhar a fixture. Não renovar a janela automaticamente.
7. **Um único filho por pai:** registro privado criado com exclusividade antes do primeiro
   envio, ligado ao hash do pai; rejeitar qualquer filho/reserva anterior, pendente ou não.
   Reinício não pode escolher o pai para começar outro ciclo. Falha na reserva exige revisão,
   sem apagar registro para tentar de novo. A exclusividade local não prova exclusão entre máquinas.
8. **Autorização específica recebida:** nomear ambiente, fixture, SHA, orçamento abaixo,
   checkpoint pai/filho e regra de parada. Autorizações anteriores e CI verde não a substituem.

## Orçamento proposto, sem execução neste momento

Usar novo runId exclusivo no filho, sem reutilizar notas/IDs de execução anterior. Registrar
intenção durável antes de cada envio e reconciliar resposta com leitura independente, autor,
empresa, valores, vínculos, cardinalidade e histórico antes de liberar o passo seguinte.

| Passo | Operação única | SOURCE / TARGET após confirmação |
| --- | --- | --- |
| 1 | Ajuste de contagem:2,000 →2,125 | 2,125 /2,000 |
| 2 | Transferência SOURCE→TARGET:0,500 | 1,625 /2,500 |
| 3 | Transferência TARGET→SOURCE:0,500 | 2,125 /2,000 |
| 4 | Contagem final SOURCE:2,125 →2,000 | 2,000 /2,000 |

Limites: **quatro RPCs de estoque, seis movimentos e quatro auditorias**, média 0,1000 nas duas
posições, **zero sondagens repetidas**, zero perdas, zero vendas/compras/caixa/financeiro,
zero criação de fixtures/usuários/migrações. Os passos 3/4 são parte do ciclo previsto; não são
permissão para compensar automaticamente uma falha desconhecida.

Não há promessa de idempotência de servidor nas RPCs atuais. A proteção é limitar os envios,
serializar, gravar intenção antes de encaminhar e **nunca reenviar resultado desconhecido**.
Timeout, queda, resposta truncada, divergência, duplicidade, auditoria ausente ou expiração da
janela interrompem o ciclo. Preservar pai e filho; reconciliar somente leitura do filho.
Nenhum replay, novo filho, nova fixture ou compensação automática. Eventual correção exige
resultado conhecido, plano exato e autorização separada.

Aceite futuro:18/18 critérios C1 reais, seis movimentos corretos vinculados, quatro auditorias,
quantidade/custo originais, histórico preservado, pai inalterado e filho reconciliado. Não
promover critérios de UI/estoque com base no planejador, mocks ou CI.

## Procedimento e autorização seguinte

**Agora:** nenhuma nova ação manual é necessária para fechar a recuperação; ela foi comprovada.
Preservar o checkpoint original no local privado. Não repetir os comandos históricos de
recuperação, preflight ou execução normal apenas para gerar outra evidência.

**Próximo lote seguro de código:** implementar/revisar o executor filho conforme os oito gates,
com regressões e CI. Isso não exige alterar o TEST. A execução permanecerá desativada.

**Antes de executar:** apresentar o SHA do executor filho aprovado e o comando dedicado para
conferência. Só então solicitar autorização expressa para exatamente o orçamento acima,
na fixture C1 já existente e na janela exclusiva confirmada. Nenhuma autorização de escrita
está sendo presumida ou solicitada antes de esse executor existir.

## Avanço P0 independente: precisão no recebimento de compras

A revisão encontrou quantidades de estoque arredondadas como dinheiro. A implementação
anterior transformava 0,125 em 0,13 e 0,004 em 0 ao receber; o detalhe podia exibir saldo positivo
como totalmente recebido. Reproduzido localmente, sem banco.

Foram corrigidos formulário, saldo restante, envio e recebimento local para três casas;
quantidades com mais de três casas e valores positivos que arredondariam para zero são rejeitados antes do RPC. A reversão local de compra
mantém essa precisão e continua sem duplicar efeito no replay do mesmo ID. Regras monetárias
e custos foram preservadas, assim como o arredondamento padrão dos outros chamadores.

As definições históricas aprovadas de criação/recebimento usam numeric e não arredondam
quantidades para duas casas. A escala efetiva das colunas implantadas ainda deve ser conferida
por leitura e a compra real depende de autorização própria. Browser interceptado não homologa
compras persistentes. Nenhum pedido, recebimento, pagamento ou reversão foi enviado ao TEST.

## Próximas P0 independentes e bloqueios reais

- D/Compras: conferir escala efetiva de qty_ordered/received_qty por metadados somente leitura
  (format_type com atttypmod e numeric_precision/numeric_scale) e fingerprints atuais das RPCs.
  O export histórico usa numeric, mas não comprova a escala atual. Não aplicar migração por hipótese.
- O executor persistente antigo de compras continua desativado: snapshot de quantidade sozinho
  não prova custo médio restaurado; precisa de fixtures próprias, intenção durável, recuperação
  somente leitura e tratamento de resultado desconhecido antes de qualquer autorização.
- E/Financeiro: permanecem gates separados para finite_guard, expense_cash_normalization e
  expense_idempotency, nessa dependência. Exigem baseline/ACLs e rollback exatos; nenhuma
  migração, abertura de caixa, despesa ou compensação foi executada aqui.
- Perfis reais e demais jornadas operacionais permanecem nos gates da matriz; esta correção
  não cria contas, convites, claims ou permissões e não homologa MANAGER/EMPLOYEE por mocks.

## Regressões, CI e cobertura

Código publicado: **c26878a625d004025b3cd579dc891ae5af588af0**, após `7f4b28ffed6bbb52b6bb1c568046d9b2bbbaf329`.
[CI #217](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39964380706): **855/855 PASS**, zero FAIL/SKIP nos testes executados; **9 jobs PASS e 4 persistentes BLOCKED pelo gate**.
Windows PS5.1/7, browser, build, preflight autenticado geral e agregador aprovados.
A contagem foi conferida na anotação real do job120454005768; não foi inferida dos resultados locais.
[Evidência final CI217](./evidence/stock-c1-closure-ci-217-20261023.json).
A CI216 intermediária, anterior ao guard de quantidade positiva que arredonda para zero, também
aprovou855/855. Ela foi preservada como histórico e não substitui a CI217 do SHA final.
[Evidência intermediária CI216](./evidence/stock-c1-closure-ci-216-20261023.json).
Local: **598/598 regressões em49 módulos +31/31 browser**, zero FAIL/SKIP; build e parse de duas Edge Functions PASS.
Os 24 casos do planejador, 20 de compras e 2 novos browsers são subconjuntos desses totais, não somar novamente.
Auditoria npm completa válida: zero runtime; sete alertas build/dev conhecidos (cinco altos/dois moderados), sem atualização incompatível.
[Evidência de código/testes](./evidence/stock-c1-continuation-purchase-precision-20261023.json).

A primeira execução dos novos browsers encontrou um locator que passava a apontar ao modal
pai após o fechamento do filho. O seletor foi fixado pelo nome acessível do recebimento;
a aplicação foi revalidada. A revisão independente também identificou o caso positivo
`1e-12` que arredondava para zero; foi bloqueado antes de qualquer RPC e incluído nos dois
cenários de navegador. A regressão completa e o build foram repetidos após essa mudança.
Macro preservada: **16/60 (26,67%)**, 15 PENDENTES e29 BLOQUEADOS; nenhum novo critério macro
promovido por fechamento de segurança ou testes simulados. A/B preservadas; B 17/17 PASS.
