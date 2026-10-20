# Administração Comercial — reconciliação com identidades distintas

Projeto exclusivo TEST `msinksoilkluooxenecy`, branch `automation/nexalvo-qa-actions`.
Baseline de código: `56588dc108e9c5bf202078abfb866d91acbd0df1`.
Estado: pacote preparado; aplicação e preflight real revisado ainda não aprovados.

## Evidência real recebida e causa

O usuário confirmou preflight oficial **11/12 PASS**, falhando somente em
`claim_matches_active_legacy_operator`: um SUPERADMIN assinado com perfil ativo e papel tenant
EMPLOYEE, diferente do operador legado OWNER ativo sem claim. Não há justificativa para trocar
o SUPERADMIN, conceder outro claim ou promover o funcionário.

A igualdade de identidades era uma premissa do pacote anterior. Foi substituída por uma validação
mais adequada ao modelo autorizado: duas identidades distintas, cada uma válida no seu contexto,
e uma única autoridade operacional depois do COMMIT. Nenhum check foi removido para fabricar PASS.

## Migração final preparada para conferência

Arquivo: [20261016_platform_admin_TEST.sql](../migrations/20261016_platform_admin_TEST.sql).
Rollback: [20261016_platform_admin_rollback_TEST.sql](../migrations/20261016_platform_admin_rollback_TEST.sql).

1. Adquire o mesmo advisory lock do rollback e trava membership legado, Auth e perfis durante
   a transação curta. Há `lock_timeout=10s` e `statement_timeout=60s`; escritas Auth/perfis podem
   esperar até o COMMIT. Programar a execução em uma janela sem chamadas administrativas em curso.
2. Exige exatamente um claim válido e perfil ativo conhecido, independentemente do papel tenant.
   Exige separadamente o único operador ativo, OWNER com Auth/perfil válidos e sem claim SUPERADMIN.
   A ausência de claim no operador e a presença no escolhido comprovam a distinção das identidades.
3. Mantém fingerprints dos oito endpoints legados, helpers tenant, export e hardening aplicado.
   Exige grants legados autenticados íntegros, sem acesso anon/service_role ao plano antigo.
   Verifica novamente colisões e grants de restauração dentro da migração, além do preflight externo.
4. Registra em `nexalvo_private.platform_authority_cutover`, sob RLS e sem acesso API direto,
   o ator SUPERADMIN, seu papel/empresa, o operador antigo, seu papel/empresa e o estado ACTIVE.
   São snapshots independentes; os IDs não aparecem nos relatórios nem nos preflights agregados.
5. O guard privado exige claim ao vivo, perfil ativo e correspondência ao ator desse marcador
   ACTIVE. Um claim posterior em outra identidade não amplia a autoridade.
6. Desativa o operador e revoga os oito endpoints e o USAGE legado na mesma transação que instala
   as novas RPCs. Não há estado confirmado com os dois planos habilitados após o COMMIT.
7. Preserva RLS, máscara salarial, permissões tenant, SECURITY DEFINER/search_path vazio,
   EXECUTE apenas para service_role, campos comerciais server-only e autossuspensão negada
   para a empresa do SUPERADMIN, mesmo quando seu papel tenant é EMPLOYEE.

Os SQLs não atualizam `auth.users`, `public.users`, claims ou papéis tenant. O script histórico
de atribuição de claim **não integra** este procedimento.

## Preflight e pós-preflight

O [preflight oficial](../qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql) mantém **12 checks**.
O terceiro agora se chama `independent_authority_identities_valid`: exige legado OWNER válido,
sem claim, e o único SUPERADMIN distinto. O check do perfil do escolhido também verifica existência
da empresa e papel conhecido. Somente 12/12 pode retornar `PASS_READY_FOR_ATOMIC_CUTOVER`.

Controles adicionais: SQL NULL equivale a falha, funções ausentes não reduzem silenciosamente o
número de checks, e grants inesperados impedem aprovação. Fingerprints históricos não foram trocados.

O [pós-preflight](../qa/sql/platform_admin_single_authority_preflight_readonly_TEST.sql) continua com
**20 checks**. O marcador só é válido quando as duas identidades, seus papéis e empresas estão
preservados e o operador anterior está inativo. Exige cardinalidade completa e não aprova NULL.

O inventário antigo de esquema não dá aprovação de aplicação. O diagnóstico histórico
`authority_models_aligned` informa coincidência de identidade, não elegibilidade para este cutover.

## Recuperação e rollback sem alterar o claim

O rollback é uma operação separada, dependente de autorização e incompatibilidade comprovada.
Ele requer a mesma identidade assinada, perfis/empresas preservados, operador original recuperável,
nenhuma request/auditoria administrativa nova e nenhum estado comercial alterado. Código legado
divergente também bloqueia a restauração.

Na transação: marca ROLLED_BACK, revoga/remove as RPCs novas e restaura somente o operador capturado
e seus grants anteriores. O claim escolhido permanece intacto, mas sozinho não tem backend global
ativo. Somente a autoridade legada restaurada fica operacional após o COMMIT. Falhas intermediárias
desfazem toda a tentativa e preservam a autoridade que estava ativa antes dela.

O marcador privado e o histórico do trigger legado permanecem. O rollback não apaga auditoria e
não usa CASCADE. O schema privado retido bloqueia reaplicação cega: uma nova transição requer
pacote próprio, preservando o histórico. Havendo operação administrativa real, corrigir para frente;
não apagar requests nem auditoria para forçar elegibilidade.

## Validações executáveis

Runner: `node --test qa/platform-admin-postgres.test.mjs`.
O teste roda PostgreSQL 17 em container descartável, com `--network none`, sem portas/volumes ou
credenciais de Supabase. Usa SQLs versionados sem remover nem substituir guards ou fingerprints.

A fixture contém relações mínimas e quinze definições revisadas: oito endpoints legados,
export privado, helpers/facades públicos restaurados e o trigger de auditoria legado real.
As definições foram extraídas dos exports já fornecidos e do hardening aprovado, após varredura
de segredos/PII. JSON bruto e dados de identidades reais não foram versionados. As identidades
são sintéticas; o caso principal usa empresas diferentes para exercitar isolamento adicional.

Casos cobertos: preflight 12/12; aplicação integral; pós-preflight 20/20; contratos runtime 3/3;
preservação byte a byte de Auth/perfis; negação OWNER/MANAGER/EMPLOYEE/operador legado;
RLS tenant e salários; autossuspensão sem efeitos; outro claim fora do marcador negado;
rollback preservando claim/EMPLOYEE e auditoria; segundo SUPERADMIN, troca para OWNER legado,
perfil inativo, função ausente, colisão de RPC e drift de grants bloqueados; falha intermediária
de aplicação e rollback atômicas; histórico administrativo e drift de código bloqueiam rollback.

O runner foi corrigido para aguardar o listener TCP final do PostgreSQL dentro do container.
A primeira sonda por socket podia encontrar o servidor temporário de initdb e falhar com
`the database system is shutting down`. Nenhuma asserção foi ignorada para resolver essa corrida.

## Execução real e próxima autorização

- **Não aplicado:** nenhum DDL, rollback, claim, usuário, licença, suspensão, deploy ou operação
  financeira foi executado no TEST nesta entrega.
- **Preflight real revisado BLOQUEADO nesta sessão:** o usuário selecionou habilitar integração SQL
  de leitura, mas ainda não existe ferramenta SQL callable nem conexão segura SQL disponível.
  A chave service_role presente atende Auth/PostgREST, não consultas ao catálogo PostgreSQL.
  Não confundir essa limitação da sessão com indisponibilidade global do Supabase.
- Executar primeiro o arquivo oficial revisado no TEST e retornar somente seu agregado. O resultado
  anterior 11/12 não é reaproveitado como aprovação do SQL novo. Exigir **12/12 PASS**, com zero falhas.
- Somente então conferir a migração final acima e solicitar autorização específica de aplicação
  do seu SHA/arquivo exclusivamente no TEST. Não aplicar antes da aprovação do pacote e desse resultado.
- Depois de aplicação autorizada, exigir pós-preflight real 20/20 e runtime 3/3; homologar leitura
  de empresas/licenças com sessão SUPERADMIN e negações de perfis reais. Nenhuma operação comercial
  de escrita está incluída nessa homologação de leitura.

## Resultado local final

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Regressões afetadas | APROVADO 80/80, zero falhas/skips | `node --test qa/platform-admin-postgres.test.mjs qa/platform-admin-backend.test.mjs qa/platform-admin-foundation.test.mjs qa/private-security-catalog.test.mjs qa/final-homologation-package.test.mjs qa/security.test.mjs` |
| Integração PostgreSQL real descartável | APROVADO 16/16, incluídos no total acima | Migration, rollback e preflights originais, sem substituição de fingerprints ou bypass |
| Caso estrutural EMPLOYEE/OWNER distintos | APROVADO local 12/12 + 20/20 + 3/3 | Auth/perfis byte-idênticos antes/depois; marcador separado e trigger legado exercitados |
| Build Vite | APROVADO | 1579 módulos; bundle principal 445,55 kB |
| Bundle Edge, sem publicar | APROVADO | esbuild executado localmente |
| Manifesto do pacote e `git diff --check` | APROVADO | Artifacts resolvidos e sem erros de patch |
| Varredura de segurança | APROVADO | Zero credenciais reais/PII novos; único token sintético já existente pertence ao teste intencional do scanner |
| Preflight revisado no TEST | BLOQUEADO | Integração SQL ainda não callable; não declarar 12/12 real |

Os hashes dos quatro SQLs revisados estão na
[evidência sanitizada](../qa/evidence/platform-admin-distinct-identities-20261020.json).
## Publicação e CI verificadas

- Código publicado exclusivamente na QA: commit
  [`cfad62d`](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/commit/cfad62d).
- [CI #179](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39423217938):
  **SUCCESS**, 2m24s, **12/12 jobs PASS**, nenhum job falho ou ignorado.
- [Agregador real](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39423217938/job/118630143972):
  literalmente **525/525 PASS; 0 FAIL; 0 SKIPPED**. Inclui a integração PostgreSQL descartável
  adicionada ao workflow, sem acesso de escrita ao TEST.
- O job `authenticated-preflight` da CI cobre as fixtures QA existentes, não o preflight SQL
  administrativo revisado de 12 checks. O status deste último permanece **BLOQUEADO nesta sessão**.
- A atualização documental posterior registra a evidência sem alterar o SQL aprovado pela CI
  nem executar novamente a baseline.
