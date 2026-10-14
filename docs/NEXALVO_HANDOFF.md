# NEXALVO — Continuidade entre conversas (QA/TEST)

## Propósito
Este arquivo é o ponto de entrada para retomar o NEXALVO em uma nova conversa do ChatGPT. Não é um retrato imutável nem prova de homologação: **sempre consultar os dados atuais no GitHub**.

## Identificação e limites obrigatórios
- Repositório: `lucasmasseliamerica-cyber/masseli-business-manager`.
- Branch permitida para alterações: `automation/nexalvo-qa-actions`.
- Supabase autorizado: TEST `msinksoilkluooxenecy` exclusivamente.
- **Proibido** acessar ou modificar Supabase produção `ebhlfghbdfqgrgmtzpti`; modificar `main`; publicar deploy; executar migrações destrutivas; criar custos; expor segredos no chat ou repositório.
- Não alterar usuários reais, permissões ou dados fora do TEST; preferir verificações reversíveis e fixtures isoladas.
- Não declarar 100% homologado antes de testes completos e homologação humana.

## Fontes de verdade — ordem de leitura
1. [Issue #1 — fila P0 → P1 → P2](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/issues/1): ler corpo e comentários recentes; não presumir que checkboxes estejam atualizados.
2. [Relatório P0.01](./P0_01_PERMISSIONS_20261012.md): ler versão atual na branch de QA.
3. [GitHub Actions](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions): identificar a **última execução real na branch de QA**, seu commit, jobs, logs, testes e skips. Não confundir última execução com última execução aprovada.
4. Histórico de commits da branch de QA, testes em `qa/` e workflows em `.github/workflows/`.
5. Este arquivo: protocolo e ponteiro; nunca substitui evidência atual.

## Protocolo de retomada
1. Confirmar acesso ao repositório e à branch autorizada; verificar SHA atual.
2. Ler Issue #1, comentários recentes, relatório P0.01 e evidências da última execução do Actions.
3. Produzir uma tabela: concluído e comprovado / falhou / bloqueado / não testado, com links verificáveis.
4. Selecionar a primeira tarefa P0 viável e segura; em bloqueios de credenciais ou decisões, avançar em outras verificações seguras sem simular aprovação.
5. Implementar mudanças pequenas **somente** na branch autorizada; executar verificações e regressão sem skips; registrar commit, run, resultados e pendências no relatório apropriado.
6. Para cada resultado, indicar se foi efetivamente executado nesta sessão ou apenas lido de histórico.
7. Nunca confundir testes simulados de JWT/SQL com sessões reais MANAGER/EMPLOYEE.

## Pendências estruturais conhecidas (revalidar na retomada)
- P0.1: login e autorização reais MANAGER/EMPLOYEE com segredos exclusivos de TEST.
- P0.2: convites, recuperação, expiração e revogação efetivas.
- P0.3–P0.6: jornadas completas de vendas/caixa, estoque, compras e interrupções reais de rede.
- P0.7: isolamento de arquivos/imagens multiempresa.
- P1/P2: seguir a fila da Issue #1.
- Falhas de testes de compras (custo negativo/desconto excessivo) foram relatadas em conversa anterior; verificar novamente o run mais recente antes de tratá-las como atuais.

## Prompt curto para uma conversa nova
> Continue o NEXALVO lendo `docs/NEXALVO_HANDOFF.md` na branch `automation/nexalvo-qa-actions`, Issue #1, `docs/P0_01_PERMISSIONS_20261012.md` e a última execução do GitHub Actions. Trabalhe P0 → P1 → P2 somente na branch de QA e Supabase TEST. Respeite integralmente as restrições do handoff. Execute apenas tarefas seguras, registre commits/runs e informe bloqueios reais, sem declarar homologação prematura.

## Manutenção
Atualizar os relatórios de QA e a Issue #1 a cada unidade de trabalho. Atualizar este arquivo apenas quando mudarem o protocolo, as fontes ou os bloqueios estruturais; não gravar tokens, senhas, chaves, PII ou logs sensíveis.
