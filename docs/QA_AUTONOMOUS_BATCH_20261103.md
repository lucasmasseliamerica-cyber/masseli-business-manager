# NEXALVO — fechamento do lote autônomo de 03/11/2026

Código final validado: **37c2fde874ccf716b5d73d98fc20ffb2bbe15b57**, branch automation/nexalvo-qa-actions. HEAD inicial local/remoto
d261ba0d0c1394dec172f89dc52afde8defcf621, árvore inicialmente limpa. O último commit de fechamento
acrescenta somente documentação/evidência; SHA de publicação no registro entregue. Cobertura **16/60**.

## Entregas novas

1. **Convite/staff:** HTTP 504 após possível commit reproduziu DELETE Auth indevido. Exclusão
   automática removida; rejeição PostgREST estritamente classificada; incerto preserva dados e
   exige reconciliação. Recibo backend e navegador vinculados a identidade/empresa/payload;
   sem contexto de empresa não há envio. Pending não sensível impede reenvio/reload na mesma
   aba. Recarga de lista após confirmação não vira convite repetível. Código base 344cd0ed40e3aeded4d3f33433a4f30f2972a1e9,
   complemento de recibo 37c2fde874ccf716b5d73d98fc20ffb2bbe15b57. [Transição e recuperação](./QA_STAFF_RECOVERY_PATCH_20261103.md).
2. **Fornecedor:** HTTP 200/null reproduziu confirmação indevida. Recibo agora confere
   ID/pedido/valor/método/status antes de confirmar; inválido bloqueia nova chamada e exige
   conciliação de pagamento/caixa. Código 4c3fbba62330b5805e356e7d7c46c464b7a949c5.
   [Evidência e limite](./QA_SUPPLIER_PAYMENT_RECEIPT_20261103.md).
3. **Interface staff:** desativação rejeitada reproduziu Promise sem tratamento. Modal mantém
   erro acessível, libera submitting, não anuncia sucesso e preserva guardas self/último OWNER.
   Código 940fdfaad2a2ec9e563b3ed661a71841c54c6661. [Evidência](./QA_STAFF_STATUS_FEEDBACK_20261103.md).

## Validação e reutilização

| Escopo | Local + CI Linux/Windows | CI isolada |
| --- | --- | --- |
| Staff/recibo final | 79/79, zero falhas/skips; build PASS | [41770964097](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41770964097) |
| Pagamento de fornecedor | 50/50, zero falhas/skips; build PASS | [41770066412](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41770066412) |
| Modal staff | 16/16, zero falhas/skips; build PASS | [41770341294](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/41770341294) |

São contagens por suíte/execução, não critérios operacionais nem casos únicos somados. Staff
inicial 76/76 e CI 41769649760 preservados; revisão de recibo adicionou três casos e justificou
a repetição afetada. Cada alteração de App foi acompanhada de build, 1.579 módulos. Os testes
usam funções/handler reais com HTTP/estado/armazenamento sintéticos, sem banco ou sessões reais.

Foram comparados hashes dos componentes atuais com os respectivos commits validados; trechos
financeiro/modal e backend staff não mudaram no complemento final. SQLs, permissões OWNER-safe,
pré/pós-flight e rollback preparados permaneceram iguais a d261ba0. App/src seguem idênticos.
Nenhuma consulta TEST neste lote. A/fotos, B #1253, C1, calendário, ensaios C2/nativos/SCRAM,
investigações e pós-flight staff 2/13 não foram repetidos. Workflows remotos ficaram SKIPPED;
seleção isolada manteve testes/build obrigatórios afetados, sem environment/credenciais TEST.

## Gates e limites

Backend/SQL/frontend estão preparados/testados isoladamente; não implantados/homologados
realmente por este lote. Configuração staff precisa de prova de adequação, não só nomes de
Secrets. Faltam janela exclusiva, autorização de migração/substituição Edge e atores/alvos/
payloads/sessões/orçamento da homologação. A transição já define prova sem negócio e fase
update até 8 Edge/7 RPCs/2 auditorias, convite separado de até 1, sujeitos a revisão e autorização.

Rollback SQL reabre a RPC insegura: suspender staff e reconciliar antes de qualquer decisão;
nunca automático ou por inferência. Auth retido pode deixar identidade/perfil residuais;
compensação administrativa exige prova de vínculo e autorização própria. Bloqueio de aba
não é idempotência global; o financeiro conserva seu bloqueio em memória, sem promessa de
proteção contra outra aba/dispositivo, reinício ou administrador local.

Idempotências de compra/despesa e demais pacotes triados já preparados continuam dependendo
de aplicação/homologação específicas; não foram reimplementados. Nenhuma configuração,
migração, deploy, usuário, convite, seed, perda, pagamento, compensação ou cleanup remoto.
C2 segue encerrado em 6d87e2ef6440e1f70221599b75719c2f2dbdbed9; marcador/tentativa consumida
não foram acessados/alterados. Main/produção preservados. Nenhum processo/teste próprio ficou
em execução ao fechamento e nenhuma continuação em segundo plano foi programada.

## Próximas três ações

1. Comprovar configuração staff e fixar janela exclusiva/alvos de revisão sem revelar segredos.
2. Submeter autorização específica de **uma migração staff do hash revisado e substituição de
   uma única Edge pelos arquivos do manifesto**, sem convite/alteração de usuário, condicionada
   aos gates; pós-flight 13/13 e prova de configuração antes de liberar operações.
3. Preparar autorização separada da homologação mínima de papéis/update e depois convite,
   com identidades/IDs/payloads/limites/resíduos aceitos. Nenhuma aprovação de C2 é reutilizável.
