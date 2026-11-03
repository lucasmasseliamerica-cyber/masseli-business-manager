# C2 — SCRAM e interação manual: checkpoint

**PENDING_HUMAN_READY_DELAY. Preparação ainda não encerrada integralmente.** Os resultados
aprovados permanecem preservados. Não há autorização, proposta de retry ou caminho novo
para a tentativa seed histórica, que continua consumida/bloqueada. Cobertura 16/60.

## Comportamento comprovado

No notebook, PostgreSQL 17.11 descartável local, papel exclusivo c2_scram_lab, HBA hostssl
scram-sha-256, TLS verify-full e channel binding require. A senha foi criada/confirmada no
prompt oculto do initdb e informada no prompt oculto do único psql. Nenhum valor de senha
foi recebido pelo agente, passado em argumento/ambiente/arquivo de senha ou capturado pelo
Node. O verificador SCRAM permanece apenas no catálogo privado do PostgreSQL; a prova SQL
consulta somente o booleano do tipo SCRAM, sem retornar salt/verificador.

1. **PASS — positivo manual:** autenticação SCRAM comprovada por HBA fixado, prova SQL e
   log do servidor para o PID correspondente; TLSv1.3, leitura antes da prontidão, READY
   digitado pelo operador, PID/backend_start iguais nas duas provas, intenção/reserva
   duráveis e operação TEMP sintética confirmada. Nenhum SQL operacional de seed foi lido.
2. **PASS — demora na senha:** psql real no prompt oculto sem entrada, janela local de 60s,
   encerramento ABSOLUTE_DEADLINE, zero prova autenticada/intenção/reserva/dispatch e filhos
   observados encerrados. O teto absoluto continua 120s, margem 30s; não foram ampliados.
3. **PENDENTE — demora em READY:** os ensaios anteriores dessa finalidade não chegaram ao
   estado correto de espera. Um expirou ainda na senha; outro autenticou tarde e foi
   rejeitado antes de admitir READY/margem suficiente. Ambos preservados, sem reserva ou
   dispatch, e **não aprovados como prova de timeout aguardando READY**.

O positivo e a demora na senha não serão repetidos. O mesmo demo.mjs ganhou seleção
--scram-case readiness-delay para executar exclusivamente a lacuna. Um botão público de
disponibilidade antecede o setup, e outro antecede a criação do psql; não recebem entrada
de texto/senha e não autorizam operação. Enquanto aguardam, nenhum prazo de autenticação
corre. Após clicar, os limites de autenticação/readiness continuam fixos. Não há outro
protótipo ou relaxamento de guards.

## Validação de código

Código QA 244d6c092566a9c095325929b1d13d80c851a86f.
[CI 41705336809](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41705336809):
Linux e Windows, seis controles novos PASS e um caso nativo positivo com certificado PASS,
selecionado como regressão afetada pela extensão de ambiente/identidade. Os 17 testes do
modelo e a suíte completa dos 11 nativos não foram repetidos. A CI não recebe senha e não
substitui a demonstração manual SCRAM.

As correções de interação incluem saída de initdb registrada por evento exit em vez de
depender de close do pipe, classificação específica de expiração do setup, fechamento do
handle TTY do controlador/helper e restauração de modo de console após encerrar o psql.
O launcher usa uma janela visível do Windows Terminal. Nenhuma captura de tela, histórico
de comandos, clipboard, tecla ou valor de senha foi usada na verificação.

## Limitações restantes

A prova de timeout autenticado enquanto aguarda READY ainda depende da ação do operador
na janela. SCRAM manual foi comprovado no Windows do notebook; na CI Linux/Windows foram
executados controles e a regressão afetada, sem alegação de login humano nesses runners.
A não reutilização do valor da senha fora do laboratório depende do operador; seu valor
não é conhecido nem comparado com outras senhas. Artefatos privados/catálogo/chaves locais
não são publicados. Permanecem os limites materiais de durabilidade e supervisão descritos
no [pacote nativo aprovado](./QA_C2_NATIVE_LOCAL_READINESS_20261103.md), sem ampliar auditoria.

## Diferença exata para o caminho operacional

O adaptador aceita somente postmaster próprio em 127.0.0.1, CA local, cluster_id esperado,
papel de laboratório e template TEMP fixo. Não aceita host/SQL do operador; não inclui
driver/SQL seed, fixture C2, prova de projeto Supabase, elegibilidade/contratos atuais ou
autoridade mutante real. O helper de prontidão não abre outra conexão. O marcador histórico
não é lido, substituído ou ignorado por esse caminho: execução operacional continua sem
implementação/liberação. Não houve conexão TEST, seed, perda, migração ou cleanup.

## Decisão necessária para eventual continuidade histórica

Esta preparação não oferece reenvio. Após completar a prova pendente, a decisão específica
será manter a tentativa histórica encerrada como consumida/incerta, ou solicitar revisão
formal de sua destinação. Essa revisão por si só não autoriza ação. Qualquer autorização
posterior teria de reconhecer expressamente a tentativa anterior, o orçamento consumido e
o marcador preservado, e definir a ação concreta, seus artefatos revisados, limites e janela,
com gates atuais. Nenhum novo nome, diretório, ID ou fixture substitui essa decisão. Perda
permanece separada e não autorizada.

Próximo passo imediato apenas local: no diálogo “PRONTO NO TECLADO?”, clicar OK na própria
janela quando estiver disponível; criar a senha nos prompts initdb; confirmar disponibilidade
no botão “PRONTO PARA PASSWORD DO PSQL?”; informá-la no prompt nativo e **não digitar READY**
após a prova SQL. O relatório privado será persistido automaticamente. Não enviar senha ao chat.
