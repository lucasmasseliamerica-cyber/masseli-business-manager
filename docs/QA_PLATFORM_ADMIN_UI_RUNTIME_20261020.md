# Administração Comercial — implantação e diagnóstico da interface

Somente branch `automation/nexalvo-qa-actions` e TEST `msinksoilkluooxenecy`.
Baseline: `05cd84e0de3ca2ecc8625b38e6c26649e7330885`.
[CI #179](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39423217938):
12/12 jobs, 525/525 PASS; evidência anterior às alterações desta entrega.

## Estado implantado

O usuário confirmou aplicação autorizada de `20261016_platform_admin_TEST.sql`, pós-preflight
**20/20 PASS** e contratos RPC **3/3 PASS**. São resultados recebidos do usuário; o SQL não foi
reexecutado nesta sessão. Não reaplicar migração, cutover, claim ou rollback. O manifesto registra
`deployed_test`, preservando o bloqueio separado de homologação da Edge.

## Leituras reais desta sessão

[Evidência agregada sem PII](../qa/evidence/platform-admin-ui-runtime-20261020.json).

| Verificação | Resultado | Evidência e limite |
| --- | --- | --- |
| Origem `http://127.0.0.1:5173` | PASS | OPTIONS 204, allow-origin exato |
| Origem desconhecida | PASS | OPTIONS 403, ORIGIN_DENIED, sem allow-origin |
| Configuração Edge | BLOCKED | POST de leitura 503 PLATFORM_NOT_CONFIGURED |
| JWT falso | PASS | Gateway 401; não prova autorização interna da Edge |
| Inventário Auth | PASS | Paginação completa, um SUPERADMIN assinado ativo |
| Perfil correspondente | PASS | Ativo, papel tenant EMPLOYEE preservado |
| RPC de empresas | PASS | GET com credencial de servidor: HTTP 200, três empresas/NONE |
| RPC de auditoria | PASS | GET com credencial de servidor: HTTP 200, zero eventos |
| Contratos no OpenAPI | PASS | As três RPCs administrativas estão publicadas |
| Ator inexistente em RPC de leitura | PASS | HTTP 403, SQLSTATE 42501 |
| Gestão dos Secrets | BLOCKED | Sem integração de gestão ou SUPABASE_ACCESS_TOKEN nesta sessão |
| Leituras Edge com sessão SUPERADMIN | BLOCKED | Configuração falha e sessão segura de usuário indisponível |
| Carregamento real do painel | BLOCKED | Sem evidência autenticada de ponta a ponta |

GET de RPC com credencial de servidor exercita a autorização de ator no banco; **não equivale**
ao JWT de usuário passando pela Edge. `fn_platform_admin_execute` não foi chamada.
Nenhuma conta, claim, licença, evento administrativo ou estado comercial foi alterado.

## Correções funcionais

- Desktop e menu móvel compartilham `AccountAccessSummary`: SUPERADMIN em destaque e papel da
  empresa separado. Configurações também distingue acesso global de papel tenant.
- EMPLOYEE continua EMPLOYEE; `can()`, permissões, Auth, claims e carregamento de perfil inalterados.
  OWNER comum e metadados editáveis não recebem identificação global.
- PT/EN cobre navegação, painel, licenças, estados, auditoria, feedback e confirmações interpoladas.
  Nomes de empresas ficam intactos/escapados pelo React; códigos enviados às RPCs não mudam.
- `scripts/verify-platform-admin-readonly-test.mjs` valida projeto exato, CORS, negação anônima,
  sessão assinada/perfil ativo e as duas leituras Edge. Sem mutações, credenciais em argv ou PII.

## Intervenção indispensável e procedimento

Esta sessão não pode listar/alterar Secrets Edge. `service_role` permite Auth Admin/PostgREST,
mas não substitui gestão do projeto. Não encaminhar essa chave à Management API.

No Dashboard do **TEST**, Edge Functions → Secrets:

1. Conferir `NEXALVO_ALLOWED_PROJECT_REF=msinksoilkluooxenecy`; adicionar se ausente ou corrigir
   apenas esse valor não sensível se divergente.
2. Preservar `PLATFORM_ADMIN_ALLOWED_ORIGINS` e origens legítimas. A origem local exata já funciona;
   a evidência atual não exige alterar CORS.
3. Conferir presença/configuração reservada de SUPABASE_URL, SUPABASE_ANON_KEY e
   SUPABASE_SERVICE_ROLE_KEY do TEST, sem sobrescrever Secrets reservados.
   O 503 é genérico: sem inventário, não se pode atribuí-lo exclusivamente ao marcador.
4. Alternativa: habilitar gestão dos Secrets do TEST por integração segura. O helper existente
   `scripts/configure-platform-admin-test.mjs` faz dry-run e configura somente não sensíveis
   ausentes; nunca sobrescreve allowlist existente ou Secrets reservados. Dry-run atual:
   BLOCKED MANAGEMENT_ACCESS_UNAVAILABLE, zero alterações.

Não enviar credenciais, sessões, e-mails ou UUIDs pelo chat. Após corrigir configuração, utilizar
a sessão SUPERADMIN existente no navegador local ou em execução segura. O runner lê
NEXALVO_PLATFORM_ADMIN_ACCESS_TOKEN somente do ambiente seguro e usa URL/chave pública TEST:
`node scripts/verify-platform-admin-readonly-test.mjs`.
Nesta sessão Node 24 precisa de `--use-env-proxy` para o proxy de saída autorizado. Sem proxy,
DNS direto retornou EAI_AGAIN; com proxy, CORS PASS e 503 BLOCKED. Não desativar TLS.

## Validação e homologação

Regressões afetadas verificam renderização React PT/EN, permissões EMPLOYEE, confirmações seguras,
contratos e guards do runner. HTTP simulado e renderização local não homologam o painel real.
Regressões locais finais: **109/109 PASS, 0 FAIL, 0 SKIPPED** em oito arquivos afetados.
Build Vite, sintaxe do runner, inventário de artefatos e `git diff --check`: PASS. [CI #180](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39427759096)
confirmada **12/12 jobs, 539/539 PASS, 0 FAIL, 0 SKIPPED**, incluindo preflight OWNER A/B
e browser-smoke. Código publicado: `ef193ddda8580467527db1e7428c4f4d5b5c56df`.
[Agregado verificável](./evidence/platform-admin-ui-ci180-20261020.json), fonte: job qa-summary.
O preflight OWNER A/B não valida a sessão SUPERADMIN nem remove o 503. Nenhum macro comercial foi concluído.
