# NEXALVO — Auditoria definitiva do catálogo SQL do TEST

Data: 2026-10-17
Branch: `automation/nexalvo-qa-actions`
Alvo exclusivo: Supabase TEST `msinksoilkluooxenecy`
Estado: **auditoria pública concluída; correções preparadas e não aplicadas; schemas privados bloqueados por export adicional**

## Cadeia de evidência e sanitização

O segundo export foi recebido fora da árvore Git, com 1.743.006 bytes e SHA-256
`a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f`. O JSON é válido,
contém uma linha e declara `security_definitions_complete=true`.

A varredura recursiva encontrou zero chaves privadas, JWTs, chaves secretas Supabase, chaves AWS,
URIs com credenciais, segredos atribuídos em literais e endereços de e-mail. O original com corpos
integrais não foi versionado. A evidência derivada em
`qa/evidence/final-homologation-security-sanitized-20261017.json` contém fingerprints, sinais de
segurança, policies e matrizes de grants; nenhum corpo de função foi retido.

| Prova | Resultado |
|---|---:|
| Tabelas públicas / RLS habilitado | 31 / 31 |
| Policies públicas | 53 |
| Funções públicas / `SECURITY DEFINER` | 58 / 48 |
| Grants de tabela / coluna | 568 / 3.547 |
| Índices / constraints / triggers | 114 / 196 / 5 |
| Views públicas / policies Storage | 0 / 0 |
| `anon` com EXECUTE efetivo nas 58 funções | 0 |
| Grants de tabela para `anon` | 0 |
| `anon` ou `authenticated` com CREATE em `public` | 0 |
| Owners de funções | 58 `postgres`; nenhum papel desconhecido |

## Vulnerabilidades comprovadas

### SEC-CAT-01 — leitura direta de salário e registros de RH — alta

`authenticated` possui `SELECT` de tabela em `employees`, incluindo a coluna `hourly_rate`. A policy
`employees_select`, atribuída a `public`, aceita qualquer linha cuja empresa seja
`current_business_id()`. Assim, um EMPLOYEE autenticado pode ignorar a redação de
`fn_read_employees_secure()` e consultar salários de toda a empresa pela API. A mesma leitura traz
notas e registros de funcionários que a interface tenta limitar a OWNER/gestores e subordinados.

Correção local:

- o frontend passou a carregar funcionários exclusivamente por `fn_read_employees_secure()`;
- escritas pedem apenas `id` na representação e usam `updated_at` como versão de concorrência,
  para continuarem compatíveis com ACL por coluna sem retirar a detecção de edição simultânea;
- a migração preparada remove o `SELECT` direto de `hourly_rate`;
- o facade e a policy passam a retornar todos para OWNER/`manageUsers`, o próprio registro e, para
  MANAGER, seus subordinados diretos;
- rollback restaura exatamente a definição e o grant observados no export.

### SEC-CAT-02 — referência de fornecedor entre empresas — média

`inventory_items.supplier_id` possui FK simples para `suppliers(id)`. `authenticated` possui INSERT e
UPDATE e as policies de estoque validam a empresa do item, mas não a empresa do fornecedor. Um ator
com `adjustInventory` e conhecimento de um UUID externo consegue criar uma referência multiempresa
inconsistente.

Correção preparada: trigger `SECURITY DEFINER`, com `search_path` vazio e sem EXECUTE de API, rejeita
fornecedor cuja empresa difere de `NEW.business_id`. O rollback remove somente a trigger e a função
criadas por esse patch.

### SEC-CAT-03 — enumeração de perfis sem `manageUsers` — média

A policy `users_select` permite que todo usuário autenticado leia todos os perfis da própria empresa,
incluindo usernames, papéis e overrides. Isso contraria o contrato de `manageUsers` usado pelo
aplicativo. A correção preparada mantém a leitura do próprio perfil, necessária ao login, e exige
`manageUsers` para os demais perfis.

## Riscos condicionais e divergências

- **40 `SECURITY DEFINER` usam `search_path=public`.** Todas as 48 possuem `search_path` explícito;
  oito usam caminho vazio. Não há exploração comprovada porque as roles de API não possuem CREATE em
  `public`, e não foi encontrado SQL dinâmico ou `SET ROLE`. Recomenda-se migrar gradualmente para
  caminho vazio com nomes totalmente qualificados.
- **41 definers são executáveis por `authenticated`.** Todos contêm sinal explícito de `auth.uid()`,
  `current_business_id()`, `user_can()` ou `fn_user_controls_employee()` antes da primeira mutação.
  Sete helpers são restritos a serviço. Isso reduz o alerta, mas não substitui testes reais por papel.
- **21 policies estavam atribuídas a `public`.** Nenhuma é explorável por `anon` no estado exportado,
  pois não existe grant de tabela para `anon`. O patch altera as 21 para `authenticated`, eliminando
  dependência entre policy e ACL futura.
- **Default ACL de funções.** Objetos futuros criados por `postgres` ou `supabase_admin` em `public`
  recebem EXECUTE para `anon` e `authenticated`. As 58 funções atuais revogam `anon`, portanto o risco
  é futuro. O patch revoga o default de `postgres`; o default de `supabase_admin` permanece bloqueado
  até confirmar a autoridade que aplicará a alteração.
- **Wrappers privados sem definição.** `fn_platform_*` chama `nexalvo_platform.*` e
  `fn_export_business_data` chama `nexalvo_backup.*`. O export público não contém corpos, ACLs,
  relations ou policies desses schemas. A auditoria desses cinco endpoints permanece BLOQUEADA.
- **Fonte versionada incompleta.** Apenas 8 dos 58 nomes implantados possuem alguma definição em SQL
  versionado após esta entrega; 50 não possuem origem reproduzível no repositório. Quatro candidatos
  têm corpo normalizado idêntico ao implantado. `fn_cancel_purchase_order` difere apenas em formato;
  `fn_receive_manual_stock` contém guard finito implantado ausente do snapshot antigo;
  `fn_open_cash_register` e `fn_create_expense` divergem porque as versões endurecidas continuam
  preparadas e não aplicadas.
- **Idempotência ausente no TEST.** Os marcadores confirmam ausência das tabelas/RPCs de idempotência
  de compra e despesa. Reenvio após perda de resposta continua sendo risco operacional até migração e
  homologação controlada.
- **Storage e Administração Comercial preparados, não implantados.** Bucket privado, quatro policies
  Storage, schema `nexalvo_private`, colunas de licença e três RPCs administrativos estão ausentes.

## Achados que não são vulnerabilidades no estado observado

- `business_counters` tem RLS e nenhuma policy, mas também não concede acesso a `anon` nem
  `authenticated`; apenas `postgres` e `service_role` têm grants.
- `task_activity_write` é atribuída a `public`, mas `authenticated` não possui INSERT direto. As
  escritas ocorrem pelos RPCs definers revisados.
- Nenhuma função pública tem EXECUTE efetivo para `anon`; nenhuma tabela pública concede acesso direto
  a `anon`; não existe papel desconhecido nos grants exportados.
- `current_business_id()` retorna NULL para identidade ausente/inativa. Comparações de tenant falham
  fechadas, e `user_can()` retorna `false` quando o perfil ou a permissão não existe.
- Os cinco triggers exportados estão ativos. A proteção de salário, referências de funcionário e
  receita, prevenção de autoelevação e validação de overrides estão ligadas às tabelas esperadas.

## Comparação e integridade estrutural

As assinaturas do contrato do aplicativo e o fingerprint de `fn_create_sale`
`aabbddc8a9c4a37a171b8a269e9c3139` permanecem compatíveis. Não há overload inesperado nas funções do
contrato. Foram confirmadas 78 CHECKs, 81 FKs, 31 PKs e seis UNIQUEs. Os constraints finitos cobrem os
principais valores de venda, compra, estoque e salário.

A análise das 53 policies confirmou isolamento por `current_business_id()` ou relacionamento com uma
linha pai da mesma empresa. O defeito de coluna em `employees` e o FK de fornecedor são as exceções
comprovadas descritas acima. Exposição financeira por `sales`, `cash_registers` e
`purchase_orders` exige decisão de produto: esses dados são necessários em partes operacionais, mas
as roles sem `viewFinancials` ainda conseguem consultar alguns campos pela API. Isso permanece risco
condicional até a matriz real MANAGER/EMPLOYEE definir o contrato de cada coluna.

## Artefatos preparados, sem escrita no TEST

- `qa/audit-final-security-catalog.mjs`: valida envelope/projeto, bloqueia segredo/PII e gera evidência
  sem corpos de função.
- `migrations/20261017_catalog_security_hardening_TEST.sql`: correções com fingerprint/preflight e
  transação única.
- `migrations/20261017_catalog_security_hardening_rollback_TEST.sql`: compensação exata do estado
  exportado.
- `qa/sql/catalog_security_hardening_preflight_readonly_TEST.sql`: oito verificações pós-aplicação.
- `qa/sql/final_homologation_private_security_definitions_readonly_TEST.sql`: export adicional dos
  schemas privados referenciados.
- `qa/sql/final_homologation_permission_defaults_readonly_TEST.sql`: export da matriz global de
  defaults, sem tenant/auth rows.

## Regressão local

| Verificação | Resultado |
|---|---|
| Suíte estática equivalente ao job CI | **281/281 PASS, 0 FAIL, 0 SKIP** |
| Build Vite | **PASS**, 1.579 módulos |
| Bundle das duas Edge Functions | **PASS** |
| `npm audit --omit=dev --audit-level=moderate` | **PASS, 0 runtime** |
| Política de auditoria completa | **PASS no teto conhecido: 7 dev/build, 5 high + 2 moderate** |
| Testes autenticados/persistentes | **não executados nesta etapa** |

## Sequência de autorização e homologação

1. Executar e fornecer os dois exports adicionais somente leitura de schemas privados e defaults de
   permissão. Nenhum segredo, token ou linha de tenant é necessário.
2. Autorizar separadamente a migração `catalog-security-hardening` somente no TEST. Antes de aplicar,
   manter o fingerprint e as 21 policies do preflight; após aplicar, executar o preflight somente
   leitura e a matriz OWNER A/B.
3. Disponibilizar sessões TEST MANAGER/EMPLOYEE no Environment existente e executar o workflow manual
   de papéis. Comprovar salário nulo, linhas de equipe, perfil próprio, overrides e isolamento A/B.
4. Autorizar, uma por vez: guard finito de caixa; normalização Cash; idempotência de despesa;
   idempotência de compra. Cada etapa exige preflight, regressão com flag desligada, fluxo controlado,
   compensação e verificação de resíduo.
5. Somente depois, autorizar as unidades independentes de gestão de equipe, Storage e Administração
   Comercial. Administração aguarda primeiro o catálogo de `nexalvo_platform` para evitar colisão com
   a implementação privada já existente.
6. Autorizar separadamente as jornadas persistentes de venda/caixa/estoque/compra e seus planos de
   compensação. Compras persistentes continuam desativadas na CI padrão.

Nenhuma migração, Edge Function, upload, usuário, convite, compra ou operação financeira foi executada.
O resultado não declara o aplicativo 100% homologado.
