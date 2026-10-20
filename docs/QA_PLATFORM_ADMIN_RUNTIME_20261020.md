# Administração Comercial — diagnóstico real de configuração TEST

Branch exclusiva `automation/nexalvo-qa-actions`; baseline analisada `25d4038`.
Projeto TEST `msinksoilkluooxenecy`. Evidência sanitizada:
[platform-admin-runtime-20261020.json](../qa/evidence/platform-admin-runtime-20261020.json).
Nenhum segredo, identificador de identidade, e-mail, token ou resposta de dados foi salvo.

## Resultado real

| Verificação | Resultado | Evidência e limite |
| --- | --- | --- |
| Branch local/remota | PASS | Ambas em `25d403808a37d05ab11ce4e92a27d1cf1c4b2da5` antes das correções |
| Credencial de serviço TEST | PASS | Consulta Auth Admin somente leitura autenticada; valor nunca impresso |
| SUPERADMIN ativo | PASS | Inventário Auth completo: exatamente 1 identidade com `app_metadata.nexalvo_platform_role=SUPERADMIN`, não anônima/excluída/banida |
| Perfil de aplicação | PASS | Consulta filtrada de `public.users`: exatamente 1 perfil ativo correspondente; vínculo ao operador legado ainda não verificado pelo catálogo |
| CORS local | PASS | OPTIONS HTTP 204 com `Access-Control-Allow-Origin` exatamente `http://127.0.0.1:5173` |
| CORS desconhecido | PASS | Origem de controle negada: HTTP 403 `ORIGIN_DENIED` |
| Configuração Edge | FALHOU | POST de leitura, com chave pública e sem sessão de usuário: HTTP 503 `PLATFORM_NOT_CONFIGURED`, com e sem Origin |
| RPCs novas | BLOQUEADO | As três não aparecem no OpenAPI `service_role`; probes GET somente leitura retornaram 404 `PGRST202` |
| Secrets Edge / variáveis reservadas | BLOQUEADO | Sem integração Supabase de gestão ou `SUPABASE_ACCESS_TOKEN` nesta sessão. A chave de serviço Auth/PostgREST não concede gestão de Edge Secrets |
| Catálogo de assinaturas e grants efetivos | BLOQUEADO | Sem acesso SQL. `PGRST202` não distingue sozinho migração ausente, assinatura divergente, cache ou permissões |
| Painel com sessão SUPERADMIN real | BLOQUEADO | Não há sessão autenticada de usuário disponível nesta execução; a chave de serviço não é uma sessão de usuário |

O gate de configuração exige `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` e `NEXALVO_ALLOWED_PROJECT_REF` consistente com a URL.
O erro real comprova que esse conjunto não está válido no runtime Edge, mas não comprova
qual Secret está ausente ou divergente sem inventário de gestão. Não remover o gate.

## Correções e automação preparadas

- O cliente preserva HTTP status e código do erro Edge. O painel diferencia configuração,
  dependência de banco, sessão expirada, autorização e origem, com mensagens PT/EN.
- `scripts/configure-platform-admin-test.mjs` usa exclusivamente o projeto TEST e exige branch QA
  no CLI. Dry-run é o padrão. Requer acesso de gestão, verifica os nomes das três variáveis de
  serviço e testa a origem por OPTIONS antes de qualquer alteração.
- O modo `--apply` pode cadastrar somente os Secrets de configuração ausentes
  `NEXALVO_ALLOWED_PROJECT_REF` e, apenas se a allowlist inteira estiver ausente,
  `PLATFORM_ADMIN_ALLOWED_ORIGINS`. A origem já funciona no TEST; portanto, deverá ser preservada.
- Se existir uma allowlist e a origem não funcionar, o helper bloqueia para uma união segura
  com o valor existente. Ele nunca substitui origens legítimas às cegas. Também não sobrescreve
  um marcador de projeto existente e divergente sem inspeção específica.
- O helper verifica novamente o CORS após uma atualização. Uma resposta de escrita aceita não
  é considerada prova da configuração ativa. A sonda anônima comprova no máximo configuração
  e negação de acesso, nunca homologação do painel.
- `qa/sql/platform_admin_runtime_preflight_readonly_TEST.sql` compara as três assinaturas,
  nomes de argumentos, volatilidade, SECURITY DEFINER, search_path vazio, presença do guard de
  claim e EXECUTE efetivo de service_role/anon/authenticated/PUBLIC. Tolera RPCs inexistentes e
  retorna agregado explícito. Não substitui revisão dos corpos nem o pós-cutover de 20 checks.

## Validações desta entrega

- Regressões afetadas de Administração Comercial, autenticação, recuperação, gestão de funcionários,
  interface e segurança: **95/95 PASS, 0 FAIL, 0 SKIPPED**. Comando:
  `node --test qa/platform-admin-backend.test.mjs qa/platform-admin-foundation.test.mjs qa/auth-core-regression.test.mjs qa/security.test.mjs qa/manage-staff-user.test.mjs qa/password-recovery-regression.test.mjs qa/ui-responsive-regression.test.mjs`.
- Build Vite e bundle da Edge Function: PASS; nenhuma função foi publicada.
- SQL em PostgreSQL 17 descartável: 4/4 cenários PASS — funções ausentes bloqueiam; três contratos
  válidos passam; EXECUTE indevido para authenticated bloqueia; search_path não vazio bloqueia.
  Fixtures sintéticas locais; não equivalem a implantação TEST.
- Execução real do configurador em dry-run: `BLOCKED / MANAGEMENT_ACCESS_UNAVAILABLE`, `changed=[]`.
  Não houve escrita remota, migração, rollback, alteração de Auth, deploy ou operação comercial.
- `git diff --check`, sintaxe do helper, igualdade das cópias App, preservação do re-export i18n
  da raiz e varredura contra credenciais do ambiente/padrão JWT: PASS, nenhum segredo encontrado.
- CI histórica #175 (`39282742007`, `25d4038`) foi consultada e terminou SUCCESS.
  A execução manual mais recente #177 (`39290656209`) também aparece SUCCESS. Não se atribuem
  contagens de testes a essas execuções sem recontagem de logs nem às correções desta entrega.

## Procedimento para eliminar os bloqueios

1. Disponibilizar acesso de gestão autorizado ao TEST por integração ou pelo ambiente seguro
   de execução, com destino HTTPS `api.supabase.com`. Não usar service_role como token de gestão,
   não colocar valores no CLI, nos arquivos, em logs ou no Git. Os valores não devem ser enviados
   pelo chat. O configurador não lê nem registra os valores dos Secrets Edge.
2. Executar `node --use-env-proxy scripts/configure-platform-admin-test.mjs`. Revisar o agregado.
   Se estiver READY, executar com `--apply` no escopo de configuração expressamente autorizado.
   Nenhuma migração ou publicação de função é executada por esse helper.
3. Executar o novo diagnóstico SQL somente leitura para distinguir ausência real de RPCs de
   divergência de assinatura, grants ou cache. Se houver drift, reconciliar antes de qualquer DDL.
4. Se o cutover não tiver sido aplicado, executar
   `qa/sql/platform_admin_cutover_preflight_readonly_TEST.sql` e exigir 12/12 PASS.
   Validar especialmente a correspondência do único SUPERADMIN ao único operador ativo.
5. **Somente com nova autorização específica**, aplicar
   `migrations/20261016_platform_admin_TEST.sql`. O plano e a compensação estão em
   [QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md).
   O rollback preparado é `migrations/20261016_platform_admin_rollback_TEST.sql`; não executá-lo
   automaticamente, pois exige ausência comprovada de histórico comercial e remoção prévia do claim.
6. Exigir o pós-cutover somente leitura de 20/20 e o diagnóstico de runtime de 3/3 contratos.
7. Com sessão SUPERADMIN existente, testar apenas `list_businesses` e `list_audit_logs` pelo painel.
   Não criar outra identidade nem modificar claims. Registrar contagens agregadas e carregar
   empresas/licenças reais para homologar a leitura; não conceder/revogar licença nem suspender empresa.

Administração Comercial permanece aberta até os passos reais serem comprovados.
