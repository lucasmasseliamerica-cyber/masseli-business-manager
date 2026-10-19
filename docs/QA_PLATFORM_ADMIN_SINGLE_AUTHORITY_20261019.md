# Administração Comercial — autoridade única SUPERADMIN

Data: 2026-10-19

Branch: `automation/nexalvo-qa-actions`

Projeto autorizado: Supabase TEST `msinksoilkluooxenecy`

## Resultado desta entrega

**CONCLUÍDO NO CÓDIGO:** o pacote de Administração Comercial foi reconstruído para realizar um
cutover atômico da autoridade legada `nexalvo_platform.operators` para uma única autoridade global
baseada em `app_metadata.nexalvo_platform_role = SUPERADMIN`, assinada pelo Supabase Auth. Nenhuma
migração, claim, publicação de Edge Function ou escrita foi executada no TEST nesta entrega.

**BLOQUEADO NO TEST:** o estado real informado permanece com um operador legado ativo e nenhum
SUPERADMIN assinado. O preflight real anterior, portanto, continua corretamente em
`BLOCKED_AUTHORITY_CUTOVER`. CI ou PostgreSQL descartável não substituem o cutover e a homologação
reais.

## Autoridade e fronteiras

- O frontend lê somente `app_metadata`; `user_metadata`, papel tenant `OWNER`, `MANAGER`,
  `EMPLOYEE` e membership em `operators` não concedem acesso global.
- A Edge Function revalida a sessão no Auth e o claim ao vivo em toda chamada. Listagens e escrita
  passam o UUID do ator para as RPCs.
- As três RPCs novas são `SECURITY DEFINER`, usam `search_path` vazio, são executáveis somente por
  `service_role` e revalidam no banco que o ator ainda possui claim assinado e perfil ativo.
- As tabelas privadas não possuem acesso direto de `anon`, `authenticated` ou `service_role`.
  Somente as RPCs definidoras acessam requests, auditoria e marcador de cutover.
- As oito funções/endpoints legados permanecem fisicamente presentes para recuperação, mas o
  cutover revoga seus grants e desativa o operador no mesmo `COMMIT` que instala a nova autoridade.

## Licença, estado e auditoria

- Concessão vitalícia, revogação e ativação/suspensão usam request UUID, lock da empresa, comparação
  integral do payload e replay da resposta concluída.
- Repetir a mesma intenção com outro request produz uma auditoria `changed=false` sem alterar
  timestamps comerciais. Reutilizar o request com payload diferente falha.
- Cada request concluído cria auditoria privada com ator, empresa, operação, valores anteriores,
  novos valores e indicação de mudança efetiva.
- Um SUPERADMIN não pode suspender a própria empresa enquanto ele for a autoridade única. O banco
  aplica essa regra e a interface desabilita o botão correspondente.
- `authenticated` perde `UPDATE` amplo em `businesses` e mantém somente as colunas de configuração
  usadas pela tela tenant. `platform_status` e campos de licença permanecem server-only.

## Suspensão efetiva

Suspensão passou de metadado visual para bloqueio central preparado:

- `current_business_id()` retorna empresa somente quando `platform_status = ACTIVE`;
- `user_can()` também exige empresa ativa;
- as políticas de leitura de `businesses` e `business_settings_lists` usam o contexto ativo;
- `fn_read_employees_secure()` e `fn_write_audit()` não aceitam empresa suspensa;
- a execução direta do export privado é revogada; o wrapper público exige OWNER, empresa própria e
  empresa ativa;
- `fn_session_access_status()` expõe somente o estado da própria sessão, permitindo que o frontend
  informe “empresa suspensa” sem liberar o perfil escondido por RLS.

As demais políticas tenant já dependem de `current_business_id()` segundo o catálogo público
recebido. A homologação real ainda precisa provar negação de leitura e escrita depois do cutover.

## Preflight, pós-preflight e rollback

`qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql` é estritamente somente leitura. Ele
exige, entre outros pontos:

- exatamente um operador legado ativo;
- exatamente um claim assinado válido, na mesma identidade e com perfil ativo;
- oito endpoints legados com fingerprints exatos e grants ainda íntegros;
- ausência de colisões do plano novo;
- fingerprints exatos de `current_business_id`, `user_can`, export de backup e hardening aplicado.

`qa/sql/platform_admin_single_authority_preflight_readonly_TEST.sql` executa 20 checks pós-cutover:
claim único, operador/grants legados inativos, RPCs service-role-only, proteção privada, gates de
suspensão, política/ACL de `businesses`, export de backup, bloqueio de autossuspensão e RPC de estado.

O rollback recusa execução quando existe claim SUPERADMIN, request/auditoria administrativa ou
qualquer estado comercial alterado. Ele usa o marcador privado para restaurar somente o operador
original, recompõe funções/policies/ACLs anteriores e não usa `CASCADE`. Depois de uma operação
administrativa real, o rollback destrutivo deixa de ser elegível; a recuperação deve corrigir o
plano novo preservando o histórico.

## Evidências locais

| Teste | Resultado | Evidência | Limite |
|---|---:|---|---|
| Regressões frontend/Edge/SQL | **PASS 24/24** | `node --test qa/platform-admin-backend.test.mjs qa/platform-admin-foundation.test.mjs` | Estático/unitário |
| Aplicação em PostgreSQL 17 descartável | **PASS** | migração executada do início ao `COMMIT` após catálogo mínimo | Guard de fingerprint real foi validado separadamente por testes; o mock não é TEST |
| Pós-preflight descartável | **PASS 20/20** | `PASS_SINGLE_SIGNED_AUTHORITY` | Não comprova implantação TEST |
| Negação OWNER/MANAGER/EMPLOYEE/legado sem claim | **PASS 4/4** | chamadas às RPCs como `service_role`, todas com SQLSTATE `42501` | Identidades sintéticas locais |
| Licença, replay, conflito, suspensão e reativação | **PASS** | 6 requests/6 auditorias, 4 mudanças e 2 no-ops; replay sem nova auditoria; payload conflitante negado | Fluxo PostgreSQL descartável |
| Suspensão tenant/export e autossuspensão | **PASS** | contexto e permissão nulos, status `BUSINESS_SUSPENDED`, export negado e tenant do SUPERADMIN protegido | Sessões sintéticas locais |
| Rollback descartável | **PASS** | remoção simulada do claim, restauração do operador/ACL/fingerprints e `COMMIT` | Elegível porque não houve operação comercial |

## Atribuição preparada do claim

`scripts/prepare-superadmin-claim.mjs` opera em dry-run por padrão, aceita apenas o project ref TEST,
valida a identidade Auth e preserva todo o restante de `app_metadata`. Não imprime UUID, e-mail,
metadados, chave ou token. Uma escrita exige simultaneamente `--apply` e o gate
`NEXALVO_CLAIM_CHANGE_AUTHORIZED=TEST_ONLY_EXPLICIT`.

As variáveis devem existir somente no ambiente seguro de execução:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `NEXALVO_SUPERADMIN_USER_ID` (a identidade do único operador legado autorizado);
- `NEXALVO_CLAIM_OPERATION=GRANT` ou `REMOVE`.

O helper não prova que a identidade é o operador legado. Essa correspondência é obrigatoriamente
confirmada pelo preflight SQL antes de qualquer cutover.

## Sequência exata de autorizações

1. **Publicar a Edge Function somente no TEST.** Ainda sem claim, toda chamada continua negada.
2. **Autorizar a atribuição do claim no TEST** à identidade do único operador legado existente.
   Nenhuma conta ou e-mail novo é necessário. Executar o helper em dry-run antes do `--apply`.
3. Executar o preflight de cutover somente leitura. Exigir `PASS_READY_FOR_ATOMIC_CUTOVER`; qualquer
   drift mantém o bloqueio.
4. **Autorizar especificamente a migração `20261016_platform_admin_TEST.sql` no TEST.** Ela realiza
   o corte em uma transação e não altera Auth.
5. Executar o pós-preflight somente leitura e exigir 20/20.
6. Homologar login SUPERADMIN real e negação real para OWNER, MANAGER, EMPLOYEE e antigo operador.
7. **Autorizar separadamente operações comerciais reversíveis** em uma empresa QA que não seja a
   empresa do SUPERADMIN: licença, revogação, suspensão e reativação. Validar auditoria e ausência de
   acesso tenant durante suspensão.

Rollback exige outra autorização específica e a ordem: desabilitar a Edge Function, remover o
claim assinado, confirmar zero histórico/estado alterado e só então executar o rollback. Remover o
claim antes do rollback cria uma janela sem autoridade global; isso é intencional para impedir duas
autoridades simultâneas.
