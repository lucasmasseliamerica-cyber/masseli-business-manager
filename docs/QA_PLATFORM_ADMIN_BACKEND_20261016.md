# NEXALVO — backend preparado da Administração Comercial

Data: 2026-10-16

Branch: `automation/nexalvo-qa-actions`

Ambiente permitido para futura validação: Supabase TEST `msinksoilkluooxenecy`

## Entrega funcional preparada

A área de Administração da Plataforma deixou de depender de um contrato apenas documental. O repositório agora contém uma Edge Function `platform-admin`, um núcleo de validação testável, uma migração TEST-only e a interface de empresas, licenças e auditoria.

O servidor valida a sessão no endpoint Auth do próprio projeto em cada chamada e exige `app_metadata.nexalvo_platform_role = SUPERADMIN`. O papel tenant `OWNER` e campos editáveis em `user_metadata` não concedem acesso. A chave `service_role` permanece exclusivamente na Edge Function.

Operações preparadas:

- listar empresas e o total de usuários ativos;
- conceder licença vitalícia;
- revogar licença;
- ativar ou suspender o estado comercial;
- listar as 50 alterações administrativas mais recentes.

Cada mutação exige `request_id` UUID. A interface cria o identificador ao abrir a confirmação e o preserva após erro, permitindo repetir com a mesma chave. A função SQL grava o pedido, bloqueia pedido e empresa, compara o payload de reenvio, altera a empresa e grava antes/depois em uma única transação. Reenvios concluídos retornam a resposta original com `replayed = true`; reutilizar a chave com outro payload falha.

## Controles de segurança

- CORS usa correspondência exata com `PLATFORM_ADMIN_ALLOWED_ORIGINS`; não há wildcard.
- `NEXALVO_ALLOWED_PROJECT_REF` deve coincidir com o host de `SUPABASE_URL`; configuração ausente ou divergente falha fechada.
- O corpo é limitado a 16 KiB e aceita somente campos e operações previstos.
- Erros inesperados são sanitizados; token, SQL e resposta interna não voltam ao navegador.
- Tabelas de idempotência e auditoria ficam em `nexalvo_private`, com RLS e sem grants para `PUBLIC`, `anon` ou `authenticated`.
- As RPCs têm `SECURITY INVOKER`, `search_path` vazio e execução concedida somente a `service_role`.
- O histórico não possui permissão de atualização ou exclusão no contrato da aplicação.

## Artefatos de implantação, ainda não executados

- `migrations/20261016_platform_admin_TEST.sql`: alteração aditiva e transacional.
- `qa/sql/platform_admin_preflight_readonly_TEST.sql`: verifica dependências, colisões, funções e grants existentes.
- `migrations/20261016_platform_admin_rollback_TEST.sql`: rollback condicionado; recusa apagar esquema quando houver qualquer auditoria.
- `supabase/functions/platform-admin/index.ts`: fronteira HTTP protegida.

Antes de qualquer aplicação, o operador deve confirmar no painel que o projeto selecionado é `msinksoilkluooxenecy`, executar o preflight somente leitura e revisar o resultado contra o catálogo implantado. A migração e a função não foram aplicadas ou publicadas nesta entrega.

## Limite relevante

`platform_status = SUSPENDED` registra e apresenta a decisão comercial, mas ainda não constitui bloqueio global de acesso tenant. Esse bloqueio precisa ser incorporado às políticas/RPCs implantadas sem criar uma rota alternativa entre as 53 políticas e 50 funções existentes. Até a revisão do export real do catálogo, suspensão deve permanecer **não homologada como controle de acesso**. A interface não afirma o contrário.

Também permanecem pendentes uma identidade real SUPERADMIN de TEST, configuração segura das variáveis da função, aplicação autorizada da migração, publicação autorizada da Edge Function e teste real de acesso/negação/auditoria multiempresa.

## Evidência automatizada

`qa/platform-admin-foundation.test.mjs` e `qa/platform-admin-backend.test.mjs` cobrem claim confiável, separação OWNER/SUPERADMIN, contrato estrito, CORS, sanitização, limite servidor/cliente, escopo do projeto, grants, RLS, `search_path`, locks, idempotência, auditoria, revogação, retry estável, preflight e rollback protegido.

Resultados locais desta entrega:

- regressões focadas: **18/18 PASS**, zero falhas e zero skips;
- suíte estática afetada do workflow: **236/236 PASS**, zero falhas e zero skips;
- bundle da Edge Function validado com o parser TypeScript do esbuild;
- `npm run build`: PASS, 1.578 módulos transformados;
- `npm audit --omit=dev --audit-level=moderate`: zero vulnerabilidades de runtime.

Publicação e CI:

- commit publicado: `4f252b0208ba6955e2c8a3d3cafc21221b94103e`;
- [GitHub Actions #154](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38945618369): **SUCCESS**, 12/12 jobs identificados no resultado público;
- preflight autenticado: **PASS [OK]**;
- agregador QA: **431/431 PASS**, zero falhas e zero skips.

Classificação desta entrega:

- **APROVADO localmente:** código e contratos estáticos exercitados pelas regressões.
- **BLOQUEADO:** aplicação no TEST, teste real SUPERADMIN e bloqueio RLS de empresa suspensa.
- **NÃO EXECUTADO:** qualquer escrita Supabase, migração, deploy ou alteração de produção.
