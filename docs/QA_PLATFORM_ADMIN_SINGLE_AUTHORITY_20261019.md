# Administração Comercial — autoridade única SUPERADMIN

Data: 2026-10-19

**Reconciliação vigente:** [identidades distintas, 2026-10-20](./QA_PLATFORM_ADMIN_DISTINCT_IDENTITIES_20261020.md).
Preservar o SUPERADMIN já escolhido, seu perfil EMPLOYEE e o operador legado OWNER distinto.
Não executar o helper de claims para esta transição. O rollback revisado também preserva o claim.

Branch: `automation/nexalvo-qa-actions`

Projeto autorizado: Supabase TEST `msinksoilkluooxenecy`

## Resultado desta entrega

**CONCLUÍDO NO CÓDIGO:** o pacote de Administração Comercial foi reconstruído para realizar um
cutover atômico da autoridade legada `nexalvo_platform.operators` para uma única autoridade global
baseada em `app_metadata.nexalvo_platform_role = SUPERADMIN`, assinada pelo Supabase Auth. Nenhuma
migração, claim, publicação de Edge Function ou escrita foi executada no TEST nesta entrega.

**Estado histórico desta entrega:** em 2026-10-19 havia um operador legado e nenhum SUPERADMIN.
O diagnóstico real posterior confirmou um SUPERADMIN EMPLOYEE distinto do operador OWNER;
o preflight antigo obteve 11/12. A reconciliação de 2026-10-20 substitui a premissa de igualdade
das identidades por validação independente e auditável. O preflight revisado ainda exige prova no TEST.

## Autoridade e fronteiras

- O frontend lê somente `app_metadata`; `user_metadata`, papel tenant `OWNER`, `MANAGER`,
  `EMPLOYEE` e membership em `operators` não concedem acesso global.
- A Edge Function revalida a sessão no Auth e o claim ao vivo em toda chamada. Listagens e escrita
  passam o UUID do ator para as RPCs.
- As três RPCs novas são `SECURITY DEFINER`, usam `search_path` vazio, são executáveis somente por
  `service_role` e revalidam no banco claim, perfil ativo e correspondência ao ator gravado no
  marcador privado ACTIVE. Um claim posterior em outra identidade não amplia a autoridade.
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
- exatamente um claim assinado válido com perfil ativo e papel tenant preservado;
- identidades distintas: operador legado OWNER válido sem claim e SUPERADMIN independente;
- oito endpoints legados com fingerprints exatos e grants ainda íntegros;
- ausência de colisões do plano novo;
- fingerprints exatos de `current_business_id`, `user_can`, export de backup e hardening aplicado.

`qa/sql/platform_admin_single_authority_preflight_readonly_TEST.sql` executa 20 checks pós-cutover:
claim único, operador/grants legados inativos, RPCs service-role-only, proteção privada, gates de
suspensão, política/ACL de `businesses`, export de backup, bloqueio de autossuspensão e RPC de estado.

O rollback revisado preserva o claim existente e os perfis. Recusa request/auditoria administrativa,
estado comercial alterado, identidade de recuperação inválida ou drift no código legado. Desativa
o marcador e remove as RPCs novas na mesma transação que restaura somente o operador original.
Preserva permanentemente o marcador privado como ROLLED_BACK, recompõe funções/policies/ACLs
anteriores e não usa `CASCADE`. Havendo histórico, corrigir o plano novo em vez de apagá-lo.

## Evidências históricas locais — substituídas pela regressão vigente de identidades distintas

| Teste | Resultado | Evidência | Limite |
|---|---:|---|---|
| Regressões frontend/Edge/SQL | **PASS 24/24** | `node --test qa/platform-admin-backend.test.mjs qa/platform-admin-foundation.test.mjs` | Estático/unitário |
| Aplicação em PostgreSQL 17 descartável | **PASS** | migração executada do início ao `COMMIT` após catálogo mínimo | Guard de fingerprint real foi validado separadamente por testes; o mock não é TEST |
| Pós-preflight descartável | **PASS 20/20** | `PASS_SINGLE_SIGNED_AUTHORITY` | Não comprova implantação TEST |
| Negação OWNER/MANAGER/EMPLOYEE/legado sem claim | **PASS 4/4** | chamadas às RPCs como `service_role`, todas com SQLSTATE `42501` | Identidades sintéticas locais |
| Licença, replay, conflito, suspensão e reativação | **PASS** | 6 requests/6 auditorias, 4 mudanças e 2 no-ops; replay sem nova auditoria; payload conflitante negado | Fluxo PostgreSQL descartável |
| Suspensão tenant/export e autossuspensão | **PASS** | contexto e permissão nulos, status `BUSINESS_SUSPENDED`, export negado e tenant do SUPERADMIN protegido | Sessões sintéticas locais |
| Rollback descartável | **PASS** | remoção simulada do claim, restauração do operador/ACL/fingerprints e `COMMIT` | Elegível porque não houve operação comercial |

## Helper de claim — arquivado para este fluxo; não executar

`scripts/prepare-superadmin-claim.mjs` opera em dry-run por padrão, aceita apenas o project ref TEST,
valida a identidade Auth e preserva todo o restante de `app_metadata`. Não imprime UUID, e-mail,
metadados, chave ou token. Uma escrita exige simultaneamente `--apply` e o gate
`NEXALVO_CLAIM_CHANGE_AUTHORIZED=TEST_ONLY_EXPLICIT`.

O helper não integra mais os passos desta reconciliação. O claim já existe e não pode ser alterado.
As variáveis abaixo descrevem somente a ferramenta histórica e não autorizam sua execução:

- `SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `NEXALVO_SUPERADMIN_USER_ID` (identidade explicitamente autorizada em outro escopo);
- `NEXALVO_CLAIM_OPERATION=GRANT` ou `REMOVE`.

O helper não prova elegibilidade para cutover. A reconciliação atual exige identidades distintas,
sem criar outro SUPERADMIN, trocar o escolhido ou promover o EMPLOYEE a OWNER.

## Sequência exata de autorizações

1. Preservar as duas identidades, claim, perfis e origens existentes. Não criar usuários.
2. Revisar o pacote de reconciliação e confirmar a configuração da Edge já implantada no TEST.
3. Executar o preflight revisado somente leitura. Exigir `PASS_READY_FOR_ATOMIC_CUTOVER` 12/12; qualquer
   drift mantém o bloqueio.
4. **Autorizar especificamente a migração `20261016_platform_admin_TEST.sql` no TEST.** Ela realiza
   o corte em uma transação e não altera Auth.
5. Executar o pós-preflight somente leitura e exigir 20/20.
6. Homologar login SUPERADMIN real e negação real para OWNER, MANAGER, EMPLOYEE e antigo operador.
7. **Autorizar separadamente operações comerciais reversíveis** em uma empresa QA que não seja a
   empresa do SUPERADMIN: licença, revogação, suspensão e reativação. Validar auditoria e ausência de
   acesso tenant durante suspensão.

Rollback exige outra autorização específica: cessar chamadas administrativas, confirmar zero
histórico/estado alterado e recuperação válida, então executar a transação revisada. Ela retira a
autoridade nova antes de restaurar a antiga, com visibilidade atômica no COMMIT. Nunca remover o claim
atual. O marcador retido impede reaplicação cega da migração; uma nova transição exige outro pacote.
