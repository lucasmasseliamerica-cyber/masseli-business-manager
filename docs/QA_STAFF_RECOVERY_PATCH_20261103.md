# Staff — recuperação corrigida e transição

Preparado/testado isoladamente, **não implantado nem homologado no TEST**. Nenhuma consulta
TEST neste lote: o pré-aplicação 2/13 anterior foi reutilizado sem renovar prova. Cobertura 16/60.

## Correção e evidência

O handler real, compilado localmente com fetch interceptado, tentou DELETE Auth após possível
commit de perfil seguido de HTTP 504. Diagnóstico: 1 tentativa de DELETE, esperado 0. Dados
sintéticos, sem convite real. A regressão agora passa preservando Auth/perfil/auditoria.

Somente estrutura PostgREST válida e par HTTP/SQLSTATE conhecido classificam rejeição definitiva.
Gateway, timeout, desconhecido, JSON truncado e recibo incompatível são incertos. O sucesso
deve corresponder a identidade, empresa e campos submetidos. Nenhuma mensagem SQL privada sai.
Rejeição do perfil não comprova propriedade exclusiva da identidade de /invite: **a exclusão
automática de Auth foi removida de todos os caminhos**. Não foi criado outro serviço/executor.

Convites parciais param para reconciliação com retry_allowed=false, reconciliation_required=true
e profile_outcome=rejected/uncertain. Erros Auth genéricos também não autorizam reenvio. Update
com rejeição comprovada continua distinto de convite parcial e resultado incerto.

O chamador persiste só pending em sessionStorage antes do envio, sem ID, token, e-mail ou payload.
Falha de persistência impede envio. Concorrência na mesma página, fechar modal e reload da mesma
aba não liberam retry incerto. Apenas confirmação ou rejeição anterior à mutação comprovadas
liberam o bloqueio. Falha de recarga da lista após confirmação não vira erro de envio repetível.

Limites: bloqueio da aba não é idempotência de servidor/journal global. Outra aba/dispositivo,
cliente HTTP e remoção manual de armazenamento não são controlados. Não há prova de identidade
nova nem cleanup automático. Resíduos Auth/perfil/auditoria exigem reconciliação administrativa.

Validação inicial: **76/76 regressões afetadas PASS**, zero falhas/skips; build Vite PASS, 1.579 módulos. Foram
reexecutados staff, fronteira compartilhada platform-admin e employee porque o chamador/erros
mudaram. O teste estático antigo de exclusão foi atualizado para o novo contrato; testes novos
executam o handler real localmente. HTTPs/armazenamento são sintéticos, não prova de implantação.

Revisão final do chamador: um ID isolado não basta para confirmar o recibo. Empresa esperada,
identidade e campos submetidos precisam coincidir; contexto de empresa ausente impede envio.
Três regressões adicionais cobrem recibo identificado incompleto, empresa divergente e falta
de contexto. Total final **79/79 PASS**, build PASS. A CI inicial 76/76 permanece histórica;
a nova CI staff vincula esse complemento. Não houve mudança nos trechos financeiro/modal.

CI isolada: [staff-offline] seleciona staff-recovery Linux/Windows, 79 regressões e build;
[c2-offline] reutiliza o gate documentado que evita jornadas/logins persistentes do workflow
legado. Não foram reexecutados calendário, A/B/C1, ensaios C2/nativos ou auditorias encerradas.

## Artefatos e ordem

Alterados: index.ts Edge, manage-staff-user-core.mjs, chamador/hook nas duas cópias App, tradução,
testes e seleção da CI. Hashes no manifesto desta entrega. SQL de migração/rollback e pré/pós-flight
mantêm hashes d261ba0. OWNER-safe, grants e atomicidade perfil/auditoria não foram alterados.
Snapshot Edge v4 anterior continua preservado fora do Git, sem nova coleta.

Após autorização específica: suspender staff por UI/API/jobs → confirmar TEST/HEAD/hashes,
snapshots, colisões e configuração → aplicar somente SQL revisado → exigir 13/13 → substituir
somente manage-staff-user pelos três arquivos fixados com verify_jwt=true → comprovar versão,
configuração e negações sem negócio → considerar frontend compatível e homologação separada.
SQL/deploy não são atômicos entre si: janela exclusiva cobre todo intervalo. Não convidar para
testar publicação. Nenhuma dessas ações foi executada ou autorizada por este documento.

## Configuração: nomes não comprovam adequação

| Configuração | Evidência futura sem expor valores |
| --- | --- |
| SUPABASE_URL / NEXALVO_ALLOWED_PROJECT_REF | Administrador confirma igualdade do projeto TEST; guardar somente booleans/projeto esperado, sem revelar configuração |
| SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | Depois do deploy autorizado, sessão OWNER válida + POST deliberadamente inválido chega a INVALID_REQUEST após Auth/leitura de perfil, antes de RPC de negócio; não publicar JWT/chaves/digests |
| STAFF_ADMIN_ALLOWED_ORIGINS | OPTIONS da origem QA exata: 204 e allow-origin exato; origem externa negada; sem wildcard nem substituição de origens legítimas |
| Configuração obrigatória completa | POST sem Authorization retorna AUTH_REQUIRED/401, não STAFF_NOT_CONFIGURED; prova presença/coerência básica, não validade das chaves |
| Redirect e SMTP Auth | Adequação/entrega dependem de convite controlado separado; nome de Secret não comprova e-mail funcional |

POST inválido contém operation não suportada e nenhum dado pessoal; exigir versão/hash Edge
corretos primeiro. Registrar somente status/código/booleans. Nenhuma configuração/Secret foi lida
ou alterada neste lote. Não abrir prompts nem pedir credenciais ao proprietário nesta preparação.

## Recuperação parcial: suspensão e reconciliação primeiro

| Estado | Decisão revisável, nunca automática |
| --- | --- |
| SQL com resposta incerta | Suspender staff; preservar artefatos; reconciliar catálogo pré/pós e snapshot Edge; não reenviar SQL nem presumir rollback |
| SQL novo + Edge v4 | Manter suspensão; conferir ACLs/hash; publicar nova Edge somente com autorização específica; não reabrir privilégio legado |
| Edge nova + SQL ausente | Suspender; reconciliar identidades eventualmente retidas; aplicar SQL somente se autorizado e gates atuais passarem |
| Código correto + configuração incorreta | Manter suspensão; ajustar configuração apenas com autorização própria; não restaurar ACL insegura como atalho |
| Convite/update incerto | Preservar Auth/perfil/auditoria/pending; leitura administrativa dirigida; nenhum retry/DELETE/novo convite |

Rollback SQL existente **reabre SEC-CAT-05** e remove a RPC nova. Não é recuperação segura
por padrão. Antes de decidir: suspensão, reconciliação e revisão de snapshots. Excepcional
autorização deve coordenar SQL/Edge/configuração; nunca reabrir privilégios ou restaurar Edge
legada por inferência. Rollback não desfaz usuários/auditorias. Remover pending local somente
após decisão de reconciliação registrada; isso não autoriza reenviar a operação.

## Homologação mínima futura

Separar provisionamento de atores/alvos, entrega de código e negócio. Faltam IDs/empresa
isolada, sessões independentes, configuração confirmada, autorização e janela. Nenhuma
fixture/conta é criada agora, nem se reutilizam fixtures/jornadas A/B/C1.

- Sem negócio: catálogo 13/13, versão/hash Edge, CORS permitido/negado, 401 sem sessão e
  INVALID_REQUEST com OWNER/operation deliberadamente inválida; zero RPC de perfil/convite.
- Update: até 8 chamadas Edge — EMPLOYEE sem manageUsers (0 RPC); quatro negações MANAGER
  (self, role de outro, overrides de outro, alvo externo); negação de último OWNER; update
  OWNER válido; restauração de campos explicitamente autorizada. Máximo 7 RPCs de perfil;
  duas gravações e duas auditorias permanentes esperadas. Cada tentativa incerta consome
  seu slot e encerra a fase. Alvos/payloads precisam de revisão antes, não estão autorizados.
- Invite separado: até 1 convite para destinatário controlado aprovado, 1 RPC/1 auditoria
  esperados em sucesso; aceitar identidade/perfil e histórico Auth/SMTP residuais. Sem DELETE,
  replay ou compensação automática. Incerteza encerra e exige leitura, não nova identidade.

Esses orçamentos são proposta para revisão. A próxima autorização poderá abranger uma
migração e uma substituição Edge após os gates; homologação/usuários continuam separados.

Referência de classificação: [PostgREST — erros e SQLSTATE](https://docs.postgrest.org/en/stable/references/errors.html).
