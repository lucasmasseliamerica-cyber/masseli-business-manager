# NEXALVO — revisão do catálogo real do Supabase TEST

Data: 2026-10-17. Branch: `automation/nexalvo-qa-actions`. Projeto confirmado externamente pelo operador: Supabase TEST `msinksoilkluooxenecy`.

O export recebido foi preservado em `qa/evidence/final-homologation-catalog-20261017.json`, com finais de linha normalizados e SHA-256 `9b44bbb97284fdf0e037b23a7dc96126fc5dbe9c17d831ef978552c243abd5a9`. Ele contém somente metadados de catálogo; a varredura local não encontrou senha, token, chave, e-mail ou identidade Auth. Nenhuma consulta de escrita, migração, Edge Function, operação financeira ou deploy foi executado.

## Resultado comprovado

| Verificação | Estado | Evidência |
|---|---|---|
| Projeto alvo | **PASS** | confirmação externa `msinksoilkluooxenecy`; a query não tenta inferir o projeto pelo PostgreSQL |
| Tabelas do contrato | **PASS** | 25/25 existem, 25/25 com RLS, nenhuma com `anon SELECT` |
| Catálogo público | **PASS parcial** | 31 tabelas, 31 com RLS e 53 políticas |
| RPCs do contrato implantadas | **PASS parcial** | 39/39 RPCs existentes têm a assinatura esperada; `fn_manage_staff_profile` é a única das 40 planejadas ausente e pertence à migração ainda não aplicada |
| Execução das RPCs exportadas | **PASS parcial** | 39/39 negam `anon`; 39/39 permitem `authenticated`; todas as 39 são `SECURITY DEFINER` |
| Fingerprint conhecido | **PASS** | `fn_create_sale = aabbddc8a9c4a37a171b8a269e9c3139` |
| Definições e ACLs integrais | **BLOCKED** | zero corpos de função, 12/53 políticas e 25/568 grants constam no primeiro export |
| Migrações preparadas | **BLOCKED / não instaladas** | Storage: 0 bucket/0 políticas; compra: tabela/RPC ausentes; despesa idempotente: tabela/RPC ausentes; Administração Comercial: 0 colunas/0 RPCs/schema privado ausente |

As contagens atuais são 58 funções públicas, 48 `SECURITY DEFINER` e 568 entradas de grants. A evidência anterior registrava 50, 35 e 391. Isso é diferença de inventário entre coletas, não prova criação indevida ou vulnerabilidade; a lista completa é necessária para explicar os objetos adicionais.

## Achados de segurança

1. **Cobertura alta pendente, sem vulnerabilidade comprovada:** o banco possui 48 funções `SECURITY DEFINER`, mas o export detalha somente 39 e não inclui nenhum corpo. Como 39 RPCs do aplicativo são executáveis por `authenticated`, a auditoria precisa confirmar `auth.uid()`, empresa, permissão e ordem das validações no código realmente implantado. Nove funções `SECURITY DEFINER` e dez funções invoker nem sequer são identificadas pelo primeiro export.
2. **Revisão média de `search_path`:** 33/39 RPCs detalhadas usam `search_path=public`; seis usam `search_path=""`. `search_path=public` não constitui exploração por si só. É necessário confirmar que `anon`/`authenticated` não possuem `CREATE` no schema `public` e que referências sensíveis estão qualificadas.
3. **Revisão média das políticas atribuídas a `public`:** oito das doze políticas sensíveis exportadas usam o papel PostgreSQL `public`: `inventory_items` (SELECT/INSERT), `inventory_stock` (SELECT), `products` (INSERT), `sales` (SELECT), `task_activity` (SELECT/INSERT) e `users` (SELECT). RLS não concede privilégio de tabela. O mesmo export registra zero grants para `anon` nessas tabelas e zero `anon SELECT` nas 25 tabelas do contrato, então acesso anônimo não foi demonstrado. Restringir as policies a `authenticated` reduz o risco de um grant futuro ampliar acesso acidentalmente.
4. **Revisão média de bypass pelo proprietário:** as 25 tabelas do contrato têm RLS, mas não `FORCE ROW LEVEL SECURITY`. Isso é compatível com operações privilegiadas do Supabase, porém torna as validações internas das funções `SECURITY DEFINER` obrigatórias. Os proprietários das funções/tabelas ainda não foram exportados.
5. **Grants sensíveis observados:** `authenticated` possui DML direto em `inventory_items` e `products`; as policies exportadas condicionam INSERT/UPDATE à empresa e permissão, e a ausência de policy DELETE produz negação por padrão. `task_activity` tem policy INSERT atribuída a `public`, mas o recorte de grants não contém INSERT para `anon` nem `authenticated`. Isso permanece achado de revisão até a matriz completa confirmar todos os grants e funções que escrevem nessas tabelas.

Nenhum desses alertas foi classificado como vulnerabilidade explorável sem o corpo das funções, ACLs de schema e matriz completa.

## Correções locais realizadas

- O analisador agora entende o envelope JSON real `final_homologation_catalog`; antes ele reportava falsamente as 25 tabelas e 40 funções como ausentes.
- Foram versionadas assinaturas PostgreSQL das 40 RPCs do contrato, detecção de overload, divergência de fingerprint, acesso `anon`, `search_path=public`, policies `public` e cobertura incompleta.
- O export real sanitizado passou a ser uma fixture de regressão.
- Foi preparada `qa/sql/final_homologation_security_definitions_readonly_TEST.sql`, consulta transacional somente leitura para funções completas, owners, ACLs, policies, grants de tabela/coluna, schemas, defaults, colunas, constraints, índices, views, triggers e Storage.
- Os preflights de Storage e Administração Comercial agora usam explicitamente `BEGIN TRANSACTION READ ONLY`, timeout e `ROLLBACK`.
- O rollback preparado da Administração Comercial passou a recusar remoção quando existir histórico de request/idempotência, além do bloqueio já existente para auditoria. A correção evita perda de histórico em código ainda não aplicado.

## Sequência exata de migrações

Cada linha é uma autorização separada. Não avançar duas unidades no mesmo lote.

| Ordem | Unidade | Preflight obrigatório | Aplicação autorizada | Prova e rollback |
|---:|---|---|---|---|
| 0 | Catálogo de segurança | executar `qa/sql/final_homologation_security_definitions_readonly_TEST.sql`; revisar 58 funções, 53 policies, 568 grants, schema ACL e colisões | nenhuma escrita | repetir analisador até remover somente o blocker de definições; arquivar hash do export |
| 1 | Caixa finito, condicional | comparar o corpo exportado de `fn_open_cash_register` com `migrations/20261015_cash_register_finite_guard_TEST.sql` e salvar sua definição anterior exata | aplicar somente se a proteção não estiver implantada | `qa/sql/p0_03_cash_register_finite_rollback_TEST.sql`; rollback restaura a definição anterior revisada |
| 2 | Normalização de despesa, condicional | comparar `fn_create_expense`, confirmar dependência da ordem 1 e salvar sua definição anterior exata | `migrations/20261015_expense_cash_normalization_TEST.sql` | `qa/sql/p0_03_expense_cash_normalization_rollback_TEST.sql`; rollback restaura a definição anterior revisada |
| 3 | Idempotência de despesa | confirmar tabela/RPC ausentes, assinatura base e ordens 1–2 aprovadas | `migrations/20261015_expense_idempotency_TEST.sql`, flag ainda OFF | `qa/sql/p0_03_expense_idempotency_rollback_TEST.sql`; rollback preparado só aceita zero request history |
| 4 | Idempotência de compra | confirmar tabela/RPC ausentes, assinatura/fingerprint da função base e flag OFF | `migrations/20261012_purchase_order_idempotency_TEST.sql` | `qa/sql/p0_05_purchase_lifecycle_rollback_TEST.sql`; rollback preparado só aceita zero request history; compra persistente continua separada |
| 5 | Gestão de equipe | `qa/sql/manage_staff_user_preflight_readonly_TEST.sql`, constraints e grants `service_role` | migração `20261017_manage_staff_user_TEST.sql`; deploy da Edge Function requer autorização própria; nenhum convite | rollback remove somente a RPC e preserva perfil/Auth/auditoria; identidades reais exigem reconciliação manual |
| 6 | Fotos privadas | `qa/sql/product_images_storage_preflight_readonly_TEST.sql`; confirmar `image_url`, `fn_save_product`, bucket/policies ausentes | `migrations/20261016_product_images_storage_TEST.sql` | rollback só remove bucket vazio; upload real/acesso cruzado são autorização posterior |
| 7 | Administração Comercial | `qa/sql/platform_admin_preflight_readonly_TEST.sql`; confirmar sete colunas, três RPCs e schema ausentes; concluir desenho do bloqueio global | `migrations/20261016_platform_admin_TEST.sql`; deploy e SUPERADMIN são autorizações separadas | rollback recusa audit ou request history e não usa `CASCADE`; suspensão global deve ser provada antes da homologação |

Depois de cada aplicação: executar preflight somente leitura, prova transacional específica, regressões locais, CI padrão com feature flag OFF e inspeção de resíduos. Só então considerar uma autorização separada para o fluxo real isolado e sua compensação.

## Evidências locais

| Verificação | Resultado |
|---|---|
| Suíte estática do workflow | **275/275 PASS**, 0 falhas, 0 skips |
| Regressões diretamente afetadas | **36/36 PASS**, 0 falhas, 0 skips |
| Analisador sobre o export real | **BLOCKED correto** somente por `fn_manage_staff_profile` preparada/não implantada e definições integrais ausentes |
| Build Vite | **PASS**, 1.579 módulos; bundle principal 442,06 kB, gzip 119,35 kB |
| Parse das Edge Functions | **PASS**, `manage-staff-user` 14,1 kB e `platform-admin` 8,5 kB |
| Dependências runtime | **PASS**, 0 vulnerabilidades |
| Gate de build/desenvolvimento | **PASS qualificado**, 7 conhecidas: 5 altas, 2 moderadas, 0 críticas |
| [CI #159](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39028110925) | **PASS**, commit `cd49a77`; 12/12 jobs, preflight autenticado e agregador 470/470 PASS, 0 falhas, 0 skips |

A consulta completa foi validada estaticamente como transacional e somente leitura. Esta sessão não possui `psql`, Supabase CLI ou conector SQL para executar sua sintaxe no TEST; sua execução real permanece a próxima evidência somente leitura.

## Informação adicional necessária

Executar no SQL Editor do projeto TEST confirmado o arquivo `qa/sql/final_homologation_security_definitions_readonly_TEST.sql` e fornecer somente o JSON resultante. Não são necessários tokens, senhas ou sessões de usuário. Antes de versionar o resultado, ele deve passar pela verificação de segredos porque contém código fonte das funções.

Esse segundo export é necessário para concluir: corpos das 58 funções; as 53 policies; os 568 grants; owners/ACLs de schemas, funções e tabelas; `CREATE` em `public`; proteção de salários; views; triggers; colunas e constraints; objetos fora do contrato do frontend. Mesmo depois dele, homologações reais MANAGER/EMPLOYEE, Storage, SMTP, SUPERADMIN e fluxos persistentes continuam separadas.
