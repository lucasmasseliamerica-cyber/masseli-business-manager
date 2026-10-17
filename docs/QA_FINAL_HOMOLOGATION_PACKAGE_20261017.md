# NEXALVO — pacote integrado de homologação final

Data: 2026-10-17. Escopo: branch `automation/nexalvo-qa-actions`, Supabase TEST `msinksoilkluooxenecy`. HEAD inicial revisado: `c601665c30b94ba65ade97f716e54643fa2f4164`.

Nenhuma migração, Edge Function, upload, compra, operação financeira, alteração de Auth, deploy ou escrita no Supabase foi executada. `main` e produção permaneceram intocados.

## Resultado deste avanço

O repositório agora possui um pacote executável que separa o contrato esperado pelo aplicativo, as evidências já disponíveis e o estado realmente implantado:

- `qa/final-homologation-manifest.mjs`: inventário com hashes SHA-256 de 8 fontes de schema e 8 unidades de entrega, dependências, flags, autorização exigida e analisador do catálogo implantado;
- `qa/sql/final_homologation_catalog_readonly_TEST.sql`: export único, transacional e somente leitura de contagens, RLS, grants, funções, fingerprints, migrações, Storage e objetos sensíveis;
- `qa/Invoke-FinalHomologationPreflight.ps1`: entrada segura para Windows; valida a branch, o pacote local, um export opcional e pode delegar ao preflight OWNER A/B existente;
- `qa/final-homologation-package.test.mjs`: regressões que impedem execução de escrita pelo preflight, inferência indevida de implantação, ordem incorreta e rollback que apague histórico;
- comando `npm run qa:final-package` e integração das regressões na CI padrão.

O SQL deliberadamente retorna `project_ref_external_assertion = null`. PostgreSQL não consegue provar o project ref do painel Supabase. O analisador só aceita o catálogo após `--assert-test-project`, que representa a confirmação externa de que o operador selecionou `msinksoilkluooxenecy`. Sem isso, o estado é `BLOCKED`.

## Contrato esperado e evidência implantada

O frontend e seus limites de servidor dependem de 25 tabelas públicas, 40 funções/RPCs, 2 Edge Functions e 1 bucket privado. Os nomes estão versionados no manifesto. Isso não afirma que são os únicos objetos do banco: a evidência anterior registra 31 tabelas públicas com RLS, 53 políticas, 50 funções, 391 entradas de grants e 35 alertas relacionados a `SECURITY DEFINER`.

Essas contagens vieram da integração aprovada, mas as definições completas ainda não foram fornecidas. O pacote registra `catalogDefinitionsSupplied: false`; portanto, as 53 políticas, os grants efetivos e os corpos das 50 funções continuam pendentes de comparação real. Um alerta `SECURITY DEFINER` é tratado como achado para revisão, não como vulnerabilidade comprovada.

| Unidade | Estado comprovado | Dependência antes de avançar |
|---|---|---|
| Caixa obrigatório em venda Cash | `deployed_test` | fingerprint documentado `aabbddc8a9c4a37a171b8a269e9c3139`; manter regressão |
| Valores finitos na abertura de caixa | `prepared_unapplied` | snapshot revisado da definição atual + autorização de migração TEST |
| Normalização/consistência de despesa Cash | `prepared_unapplied` | unidade anterior + snapshot revisado de `fn_create_expense` |
| Idempotência de despesa | `prepared_unapplied`, flag desligada | normalização de despesa implantada e validada |
| Idempotência de compra | `prepared_unapplied`, flag desligada | catálogo revisado + autorização de migração TEST |
| Gestão de contas da equipe | `prepared_unapplied` | catálogo revisado, migração, deploy e convite TEST específico autorizado |
| Fotos privadas de produtos | `prepared_unapplied` | preflight de `products.image_url`/`fn_save_product`, autorização e fixture isolada |
| Administração Comercial | `prepared_unapplied` | catálogo revisado, migração, deploy, SUPERADMIN TEST e bloqueio global de suspensão |

Os sete SQLs-fonte históricos (`08` a `14`) e a migração de referência de receita são classificados como `source_snapshot_deployment_not_inferred`. Ter o arquivo no Git não prova que o objeto correspondente está implantado.

## Correção confirmada durante a revisão

A migração ainda não aplicada de compras comparava apenas `md5(payload)`. Ela agora armazena `request_payload jsonb` e compara o payload canônico completo com `IS DISTINCT FROM`, mantendo lock por `(business_id, request_id)`, autorização antes da reserva e transação explícita. Isso elimina a decisão de replay baseada em digest com possibilidade de colisão.

Foram acrescentados rollbacks de idempotência de compra e despesa. Ambos recusam execução quando existe qualquer chave de request, preservando o histórico de replay. As migrações que substituem `fn_open_cash_register` e `fn_create_expense` não receberam um rollback inventado: antes de aplicá-las é obrigatório exportar e revisar a definição implantada, que será o rollback exato.

Também foi implementado o backend ausente de `manage-staff-user`. A Edge Function revalida a sessão, busca o perfil do ator pelo servidor, exige OWNER ou override explícito `manageUsers`, valida contrato/role/permissões/origem e mantém a chave privilegiada fora do navegador. O RPC preparado é `SECURITY INVOKER`, executável somente por `service_role`, limita a empresa, protege o último OWNER, impede vínculo ativo duplicado e grava perfil + auditoria na mesma transação. Em falha definitiva do perfil após convite, a identidade recém-criada é compensada; em perda de resposta após possível commit, nada é apagado ou repetido e o serviço retorna um código de reconciliação. Migração, deploy e convite real não foram executados.

## Ordem operacional protegida

1. Rodar as regressões locais e confirmar branch/HEAD.
2. Selecionar externamente o projeto TEST exato e executar `qa/sql/final_homologation_catalog_readonly_TEST.sql`.
3. Revisar o resultado, o export canônico completo de segurança e colisões de objetos.
4. Autorizar separadamente uma única unidade de migração.
5. Aplicar somente essa unidade, executar seu preflight/prova transacional e a CI com a flag desligada.
6. Habilitar uma única flag no TEST e executar o fluxo real isolado autorizado.
7. Executar compensação, comprovar ausência de efeito financeiro/estoque ativo e preservar auditoria.

No Windows, depois de salvar o JSON da consulta em local seguro:

```powershell
.\qa\Invoke-FinalHomologationPreflight.ps1 `
  -CatalogExportPath C:\caminho\catalogo-test.json `
  -ConfirmTestProject `
  -AuthenticatedOwners
```

O runner não recebe segredo por argumento, não executa `psql`, Supabase CLI, migração, deploy ou o teste persistente P0.05. O PowerShell não está instalado nesta sessão Linux; o contrato do script foi validado estaticamente e sua execução permanece para o notebook Windows.

## Evidências locais

| Verificação | Resultado | Evidência |
|---|---|---|
| Regressões estáticas integrais | **PASS** | 274/274, 0 falhas, 0 skips |
| Regressões afetadas de gestão de equipe/UI/configuração/segurança | **PASS** | 33/33 |
| Build Vite | **PASS** | 1.579 módulos; bundle principal 441,34 kB; build concluído |
| Dependências de runtime | **PASS** | `npm audit --omit=dev`: 0 vulnerabilidades |
| Política de dependências de build | **PASS qualificado** | 7 entradas conhecidas: 5 altas, 2 moderadas, 0 críticas; nenhum alerta novo |
| Espelho `App.jsx`/`src/App.jsx` | **PASS** | arquivos byte a byte iguais |
| Inventário local/hashes/ordem | **PASS** | 30 artefatos localizados e hashados |
| Catálogo implantado | **BLOCKED** | export completo do TEST não fornecido nesta sessão |
| Migrações/Storage/Admin reais | **BLOCKED** | exigem catálogo e autorização específica |
| Compra persistente/financeiro real | **BLOCKED** | continua desabilitado e não autorizado |
| MANAGER/EMPLOYEE, SMTP/recovery e SUPERADMIN reais | **BLOCKED** | identidades/sessões ou serviço implantado ainda ausentes |

## Pendências que o pacote não pode declarar concluídas

- comparação linha a linha das 53 políticas, 50 funções e grants efetivos;
- comprovação de `auth.uid()`, ordem de autorização, `search_path` e isolamento no código realmente implantado;
- desenho do bloqueio global de `platform_status = SUSPENDED` a partir do catálogo real, sem substituir `current_business_id()` às cegas;
- aplicação autorizada e homologação real das migrações financeiras, Storage e Administração Comercial;
- upload/substituição/remoção e negação cruzada reais no Storage;
- compra persistente por interface, compensação e concorrência;
- migração/deploy do `manage-staff-user`, convite real, reconciliação de Auth e sessões MANAGER/EMPLOYEE;
- recovery SMTP e identidade SUPERADMIN TEST;
- Stripe Terminal/webhook, impressora, SMTP, telemetria externa, backup/restauração e piloto comercial.

A baseline #157 permanece a última prova integral publicada anterior a este pacote: 12/12 jobs e 456/456 PASS. Uma nova CI só pode ser atribuída a esta alteração depois do commit, push e inspeção do run correspondente.
