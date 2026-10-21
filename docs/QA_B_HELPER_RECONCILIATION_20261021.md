# B-Jornada — reconciliação dos helpers após Administração Comercial

Somente QA `automation/nexalvo-qa-actions` e Supabase TEST `msinksoilkluooxenecy`.
**Baseline B corrigido; novo export e preflight autenticado real ainda necessários.**

## Revisão semântica e proveniência

| Função | Baseline anterior ao cutover | Baseline após cutover informado e reproduzido |
| --- | --- | --- |
| `public.current_business_id()` | `cb88feae5114dab5ff53ad35319544d4` | `8326e5f1bc2ecf720cb0aa3be9a0d0d6` |
| `public.user_can(text)` | `dda7b605c2b77befc9ec56f7af184103` | `78e7ac15c93a208fdec8baf37e2b9c02` |

Os novos hashes são **exatamente** os de `md5(pg_get_functiondef(...))` produzidos no PostgreSQL 17
ao compilar as duas definições extraídas de `migrations/20261016_platform_admin_TEST.sql`, sem alterar
os corpos. Os dois corpos de destino permanecem idênticos aos introduzidos no commit `25d4038`;
o pacote posterior `cfad62d` reconciliou identidades administrativas sem mudar esses helpers.

A diferença é **semântica legítima**, além de qualificação/formatação: ambos passam a fazer JOIN com
`public.businesses` e exigir `platform_status='ACTIVE'`, mantendo `auth.uid()` e perfil ativo.
Empresa suspensa, ausente ou sem status ativo deve produzir contexto NULL e permissão false.
`search_path` muda de `public` para vazio e os objetos passam a ser qualificados. Ambos continuam
STABLE SECURITY DEFINER. A substituição preserva ACLs: authenticated executa e anon não executa.

`user_can` conserva as regras existentes: OWNER ativo da empresa ativa, defaults por papel, overrides
estritamente booleanos e negação para permissão ausente ou valor de override malformado. Nenhuma
consulta a claim SUPERADMIN foi acrescentada: a autoridade global não promove EMPLOYEE a OWNER
nem concede salário/financeiro da empresa. O papel de empresa continua separado da administração.

Somente os dois valores de `qa/sale-journey-core.mjs` e do SQL B foram atualizados. Os outros seis
fingerprints B, os grants exigidos, as 13 tabelas/RLS, validade de 24 horas, limites, snapshots,
isolamento e compensação permanecem obrigatórios. Os hashes históricos da migração, rollback,
fixture histórica e preflight **pré-cutover** foram preservados: não são o baseline de runtime B
e continuam necessários para comprovar restauração e impedir reaplicação indevida.

Os hashes implantados foram informados pelo usuário; não houve leitura SQL remota nesta sessão.
A coincidência canônica foi comprovada localmente. O próximo catálogo real continua obrigatório:
não alterar manualmente fingerprint, status ou horário de um export antigo para fazê-lo passar.

## Regressões e evidência

Reprodução antes da correção: **4/5 PASS, 1 FAIL**, pois o baseline JS ainda exigia o hash pré-cutover.
A compilação já reproduzia os dois hashes reais informados; a falha era de baseline B desatualizado.
Depois: **16/16 PASS** (11 guards B + 5 testes PostgreSQL), sem falhas/skips. Testes abrangem:

- Hash canônico das definições históricas e de destino; concordância SQL/JS; grants e search_path.
- Negação dos hashes anteriores e de drift desconhecido, grants incorretos e tabelas sem RLS.
- Perfil ausente/inativo/NULL; empresa ausente/suspensa/NULL; contexto A/B independente.
- Defaults MANAGER/EMPLOYEE, overrides true/false, texto/número/array/JSON null e chave inexistente.
- Claim SUPERADMIN simulado e schema controlado pelo chamador não elevam permissões tenant.
- Catálogo com seis RPCs faltantes continua BLOCKED, mesmo com os dois helpers corretos.

SQL executado apenas em PostgreSQL descartável, sem rede/portas/volumes externos. Contextos JWT
nesses testes são simulados: não equivalem a login ou homologação de perfis no Supabase TEST.
Não houve alteração de migração, função implantada, claims, contas, estoque ou financeiro remoto.
Regressões da Administração Comercial: **45/45 PASS**, incluindo aplicação/pós-preflight/rollback
em PostgreSQL descartável. Build PASS. [Evidência sanitizada](./evidence/sale-b-helper-reconciliation-20261021.json).
Nova CI e SHA aprovado serão registrados após a publicação observada.

## Fixture fornecida e preparação Windows

O usuário confirmou produto QA `ZZ_QA_SALE_B_20261021_EXCLUSIVE`, preço USD 0,50, receita 0,25,
estoque inicial 1 e custo médio USD 0,10, com `potentially_eligible=true`. Isso resolve a identificação
do candidato; elegibilidade, ausência de histórico e estado atual serão revalidados por leitura.
Esses valores informados **não são snapshot de uma venda executada nesta sessão**.

1. Sincronizar a QA preservando mudanças locais. Confirmar o SHA completo aprovado na nova CI.
2. Executar **novamente**, somente na conexão SQL TEST confirmada:
   `qa/sql/sale_journey_preflight_readonly_TEST.sql`.
3. Salvar o novo JSON real fora do Git em `%TEMP%\nexalvo-b-catalog.json`. Exigir
   `PASS_VERSIONED_CONTRACTS`; os oito fingerprints e ACLs devem coincidir. Não reaplicar cutover.
4. Reservar a fixture/unidade, sem uso concorrente. Só então utilizar `-ExclusiveWindowConfirmed`.
5. Executar o comando abaixo, que faz **apenas preflight**, sem criar venda ou estorno:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
$validatedSha = '<SHA_COMPLETO_APROVADO_NA_NOVA_CI>'
$catalogFile = Join-Path $env:TEMP 'nexalvo-b-catalog.json'
.\qa\Invoke-QaSaleJourney.ps1 -ValidatedCodeSha $validatedSha `
  -FixtureProductId '5ba917cd-362b-42f5-83f6-345fb3dccddf' `
  -LocationId 'a3e4b2ed-eb00-4963-afd0-38c256aff87d' `
  -CatalogFile $catalogFile -ExclusiveWindowConfirmed -PreflightOnly
```

As credenciais existentes A/B entram por prompts ocultos ou ambiente seguro do processo, sem chat,
arquivos ou logs. O wrapper nativo/ACL/mutex deve passar no Windows. Não há Desktop Commander ou
SQL remoto nesta sessão; isso não significa que o notebook esteja offline.

Exigir `READY_WITHOUT_BUSINESS_WRITES`, identidades OWNER A/B, empresas, permissões, isolamento,
fixture exclusiva e catálogo atual. Preflight não homologa os demais checks B. A autorização de uma
venda Other, quantidade 1, até USD 1 e um estorno do mesmo ID continua válida, mas a venda não foi
executada e permanece bloqueada até todos os gates passarem. Nenhuma nova fixture será criada.

Recuperação, snapshots e compensação: [procedimento B completo](./QA_B_JORNADA_20261021.md).
Cobertura operacional permanece **14/60 (23,33%)**, 15 pendentes e 31 bloqueados; nenhum novo
critério de jornada real foi promovido por esta reconciliação.
