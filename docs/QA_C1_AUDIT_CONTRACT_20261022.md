# C1 — reconciliação do contrato de auditoria (22/10/2026)

Branch única `automation/nexalvo-qa-actions`; projeto único TEST `msinksoilkluooxenecy`.
Nenhum movimento C1, chamada C1 de auditoria, migração, deploy ou alteração de fixture/checkpoint
foi executado nesta correção. A CI executou seus checks habituais de autenticação/leitura, com os
quatro grupos persistentes desativados. Main e produção preservadas.

## Resultado da investigação

O bloqueio é um **baseline C1 de fase anterior**. O fingerprint informado pelo proprietário
corresponde exatamente ao corpo já versionado da Administração Comercial pós-cutover.
A diferença é semântica e torna a validação mais restritiva; não é mera formatação nem
vulnerabilidade comprovada na definição atual.

| Definição versionada | MD5 de prosrc | C1 atual |
| --- | --- | --- |
| Hardening histórico: `20261017_catalog_security_hardening_TEST.sql` | `75c32789a68a73e29a8a82d33e3aad27` | BLOCKED |
| Pós-cutover: `20261016_platform_admin_TEST.sql` | `ab9a6025c3457cb489b7ac24de19feb5` | Contrato preparado; confirmar catálogo atual |

SHA-256 do corpo pós-cutover:
`7fecdf24cfd6cf01a27a9c846ffe16cb03950f9b84e4ba54737539d56b8e68f8`.
Os dois corpos foram extraídos das migrações, comparados integralmente e compilados em PostgreSQL
descartável sem rede. Não foram inferidos apenas por substituição do hash observado.

A única alteração troca a seleção de perfil ativo por uma seleção que também faz
`JOIN public.businesses` e exige `b.platform_status = 'ACTIVE'`. O corpo antigo permitiu auditoria
em empresa suspensa no teste descartável; o atual rejeitou antes do INSERT.

O proprietário forneceu o MD5 e os atributos reais por catálogo somente leitura; o corpo bruto
atual não foi exportado nesta sessão. O novo catálogo deve comprovar também o SHA-256 e os
atributos adicionais, sem executar a função. Nenhum alerta é tratado como exploração.

## Segurança e compatibilidade

- `auth.uid()` seleciona um perfil ativo; empresa, identidade, nome e papel gravados vêm desse
  perfil. O payload não recebe UUID de empresa/ator substituíveis.
- A empresa deve existir e estar ACTIVE. Perfil ausente/inativo, UID nulo e empresa suspensa ou
  ausente bloqueiam antes da gravação.
- Não há exceção global para SUPERADMIN. OWNER, MANAGER e EMPLOYEE ativos podem gerar somente
  eventos auxiliares do próprio tenant. Isso não autoriza suas operações de estoque/financeiro.
- `Client:` e os limites de 120/2.000 caracteres permanecem iguais; evento do cliente continua
  evidência auxiliar. A C1 confere ledger, saldos, custos e cardinalidade por leitura independente.
- Owner postgres, SECURITY DEFINER, search_path vazio, nomes qualificados, negação anon e EXECUTE
  authenticated permanecem exigidos. Nenhum grant, RLS ou autoridade global foi alterado.

O contrato `qa/stock-c1-audit-contract.mjs` aceita **somente o corpo pós-cutover**, com MD5 e
SHA-256 exatos, assinatura `p_action text, p_details text`, retorno audit_logs sem SETOF/defaults,
PL/pgSQL VOLATILE não STRICT e os atributos/ACLs acima. Campo ausente/NULL ou qualquer drift
bloqueia. Não foi criada lista que aceite ambas as fases.

O catálogo `qa/sql/stock_journey_preflight_readonly_TEST.sql` continua SELECT-only. SHA-256 usa
funções nativas do PostgreSQL, sem extensão ou DDL. Catálogo geral PASS não substitui o gate C1.
Migrations, rollback e preflights históricos conservam seus hashes de fase; não reaplicá-los
para adaptar o banco ao executor atual.

## Código e evidências

Código publicado: **a60c0980ceb6005a90f99f8072af9b4b6639af02**.
[CI #212](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39807483674):
**768/768 PASS**, zero falhas/skips nos testes executados; **9 jobs PASS e 4 grupos persistentes BLOCKED/ignorados pelo gate**.

- **514/514 regressões locais PASS**, zero falhas/skips, em 45 módulos. Incluem 24 testes do
  protocolo C1 e 14 PostgreSQL descartável; não somar esses subconjuntos novamente.
- **24/24 browser HTTP simulado PASS**, interface React real e chamadas externas interceptadas.
  A tentativa inicial bloqueou no hook por ausência do executável Playwright padrão; o Chromium
  já instalado foi selecionado pela opção suportada. Nenhuma alteração de código foi necessária.
- Build, parser PowerShell e análise das duas Edge Functions PASS, sem deploy.
- Windows C1 PS 5.1/7, preflight autenticado habitual e browser aprovados na CI final. O preflight
  habitual da CI não substitui o novo catálogo/fixture C1 do notebook.
- Revisão independente do diff aprovada para QA/CI; não equivale à homologação persistente.

[Evidência da CI](./evidence/stock-c1-audit-ci-212-20261022.json) e
[evidência sanitizada da reconciliação](./evidence/stock-c1-audit-contract-reconciliation-20261022.json) contêm
proveniência, hashes dos resultados e limites da comprovação. Nenhum JSON bruto com definições,
credencial, token, UUID pessoal ou URL assinada foi versionado.

## Notebook — somente leitura

Preservar qualquer alteração local. Não usar reset, force push ou copiar arquivos por cima do
workspace. O código validado deve estar ancestral do HEAD; somente documentos podem ser posteriores.

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
if ((git branch --show-current) -ne 'automation/nexalvo-qa-actions' -or (git status --porcelain)) {
    throw 'QA_LIMPA_OBRIGATORIA'
}
git pull --ff-only origin automation/nexalvo-qa-actions
if ($LASTEXITCODE -ne 0) { throw 'SINCRONIZACAO_BLOQUEADA' }
Get-Content -Raw .\qa\sql\stock_journey_preflight_readonly_TEST.sql | Set-Clipboard
```

Executar o SQL copiado exclusivamente no SQL editor conectado ao TEST `msinksoilkluooxenecy`.
Salvar o novo resultado JSON em `%TEMP%\nexalvo-c1-catalog.json`; não reutilizar o catálogo antigo
sem SHA-256/assinatura/atributos. Depois:

```powershell
$c1 = @{
    ValidatedCodeSha = 'a60c0980ceb6005a90f99f8072af9b4b6639af02'
    CatalogFile = (Join-Path $env:TEMP 'nexalvo-c1-catalog.json')
}
.\qa\Invoke-QaStockJourney.ps1 @c1 -ValidateLauncherOnly
if ($LASTEXITCODE -ne 0) { throw 'C1_LAUNCHER_BLOQUEADO' }
.\qa\Invoke-QaStockJourney.ps1 @c1 -PreflightOnly
```

Os IDs das fixtures C existentes estão fixados no launcher. Usar somente as contas QA existentes
e chave pública nos prompts ocultos; não registrar credenciais em chat, arquivos ou logs, nem
usar service_role como usuário. O preflight não cria checkpoint, auditoria ou movimento de estoque.
Retornar somente o JSON sanitizado. Não iniciar execução persistente após esse comando.

## Bloqueios e próxima autorização

**C1 real BLOCKED:** faltam novo catálogo e preflight autenticado no notebook, além da confirmação
operacional da janela exclusiva antes de qualquer escrita. A sessão não possui Desktop Commander,
integração SQL ou credenciais QA; isso não significa que o notebook esteja offline.

Esta correção não exige migração ou autorização para alterar a função: a versão atual é compatível
e mais restritiva. A autorização C1 anterior permanece delimitada e não foi utilizada nesta etapa.
Qualquer nova operação persistente deve respeitar a autorização aplicável, gates e janela; C2,
compras e financeiro não foram liberados. A/B e seus checkpoints permanecem intocados.

Matriz macro: **16/60 (26,67%)**, 15 pendentes e 29 bloqueados. Nenhum check operacional promovido.
