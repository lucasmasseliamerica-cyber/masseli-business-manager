# NEXALVO — fundação segura da Administração Comercial

> Atualização de 2026-10-19: esta fundação foi integrada ao pacote de
> [autoridade única SUPERADMIN](./QA_PLATFORM_ADMIN_SINGLE_AUTHORITY_20261019.md), que acrescenta
> cutover atômico, suspensão efetiva, recuperação e rollback fail-closed.

Data: 2026-10-16
Branch: `automation/nexalvo-qa-actions`

## Resultado entregue

O frontend agora possui uma área separada de Administração da Plataforma para consulta de empresas, situação operacional, quantidade de usuários ativos e tipo de licença, com ações confirmadas para ativar/suspender uma empresa e conceder licença vitalícia.

Essa área não amplia o papel tenant `OWNER`. Ela só aparece quando o JWT autenticado contém `app_metadata.nexalvo_platform_role = SUPERADMIN`. A aplicação ignora completamente `user_metadata` para essa decisão. Todas as operações globais passam exclusivamente pela Edge Function `platform-admin`; a aplicação não enumera empresas por PostgREST e não utiliza chave `service_role` no navegador.

## Contrato server-side preparado

A Edge Function protegida deverá:

1. validar o JWT e a claim `app_metadata.nexalvo_platform_role` em cada chamada;
2. rejeitar qualquer papel diferente de `SUPERADMIN`;
3. aceitar somente as operações `list_businesses`, `list_audit_logs`, `grant_lifetime_license`, `revoke_license` e `update_business_status`;
4. para `update_business_status`, aceitar somente `ACTIVE` ou `SUSPENDED`;
5. registrar administrador, instante, empresa, operação e valores anterior/novo em auditoria imutável;
6. ser idempotente para reenvios da mesma alteração;
7. devolver `{ "ok": true, "businesses": [...] }` na listagem e `{ "ok": true }` nas mutações;
8. usar credenciais privilegiadas somente no servidor e retornar apenas os campos mínimos usados pela interface.

Campos esperados na listagem: `id`, `name`, `status`, `license_type`, `active_users`, `created_at` e `licensed_at`. Valores desconhecidos falham de forma conservadora na interface: situação vira `SUSPENDED` e licença vira `NONE`.

## Continuação implementada

O backend, a revogação, a auditoria e a idempotência foram preparados posteriormente no repositório, sem aplicação ou deploy. Consulte [QA_PLATFORM_ADMIN_BACKEND_20261016.md](./QA_PLATFORM_ADMIN_BACKEND_20261016.md). A seção abaixo registra os limites da entrega original desta fundação.

## Limites e bloqueios da fundação original

- Nenhuma migração, Edge Function, claim administrativa ou dado foi criado/aplicado nesta entrega.
- O painel mostrará **Platform service unavailable** até o backend protegido ser implantado e configurado.
- Licença vitalícia ainda exige decisão formal sobre revogação, transferência, limites de usuários/recursos, suporte e reflexo contratual/fiscal.
- O painel não representa homologação comercial completa, observabilidade, faturamento recorrente ou gestão de inadimplência.

## Evidência local

O teste `qa/platform-admin-foundation.test.mjs` verifica nas duas cópias da aplicação: claim confiável, rejeição de `user_metadata`, propagação do usuário Auth, ausência de acesso PostgREST global, Edge Function única, normalização conservadora, gate de navegação e confirmação das mutações.
