# staff-user-service / OWNER-safe — retomada dirigida

Estado: **PREPARADO, NÃO APLICADO; gates operacionais e de homologação pendentes**.
Branch automation/nexalvo-qa-actions. HEAD local/remoto inicial:
6d87e2ef6440e1f70221599b75719c2f2dbdbed9, árvore limpa. Esse fechamento C2 é preservado;
nenhum arquivo/marcador/ensaio/conexão C2 foi acessado ou executado nesta retomada.
Nenhuma migração, publicação, alteração de Secret/usuário/permissão ou operação de negócio
foi executada. Cobertura 16/60 permanece. Data local do notebook: 03/11/2026; coletas UTC: 04/11.

## Reutilizado e preservado

O backend foi preparado em 364fbabe771127882c6b728b16abfde9f538310e. O complemento OWNER-safe
e revogação do endpoint inseguro estão em **7df40ec2ba5e8f0abbd41e4850b394b85ee3f15c**.
SQLs, rollback, Edge, dois módulos compartilhados e sete testes continuam iguais a esse
commit após normalizar CRLF/LF. Nenhum backend ou frontend foi reimplementado.

Revisão reaproveitada: QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md, achado SEC-CAT-05;
QA_FINAL_HOMOLOGATION_PACKAGE_20261017.md; QA_REAL_CATALOG_REVIEW_20261017.md. O hardening
público já aplicado e seu 16/16 PASS são dependência satisfeita no histórico, não tarefa
para reaplicação. Os snapshots antigos que diziam Edge ausente não substituem a coleta atual.

[CI do commit OWNER-safe 39097605790](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39097605790):
12/12 jobs SUCCESS, consultados sem redispatch. As regressões aprovadas não foram repetidas;
nenhuma implementação coberta por elas mudou. Não houve build novo nem teste autenticado.

## Artefatos exatos

Os hashes abaixo são dos bytes deste checkout Windows. O manifesto de evidência também
registra SHA-256 com LF, correspondente ao conteúdo Git portátil; CRLF não é drift funcional.

| Artefato | SHA-256 dos bytes do checkout |
| --- | --- |
| migrations/20261017_manage_staff_user_TEST.sql | 16ca5d6505a73d71f0131aab7790947b1ce581134f716919aea705932d9cf9ec |
| migrations/20261017_manage_staff_user_rollback_TEST.sql | d49b03e82886e0214aaf5826fae275b8ec7602e3eb4ce7fdcda7944d5dc355ca |
| qa/sql/manage_staff_user_preflight_readonly_TEST.sql | 7529b15ea28519f161d21a4cdc85a2b2ad50ca6ffbeca0fc304da67be7cde7dc |
| supabase/functions/manage-staff-user/index.ts | ec60edfa0f87416c18cb73f75ff7173534f2d88ed45ad118ba0032bf1a617a66 |
| supabase/functions/_shared/manage-staff-user-core.mjs | 957dcbbd2537b0881540cf0ea911373e8f4922fbc4893ad5d049c9a7dada9397 |
| supabase/functions/_shared/platform-admin-core.mjs | 31575b6662a9ff71d7f054323e3fccfa88140e4182ac6ab4dfdf36aa36d6bf04 |
| qa/manage-staff-user.test.mjs | ba3cc5a3e4d88b4155e2642479ab180d7a330dfb0d89320ce93948ec3cafb8e4 |
| **Novo:** qa/sql/manage_staff_user_postflight_readonly_TEST.sql | 013e3816e6c84986304ca98e24810a033780118224f65cfa3d8b3370c6c9b83a |

O novo arquivo completa uma lacuna concreta: o preflight existente lista presença/contratos,
mas não agrega o pós-cutover da RPC nova e as ACLs efetivas de ambas. São 13 checks de catálogo,
sem chamada de RPC de negócio, dados de tenant ou Auth. Inclui snapshot de ACL e triggers.

## Estado TEST observado somente por leitura

Alvo explicitamente msinksoilkluooxenecy, via conector, sem prompt ou credencial solicitada:

- Preflight existente executado em transação READ ONLY/ROLLBACK: nova RPC ausente, sem colisões;
  18 colunas necessárias presentes; constraints e privilégios de service_role retornados.
- Legado fn_save_user_profile mantém assinatura/fingerprint revisados
  **4e02f0128a171ec8a6e65de291f115e7**. EXECUTE efetivo para authenticated permanece verdadeiro.
  ACL direta atual: postgres, authenticated e service_role, sem grant option, sem PUBLIC/anon.
- Edge **manage-staff-user v4 ACTIVE, verify_jwt=true**, atualizada em 06/10/2026, já existe.
  O código implantado chama fn_save_user_profile; não é a implementação OWNER-safe preparada.
  Bundle implantado informado pelo serviço: SHA-256
  1caa00e94cbfdace6f380d10f327c477560df425cc938dda99850e68daface37.
- Quatro triggers não internos observados: dois de employees e dois de users; todos ativos.
  users tem prevenção de autoelevação e validação de overrides. Não foram encontrados triggers
  não internos em auth.users ou audit_logs neste recorte. Nenhum trigger foi alterado.
- Novo pós-flight: **BLOCKED 2/13**, esperado antes da instalação: corpo legado e grants de
  tabela de serviço conferem; nova RPC ausente e ACL legada ainda aberta a authenticated.
  Não é falha da migração, que não foi executada, nem homologação real de papéis.

Validação específica do SQL novo: executado somente por leitura no estado real pré-aplicação.
A primeira versão expôs diferença de renderização de pg_get_functiondef com search_path
pg_catalog; foi fixado public, como no fingerprint revisado. O resultado final confirma o
fingerprint antigo. Nenhum guard/SQL aprovado foi alterado para acomodar o diagnóstico.
O resultado positivo 13/13 após instalação ainda não foi executado nem reivindicado.

## Efeitos da aplicação preparada

Uma transação SQL: checa fingerprint/ACL legados, cria fn_manage_staff_profile com
SECURITY INVOKER/search_path vazio, restringe sua execução a service_role e revoga
PUBLIC/anon/authenticated da RPC legada, preservando execução por serviço. Não cria tabela,
perfil, identidade Auth, convite ou auditoria de negócio. Metadados/histórico de migração
do mecanismo escolhido são adicionais à transação funcional e precisam ser registrados.

A RPC nova valida ator/empresa/permissão pelo servidor. OWNER controla mudanças de papéis,
overrides e contas OWNER; não-OWNER não altera o próprio perfil. Verifica vínculos de funcionário,
username, duplicidade ativa e permanência de OWNER. Perfil e uma auditoria são gravados na
mesma transação quando futuramente houver operação válida. Triggers existentes continuam ativos.
Isso descreve código revisado, não prova concorrência/fluxo real no TEST.

A publicação substitui imediatamente a Edge v4. Upload exato de três arquivos, mantendo
os caminhos relativos: manage-staff-user/index.ts, _shared/manage-staff-user-core.mjs e
_shared/platform-admin-core.mjs; entrypoint manage-staff-user/index.ts, verify_jwt=true.
Não publicar outras funções, frontend ou dependências. Os módulos não têm imports remotos.
Publicar código não invoca o negócio, mas passa a servir requisições recebidas: a janela
exclusiva precisa impedir chamadas de equipe durante toda a transição.

## O que falta e ordem revisável

1. **Configuração de servidor comprovada:** SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY reservados
   do TEST; NEXALVO_ALLOWED_PROJECT_REF=msinksoilkluooxenecy; STAFF_ADMIN_ALLOWED_ORIGINS contendo
   a origem exata da QA. Proposta local para revisão: http://127.0.0.1:5173, já usada no notebook.
   Não trocar por localhost nem acrescentar wildcard. A conexão disponível não lista Secrets;
   existência/valores dessa allowlist staff não foram verificados. Confirmar pelo administrador
   sem enviar segredos ao chat. Qualquer ajuste de configuração é uma autorização própria,
   preservando valores/origens legítimos e sem sobrescrever Secrets reservados.
2. **Janela exclusiva de gestão de equipe:** sem convites/edições de usuários por UI, API ou
   jobs enquanto banco e Edge divergirem. A migração quebra o caminho da Edge antiga; publicar
   a nova antes da RPC também não permite operação. Aceitar indisponibilidade temporária e
   registrar responsáveis/início/fim antes da aplicação. Sem bloqueio operacional, não aplicar.
3. **Autorização de entrega:** uma migração desse hash e substituição dessa única Edge, sem
   chamadas de negócio/usuários. São ações distintas que precisam constar expressamente na
   autorização; autorização de C2 ou outra jornada não se aplica. Não executar agora.
4. **Admissão:** conferir novamente projeto/HEAD/hashes, snapshot do legado/Edge v4, colisões,
   dependências e configuração dentro da janela. Qualquer drift bloqueia, sem rebase do SQL.
5. **Aplicação autorizada:** aplicar apenas migrations/20261017_manage_staff_user_TEST.sql.
   Exigir confirmação e pós-flight 13/13. Só então substituir manage-staff-user pelos três
   arquivos fixados. Não enviar convite para testar a publicação.
6. **Verificações posteriores sem negócio:** 13/13 SQL, invariância dos triggers/grants de
   tabelas, legado negado a authenticated/PUBLIC/anon, nova RPC service-only; confirmar nova
   versão/hash/configuração Edge. OPTIONS da origem exata e negação sem sessão, sem chamadas
   autenticadas de invite/update. Não confundir essas sondas com homologação de usuários.
7. **Homologação real separada:** definir sessões independentes OWNER/MANAGER/EMPLOYEE e alvo
   exclusivo/empresa de teste, IDs, campos, orçamento de tentativas/auditorias e histórico
   residual. Autorizar explicitamente cada alteração/convite e eventual recuperação. Provar
   isolamento, negação sem manageUsers, proteção de OWNER/self, alterações de role/overrides
   somente por OWNER e atomicidade perfil/auditoria. Não reutilizar jornadas/fixtures A/B/C1.

Não restou apenas uma autorização genérica: configuração, janela e escopo de homologação
ainda precisam ser fixados; convites também têm o limite de recuperação abaixo. Não foi
apresentado pedido de execução mutante enquanto esses gates permanecem abertos.

## Recuperação existente e limites concretos

- Falha SQL definitiva antes de COMMIT: a transação aborta; preservar resposta/artefatos.
  Resposta incerta: não reaplicar nem executar rollback por inferência. Reconciliar por catálogo
  usando preflight/pós-flight e comparar a Edge com snapshot; estado misto/drift exige revisão.
- Rollback SQL existente: restaura EXECUTE legado para authenticated/service_role e remove
  somente a RPC nova, sem CASCADE. Perfis/Auth/auditoria permanecem. **Reabre SEC-CAT-05**;
  exige decisão e autorização específicas. Não é fallback automático ou restauração de usuários.
- Edge anterior preservada fora do Git em work/staff-user-service/edge-v4, index.ts + deno.json,
  sem segredos detectados. Hashes de origem constam da evidência. Restituir esses arquivos
  cria uma nova versão da função, não restaura o número 4 ou o bundle binário anterior.
  Recuperação completa exige coordenar ACL/RPC/Edge e configuração sob janela exclusiva.
- O serviço preparado para convite compensa Auth somente quando marca rejeição de perfil
  como definitiva; falha de transporte ou recibo inválido retorna códigos de reconciliação
  e não apaga/reenvia. INVITE_IDENTITY_MISSING, STAFF_INVITE_COMMIT_UNCERTAIN,
  STAFF_PROFILE_COMMIT_UNCERTAIN, STAFF_COMMIT_UNCERTAIN e STAFF_COMPENSATION_REQUIRED
  precisam de leitura administrativa dirigida de Auth/perfil/auditoria, sem retry automático.
- **Limite não resolvido do código aprovado:** todo HTTP não-2xx da RPC recebe
  safeToCompensate=true; não há distinção de erro de gateway que possa deixar commit incerto.
  Portanto, não é possível afirmar segurança completa dessa compensação. Revisão/correção
  dirigida desse ramo é gate antes de convite real; não foi reimplementado nesta retomada.
  O fluxo também não possui journal/idempotência durável para convites. O procedimento de
  parada/leitura não equivale a um executor que impeça tecnicamente todo reenvio humano.

Somente após gates satisfeitos poderá ser submetido pedido concreto de aplicação/publicação,
com esses hashes, configuração confirmada e janela; homologação mutante continua separada.
O fechamento C2, main, produção e evidências A/fotos, B e C1 permanecem preservados.
