# Staff TEST — readmissão de OWNER A

**A sessão existente ficou sem verificação.** O operador informou que a aba existe, mas que não tem acesso ao perfil do navegador que usava no TEST. Isso não prova ausência, expiração ou revogação. A tentativa Auth anterior permanece consumida: OWNER A HTTP 400, sem código público coletado e sem resultado incerto. Nenhuma causa foi inferida.

## Caminho preferencial: sessão existente

Se o perfil voltar a estar disponível, abra outra aba do mesmo perfil em [Conferir sessão OWNER A](http://127.0.0.1:5173/qa/staff-owner-session-readonly.html). Não é necessário recarregar o aplicativo. A página não carrega o módulo de autenticação do app nem usa `refreshToken`. Ela exige a origem local exata, configuração pública do TEST `msinksoilkluooxenecy`, emissor, audiência, papel Auth, UUID de OWNER A, `session_id` e margem de validade. Só então encaminha um GET `/auth/v1/user` no TEST, com a credencial de usuário já presente no navegador, sem seguir redirecionamentos. Mostra somente o resultado e, em sucesso, o vencimento UTC. A página não exporta nem transfere a sessão ao executor.

Validação: quatro testes sintéticos da admissão nova passaram; HTML e módulo foram servidos pelo Vite local no TEST. Não houve prova real da sessão nesta etapa. Antes de executar o lote, ainda são necessários um canal local de entrega em memória, as três sessões independentes válidas até o fim da janela com a margem do executor, a confirmação do perfil OWNER ativo na empresa A e um checkpoint inicial atual. O mesmo manifesto, adendo Edge v6, janela exclusiva de até 45 minutos (últimos 10 para recuperação), 17 Edge e 4 PATCH continuam obrigatórios.

## Alternativa que requer autorização específica

Autorizar exclusivamente **uma nova tentativa Auth de OWNER A**, UUID `f37e9907-47c4-48bf-94b7-9a6fa5de1f88`, no TEST `msinksoilkluooxenecy`:

| Limite | Solicitação | Finalidade |
| --- | --- | --- |
| Até 1 GET administrativo | `/auth/v1/admin/users/f37e9907-47c4-48bf-94b7-9a6fa5de1f88` | Vincular a conta confirmada ao e-mail em memória. Chave de servidor existente, só nesta leitura. |
| Até 1 POST Auth | `/auth/v1/token?grant_type=password` | Usar a senha atual fornecida em campo mascarado local, e-mail verificado em memória e chave pública TEST. Se aceito, cria uma sessão Auth; a tentativa pode produzir log Auth. |
| Até 1 GET autenticado, só após sucesso | `/auth/v1/user` | Confirmar o UUID e o papel autenticado com a sessão de usuário recém-emitida, sem guardar token. |

Antes de encaminhar: revisar/vincular o adaptador específico para esse único ator; exigir janela válida e entradas locais; verificar TEST, TLS, UUID, e-mail confirmado, prazo e novo registro de autorização vinculado à tentativa anterior. Persistir intenção e reserva exclusivas antes do POST. Após a reserva, revalidar prazo e parar em qualquer divergência. Não modificar nem reutilizar a reserva de 10/11 04:25–05:10 UTC. A tentativa não habilita o lote por si só.

Em falha, registrar apenas `http_status`, `public_code` de lista fechada e `result_uncertain`. Ler em memória o cabeçalho público `x-sb-error-code` e os campos públicos `error_code`/`code`, se presentes. Ausência vira `PUBLIC_CODE_UNAVAILABLE`; códigos divergentes viram `PUBLIC_CODE_CONFLICT`. Nada de corpo, cabeçalhos brutos, e-mail, mensagens, token ou senha em evidências. Transporte, timeout, 5xx ou confirmação inconclusiva interrompem todos os envios. Qualquer tentativa consome seu slot, sem retry. O módulo de sanitização foi verificado localmente com dados sintéticos; este pacote não contém comando de envio.

Referências: [códigos Auth documentados](https://supabase.com/docs/guides/auth/debugging/error-codes) e [envelope de erro do servidor Auth](https://github.com/supabase/auth/blob/master/internal/api/errors.go).

Nenhum novo login foi enviado nesta etapa, e a tentativa alternativa ainda aguarda autorização. Não estão incluídos refresh, redefinição de senha, logins de MANAGER/EMPLOYEE, repetição do POST inválido, migração, deploy, alteração de perfis ou liberação de staff. O lote de negócio continua em **0/17 Edge e 0/4 PATCH**, sem reservas. Cobertura operacional: **16/60 (26,67%)**.
