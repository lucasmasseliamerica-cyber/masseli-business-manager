# C2/perdas — preparação somente leitura (02/11/2026)

> Continuação: [pacote do executor e plano exato de provisionamento](./QA_C2_EXECUTOR_PACKAGE_20261102.md).
> O texto abaixo é a primeira preparação; a implementação posterior não autoriza execução/provisionamento.

**Preparação concluída; execução BLOCKED. Nenhuma fixture elegível selecionada.**
Branch automation/nexalvo-qa-actions, HEAD local/remoto inicial c67d2383fd8cbf73761772b58df1b00196383e7c.
Somente Supabase TEST msinksoilkluooxenecy. Cobertura permanece 16/60 (26,67%),
15 pendentes/29 bloqueados; C1 real PASS 18/18 e 8/8 gates preservado.
[Fechamento C1](./QA_C1_CHILD_REAL_CLOSURE_20261102.md) e
[evidência desta preparação](./evidence/stock-c2-readonly-preparation-20261102.json).

## Evidência e alcance

Leituras reais pelo conector com project_id explícito TEST em 02/11, entre 20:14:33 e
20:15:38 UTC (15:14:33–15:15:38 America/New_York). Contexto postgres/postgres:
metadados e triagem administrativa, sem representar autenticação OWNER A/B nem homologar RLS por sessão.
Oito chamadas SQL: sete bem-sucedidas e uma rejeitada por sintaxe ORDER BY após UNION.
A consulta rejeitada não executou gravação; corrigida com subconsulta. Consultas com múltiplos
SELECTs retornaram apenas o último resultado no conector; totais foram obtidos em SELECT JSON único.
Nenhuma RPC de negócio invocada, escrita, fixture criada, migração ou credencial obtida.
Corpos brutos de funções não foram versionados.

C1 não foi repetida: a triagem leu somente posições/histórico para excluir sua fixture de C2.
Nenhum launcher, checkpoint, reserva ou recuperação C1 foi aberto/alterado.
App.jsx e src/App.jsx permanecem idênticos; nenhum código do aplicativo foi modificado.

## Triagem de fixture

Tenant QA A: d627563b-2ce4-491d-8cf6-141ef28d0f63. Total atual: cinco itens,
todos com QA no nome; zero nomes C2/WASTE/PERDA. Não se conclui ausência em outros tenants.
Triagem dos cinco:

| Item | Ativo | Receitas | Linhas compra | Movimentos | Perdas | Decisão |
| --- | --- | --- | --- | --- | --- | --- |
| QA FIX REGRESSION 20261007 | não | 1 | 0 | 4 | 0 | Excluir: inativo, fornecedor/vínculo/histórico |
| QA INITIAL ITEM | não | 0 | 103 | 26 | 1 | Excluir: inativo e histórico |
| QA Polpa (nome com caracteres corrompidos na origem) | sim | 2 | 39 | 298 | 26 | Excluir: dependências e histórico |
| ZZ_QA_SALE_B_INGREDIENT_20261021 | sim | 1 | 0 | 2 | 0 | Preservar B; vínculo com receita |
| ZZ_QA_STOCK_C_20261022_EXCLUSIVE | sim | 0 | 0 | 6 | 0 | Preservar C1 encerrada; sem autorização C2 |

C1 tem duas posições 2,000/custo 0,1000 e seis movimentos, zero perdas.
Restaurar quantidade em C1 não a torna fixture sem uso: validateStockFixture
(qa/stock-journey-core.mjs) exige histórico/dependências vazios e não autoriza perdas.
Sua reserva consumida não pode ser apagada nem usada para um segundo filho.

Fixture futura C2: ID ainda indefinido; deve ser dedicada e já elegível, ativa,
sem fornecedor, receita, compra ou histórico, local ativo da mesma empresa, posição existente,
quantidade/custo finitos, quantidade com até três e custo com quatro casas, custo positivo.
Planejar uma única posição 2,000 a 0,1000 é um **alvo hipotético**, não saldo C2 observado.
Nenhuma criação está autorizada. Se não houver fixture elegível, manter BLOCKED;
provisionamento separado dependerá de autorização específica, fora deste plano.
Reutilização excepcional de C1 exigiria prova de elegibilidade específica para C2, novo baseline
que aceite o histórico C1 e autorização expressa; não é a opção selecionada neste plano.

## Contratos implantados e revisão

- fn_record_waste(uuid,uuid,uuid,numeric,text,text): SECURITY DEFINER, owner postgres,
  search_path=public; verifica empresa por current_business_id, manageInventory, existência
  item/local na empresa, quantidade finita e positiva. Bloqueia posição FOR UPDATE e exige saldo.
  Não exige ativo no backend: esse requisito deve ser imposto também pelo gate C2.
- Chama internamente fn_record_inventory_movement com tipo WASTE, delta negativo, custo médio
  atual, allow_negative=false, referências venda/compra/related nulas.
- Movimento rejeita quantidade não representável em três casas, atualiza a posição e insere
  inventory_transactions. Perda e movimento estão na mesma chamada/transação; não existe
  parâmetro request_id/idempotência no contrato observado.
- Em WASTE, avg_cost_per_unit, last_purchase_cost e last_purchase_date permanecem inalterados;
  qty cai e updated_at muda. Retorna uma waste_transactions ligada ao movimento pelo ID.
- waste.qty e saldo/delta numeric(12,3); custo médio/unitário numeric(12,4);
  waste.cost numeric(10,2), movimento.total_cost numeric(12,2).
- Custo da perda = round(q * custo_médio,2); movimento.total_cost = round(-q * custo_médio,2).
  Não se deve comparar valor de estoque não arredondado com custo contábil sem reconhecer arredondamento.
- EXECUTE authenticated permitido para perda/leitor/auditoria, anon negado.
  Movimento interno não executável por authenticated/anon. Leitor seguro STABLE, path vazio,
  filtra empresa e oculta cost sem manageRecipesAndCosts.
- As quatro tabelas inventory_stock/inventory_transactions/waste_transactions/audit_logs
  têm RLS e não concedem INSERT/DELETE direto a authenticated; SELECT de tabela anon negado.
  Policies observadas são SELECT por empresa; auditoria exige manageUsers/manageSettings/viewReports.
  A análise não substitui teste HTTP por usuários e não cobre todo o banco.
- Zero triggers de usuário nas quatro tabelas consultadas; FKs e constraints de finitude/
  não negatividade observadas. Não há efeito financeiro direto nos corpos revisados.
  Triggers internos/FKs e relatórios não equivalem a efeitos de caixa.
- Ressalva preservada: funções definer com search_path=public exigem revisão de CREATE/schema,
  helpers de tenant/permissão e grants atuais no preflight futuro. Sem aprovação global por este recorte.
  Não trocar hashes, ACLs ou search_path para obter PASS.

| Função | MD5 definição implantada |
| --- | --- |
| fn_record_waste | 185a854265f9f345b44c96ce31aa3485 |
| fn_record_inventory_movement | 27bb16e1ab20acc78ef5bb2f25eb9c04 |
| fn_read_waste_transactions_secure | 27054c6cd813e97f4416d3445fdfa5d2 |
| fn_write_audit | ae296834d6afe1b9cfafb6da668d5c0e |

Os hashes identificam a leitura; não são aprovação automática de um executor C2 ainda inexistente.
A documentação Supabase/changelog foi consultada; não houve implementação de recurso novo da plataforma.

## Plano futuro e orçamento exato proposto — NÃO autorizado

Uma submissão de perda pela UI, razão Other e nota com identificador único C2 aprovado,
quantidade 0,125. Usar apenas ID de fixture e baseline definidos numa autorização própria.
Não existe comando persistente preparado ou launcher C2 liberado.

| Medida | Limite futuro proposto |
| --- | --- |
| RPC de estoque externa fn_record_waste | 1 |
| RPC fn_write_audit | 1 |
| Chamadas internas de movimento | 1, dentro da RPC perda; não é segunda RPC HTTP |
| Novas waste_transactions | 1 |
| Novas inventory_transactions WASTE | 1 |
| Novas audit_logs | 1, Client: Waste Recorded |
| Ajustes/reposições/transferências/compensações | 0 |
| Sondagens de escrita, replay, tentativas de falha reais | 0 |
| Fixtures/usuários/migrações/apagamentos | 0 |

Máximo duas RPCs de escrita encaminhadas, sem retries de nenhuma delas. Leituras autenticadas
e renovação de sessão não são RPCs de estoque/auditoria, mas devem constar no relatório.
O teste persistente não deve disparar reconciliação de alertas ou outro endpoint mutante:
a UI possui caminhos alheios ao estoque; futuro executor precisa de allowlist que bloqueie
toda escrita fora das duas chamadas aprovadas. Testes de fronteira e fault injection serão isolados,
sem enviar probes ao TEST.

Para baseline hipotético Q0=2,000/C0=0,1000:
Qfinal=1,875, Cfinal=0,1000; perda positiva 0,125, custo 0,01;
movimento delta -0,125, custo total -0,01, custo anterior/novo 0,1000.
Valor de estoque não arredondado cai 0,0125. Não há promessa de restauração do saldo.
Qualquer outro baseline exige cálculo e aprovação próprios antes da execução.

Histórico residual a aceitar explicitamente: uma perda e um movimento WASTE permanentes,
uma auditoria separada, redução permanente do saldo e updated_at alterado.
Dashboard e relatórios remotos usam movimentos Waste e abs(totalCost); custo de perdas do
período aumenta 0,01 neste exemplo, mesmo sem saída de caixa. Repor saldo não apagaria esse custo
nem os registros. Nenhuma limpeza/reversão foi planejada.

## Resultado incerto e auditoria separada

App.jsx, ramo remoto waste: valida finitude/positividade/precisão/saldo, chama fn_record_waste,
recarrega estoque e só depois solicita logAudit. A auditoria não é atômica com a perda.
Falha de reload após RPC confirmada gera rpcSucceeded; pode deixar perda sem auditoria.
logAudit captura falhas e retorna false; o chamador não exige esse retorno para mostrar sucesso.
Toast/modal fechado não comprova auditoria nem PASS.

Antes de qualquer envio futuro, executor dedicado deve persistir intenção durável fora de C1,
com SHA do código, fixture/local, payload, IDs/snapshot anteriores, orçamento consumido e prazo.
Reserva própria única C2, sem copiar pai/filho C1. Sem executor revisto/testado, manter BLOCKED.

Timeout, 408/5xx, JSON truncado, perda de transporte, recibo ausente, falha ao salvar recibo,
reload falho ou cardinalidade divergente: parar imediatamente, bloquear novas escritas,
preservar intenção/recibos/reserva. Não reenviar perda ou auditoria, nem ajustar para restaurar.
Conferir somente por leitura novos IDs, vínculo waste→movimento, delta/custo, autor/tenant,
timestamps e payload contra baseline. Nota única ajuda correlação; não oferece idempotência.
Ausência de linha em uma leitura não prova rollback de pedido incerto nem libera reenvio.
Mudança inexplicada/concorrrente, parcial ou duplicada mantém BLOCKED e exige análise específica.
Mesmo se leitura confirmar commit após timeout, não continuar automaticamente para auditoria.
Auditoria ausente/ambígua não autoriza nova chamada; recuperação eventual exige decisão própria.

O latch do navegador cobre falhas incertas de RPC de estoque na sessão; reload pode perdê-lo.
fn_write_audit é tratado como harmless pelo wrapper, mas é gravação real: executor C2 deve contar
e proteger a auditoria por conta própria. Não confiar no latch/UI como proteção durável.

## Gates antes da execução futura

1. QA limpa/sincronizada; SHA C2 revisado e testes isolados aprovados, sem tocar main/produção.
2. Fixture C2 identificada e elegível por leitura, baseline completo e sem uso concorrente;
   C1/B e suas evidências preservadas.
3. Captura/revisão atuais de funções/helpers/ACL/RLS/colunas/triggers e precisão; drift bloqueia.
   Estes dados são preparação pontual; revalidar antes da execução, sem alterar timestamps.
4. Sessões OWNER A/B existentes por campos ocultos, tenant/permissões efetivos, leitura isolada;
   custos visíveis só ao perfil correto. Sem service_role como QA.
5. Preflight C2 somente leitura e allowlist de rede; nunca reutilizar o launcher C1.
6. Executor C2 com intenção durável/reserva própria, limite 1+1, sem replay, recuperação só leitura,
   testes isolados de falhas e de concorrência local antes de qualquer envio real.
7. Autorização C2 específica incluindo IDs, SHA, q=0,125, saldo final reduzido, custos e histórico
   residual permanentes, máximo 1 RPC perda +1 auditoria, zero compensação/probes.
8. Nova confirmação operacional de janela exclusiva de 20 minutos apenas quando tudo estiver pronto.
   Nada da autorização ou janela antigas C1 se estende a este escopo.

## Critérios de aceitação futuros — todos ainda pendentes

| Critério | Evidência exigida |
| --- | --- |
| Identidade, catálogo e elegibilidade | Gates atuais e baseline sanitizado verificáveis |
| UI e payload | Item/local corretos; Other e nota única; 0,125 sem arredondar a duas casas |
| Uma perda | Exatamente um novo ID, qty/unidade/razão/notas/autor/empresa corretos |
| Um movimento | Exatamente um novo WASTE, vínculo inequívoco, delta e custos previstos |
| Persistência | Reload/relogin só leitura confirma os mesmos IDs e saldo, sem nova escrita |
| Custo/estoque | Q0-0,125; custo médio e último custo/data de compra preservados; updated_at coerente |
| Auditoria | Uma Client: Waste Recorded, autor/tenant/detalhes corretos e ID novo |
| Históricos/relatórios | Baseline preservado mais resíduos aceitos; incremento de perda no período correto |
| Isolamento | Leituras OWNER B/anon não expõem fixture/custos; zero probes mutantes |
| Escopo/orçamento | 1 RPC perda +1 auditoria, 1 movimento/1 perda/1 auditoria; demais escritas zero |
| Integridade | Reserva/intenções/recibos C2 íntegros e C1 intocada; resultado incerto=false |
| Aprovação | Evidências reais completas e aceite dos resíduos; sem declarar estoque/app 100% |

Nenhum check de C2 promovido. CRUD completo e concorrência real permanecem pendentes.
