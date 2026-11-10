# Staff TEST — obtenção das sessões MANAGER e EMPLOYEE

**Janela 10/11/2026, 14:58–15:43 UTC (09:58–10:43 em Nova York): sem admissão.** A conferência local mostrou `NO_STORED_SESSION` no perfil consultado; o operador confirmou que não dispõe de outros perfis MANAGER/EMPLOYEE. Isso não é uma revogação nem prova de ausência de sessões no servidor. O diário mostrou zero envios Auth MANAGER/EMPLOYEE, zero comandos/reservas de negócio e nenhum handoff. Não é preciso recuperar ou alterar perfis.

A readmissão separada OWNER A já passou e consumiu sua autorização de um login. O formulário em execução conserva essa sessão apenas em memória, até a margem de encerramento antes de 15:45:46 UTC. Ele aceita tokens MANAGER/EMPLOYEE já disponíveis, não senhas. O token OWNER A retido não pode ser lido por outro processo pela interface atual. O novo fluxo exige uma sessão OWNER A obtida legitimamente e acessível no mesmo processo autorizado. Não exportar a sessão do formulário em execução nem presumir que sobreviverá ao encerramento. Se ela deixar de estar utilizável, confirmar primeiro outra sessão legítima; qualquer novo login OWNER A ficaria fora deste pedido.

## Escopo adicional mínimo

| Conta no TEST `msinksoilkluooxenecy` | Leitura administrativa | Alteração Auth |
| --- | --- | --- |
| MANAGER — `96042557-c717-4750-9dd1-88b36958c6d1` | Até um GET por UUID em `/auth/v1/admin/users/{id}` | Até um POST em `/auth/v1/token?grant_type=password` |
| EMPLOYEE — `0e03a482-5b3c-4225-baf7-4ae1ab7e9e58` | Até um GET por UUID em `/auth/v1/admin/users/{id}` | Até um POST em `/auth/v1/token?grant_type=password` |

As leituras identificam os e-mails confirmados somente em memória. Os logins usam as **senhas atuais já recuperadas**, em campos mascarados, e a chave pública TEST. Podem criar uma sessão e registros Auth por conta. A chave administrativa existente é usada apenas nos dois GETs. Os GETs de identidade, com a sessão de cada usuário, continuam dentro do orçamento de leitura do lote já autorizado: OWNER A atual antes dos logins e um GET por M/E somente após sucesso, sem duplicar a leitura no executor.

## Sequência preparada

1. Vincular o novo operador local aos dois UUIDs, à autorização específica de M/E e a uma janela exclusiva válida. Revalidar os gates de negócio já definidos: projeto/TLS, manifesto/adendo Edge v6, estado inicial, ausência de outro executor e orçamento intacto. Antes de qualquer envio M/E, exigir OWNER A autenticada no TEST e com validade até o fim da janela mais 30 segundos.
2. Reusar os campos mascarados e o transporte nativo aprovados. Validar ambas as entradas localmente. Efetuar as duas leituras fixadas antes de admitir o primeiro login. O adaptador de composição `qa/StaffBusinessMemberSessions.psm1` reusa o validador de sessão e exige o contrato `Invoke-AccessReserved` do transporte existente para a reserva durável, um por conta. O diário canônico não será substituído; os recibos da tentativa M/E terão nomes próprios e não alteram os recibos OWNER A.
3. MANAGER e depois EMPLOYEE: persistir intenção e reserva exclusivas, revalidar prazo, fazer um envio e conferir UUID, projeto, sessão independente e validade. Falha ou incerteza interrompe os envios; nenhum retry. Não executar autenticação da outra conta depois de um resultado inconclusivo.
4. Somente com as três sessões confirmadas: entregar os access tokens em memória, por stdin privado ao executor aprovado, sem argumentos, arquivos, logs, clipboard, ou refresh. Usar o controlador de negócio com a mesma máquina de estados, teto 17 Edge/4 PATCH, limite de 45 minutos e reserva dos últimos 10 para recuperação. O pedido Auth adicional não libera a homologação automaticamente.

A composição passou em cinco caminhos sintéticos: sucesso ordenado, OWNER ausente, UUID divergente na leitura, primeiro login rejeitado e sessão duplicada. Nenhuma rede foi usada nesses testes. Antes de abrir qualquer formulário real, ainda é preciso vincular a composição ao host local com a prova OWNER A utilizável, a autorização e a janela atual. O formulário de OWNER A em execução não foi alterado.

**Autorização a solicitar quando houver um canal utilizável para OWNER A:** “Autorizo somente até um GET administrativo pelo UUID fixado e uma tentativa de login com a senha atual para cada uma das contas MANAGER QA e EMPLOYEE QA no TEST msinksoilkluooxenecy, conforme esta revisão e em janela exclusiva a confirmar. Sem retry, refresh, alteração de senha, outro login de OWNER A ou alteração de conta.” Não é necessária nova autorização genérica para o lote de negócio. Apenas uma janela válida e sua admissão quando as sessões estiverem disponíveis.

Staff segue suspenso. Orçamento **0/17 Edge e 0/4 PATCH**; cobertura operacional **16/60**. Nenhuma migração, função, configuração ou conta foi alterada nesta preparação.
