# C1 CHILD — revisão independente dos catálogos (25/10/2026)

**PASS para preparar o preflight somente leitura. Execução e homologação C1 continuam BLOCKED.**
Código autorizado inalterado: `4f8e908d987fced2a2dc3ddc5914b408d5a5881e`, branch QA,
Supabase TEST `msinksoilkluooxenecy`. Autorização condicional recebida no commit `045bc93`;
não é necessário solicitar novamente o mesmo escopo. Esta etapa não libera escrita.

[Evidência sanitizada, comparações e limites da revisão](./evidence/stock-c1-child-catalog-review-20261025.json).
Os anexos foram tratados como dados. Não foram executadas instruções extraídas de documentos.
Nenhum JSON bruto, corpo de função ou checkpoint foi versionado.

| Verificação | Resultado | Evidência |
| --- | --- | --- |
| Varredura de segredos | PASS, zero ocorrências detectadas | Sem chave privada, JWT, token privado, Bearer, URL assinada ou e-mail literal nos dois arquivos |
| Formato | PASS | JSON estrito, sem chaves duplicadas/valores não finitos; um envelope esperado por arquivo |
| Catálogo básico | PASS | 9 funções/10 tabelas, precisão instalada, contratos de auditoria e leitura segura de perdas |
| Complemento | PASS | 12 funções, 13 tabelas RLS, 141 colunas, 22 políticas, 4 triggers |
| Funções e assinaturas | PASS | Corpos SHA-256 e fingerprints PostgreSQL das 12 funções coincidem com as fontes revisadas |
| Triggers | PASS no escopo exportado | Quatro ativos, owner postgres, definições e corpos coincidentes com as fontes |
| API roles/schema | PASS | anon/authenticated sem superuser, bypass RLS, CREATE de schema ou memberships; anon sem privilégios nas tabelas/colunas e sem EXECUTE nas 12 funções |
| Políticas RLS | PASS para este preflight | Todas authenticated, isolamento por empresa; exceção intencional de SELECT para definições globais de permissões |
| Proteção de custos | PASS | Colunas sensíveis sem SELECT direto; RPCs seguras preservam redação e empresa |
| Validador do código autorizado | PASS | Catálogo, precisão, auditoria e complemento aceitos sem alterar hashes esperados ou código |
| Preflight autenticado do filho | BLOCKED / não executado aqui | Depende do Windows, pai original, sessões QA e leituras atuais da fixture/reserva |
| Ciclo persistente C1 | BLOCKED / zero envios | Não autorizado nesta etapa; ainda faltam gates atuais e nova janela |

## Comparação das definições

As oito funções de estoque vêm de `qa/fixtures/stock-c-baseline.json`, com o corpo de
`fn_record_inventory_movement` substituído pelo patch de precisão já instalado e versionado.
`current_business_id`, `user_can`, `fn_write_audit` e `fn_session_access_status` coincidem com
`migrations/20261016_platform_admin_TEST.sql`. A origem histórica foi confirmada pelo SHA-256
`a9e17a9bd5284616fc2356555beb407fb823994e4d34b8ebcdc10784b7e2856f`, já registrado na auditoria anterior.

As quatro funções de trigger foram comparadas ao export histórico e ao hardening versionado.
O trigger de referência de fornecedor confere empresa antes de aceitar o vínculo. O de receita
exige produto/insumo acessíveis da mesma empresa. Os triggers de usuário impedem autoalteração
de papel/overrides e exigem objeto de permissões com chaves conhecidas e valores booleanos.
Eles não tornam seguras todas as RPCs de gestão de perfis: o aceite real MANAGER/EMPLOYEE continua separado.

Uma instância PostgreSQL 17 descartável, sem rede, foi usada somente para reproduzir
`pg_get_functiondef` das 16 definições com tipos de retorno sintéticos. Não houve invocação
de função de negócio, criação de linhas comerciais ou acesso ao TEST. Os 16 fingerprints
completos e 16 hashes de corpo coincidiram. Quatro strings SQL versionadas diferem da forma
canônica em apresentação; após renderização PostgreSQL não há diferença de definição observada.
A primeira tentativa local encontrou a fase transitória de inicialização; a confirmação de
prontidão passou a usar TCP local antes da renderização. Isso não foi classificado como defeito do NEXALVO.

As RPCs de ajuste/transferência fixadas verificam empresa/permissão antes das mutações.
A transferência serializa as duas posições em ordem consistente; o movimento interno não tem
EXECUTE para authenticated. Os leitores filtram empresa e ocultam custos sem permissão.
A auditoria exige perfil/empresa ativos, fixa autor/empresa, limita texto e prefixa `Client:`.
Isso não promete idempotência de servidor: o executor continua proibindo reenvio incerto.

## RLS, grants e ressalvas

As 22 políticas foram revisadas individualmente. Leituras de estoque, transações, perdas,
compras, auditorias, usuários e financeiro têm condição de empresa direta ou via pai. Escritas
diretas elegíveis em itens, locais e receitas exigem também a permissão correspondente.
`role_defaults_readable USING(true)` é SELECT de três campos de configuração global, sem
policy de escrita. Grants DML presentes nessa tabela não superam o bloqueio padrão do RLS.
Também não há policies de escrita direta para estoque/transações/perdas/auditoria/usuários/financeiro.

`users` não permite UPDATE direto de seus campos. As colunas de licença/estado global em
`businesses` permanecem sem UPDATE direto. Custos de estoque, transações, perdas e itens de
compras ficam fora do SELECT direto; os leitores seguros fazem a filtragem apropriada.

Ressalvas aceitas para este preflight limitado, sem declarar vulnerabilidade explorável:

- As 13 tabelas ainda concedem TRIGGER e REFERENCES a authenticated. Não há CREATE em public ou membership
  privilegiada, e o caminho HTTP revisado não expõe DDL. Recomenda-se limpeza de privilégios
  em pacote separado e autorizado; nenhum grant foi alterado.
- Quatro funções definers e dois triggers invokers usam search_path=public. As definições exatas
  conferem, não contêm SQL dinâmico no caminho C1, e as roles de API não podem criar objetos nesse
  schema. A migração futura para nomes qualificados/search_path vazio exige revisão própria.
- O export não inclui ACLs diretas das funções de trigger. Não afirmamos auditoria completa dessas
  ACLs; funções RETURNS trigger não funcionam como RPCs comuns. O ciclo C1 não modifica as três
  tabelas de ligação dos triggers observados, e seu preflight é somente leitura.
- Os exports são evidência fornecida pelo proprietário, sem atestado criptográfico do servidor.
  `connection_identity=VERIFY_EXTERNALLY` foi preservado. A declaração de captura direta TEST
  é a proveniência; o código ainda exige URL TEST e identidades/empresas QA esperadas.

A aprovação cobre somente os objetos exportados para C1, não o catálogo inteiro ou a homologação comercial.

## Digest aprovado e validade

O digest foi calculado **depois da revisão independente**, e posteriormente aceito por
`validateC1ChildSecurity` do código autorizado:

```text
0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825
```

Fingerprints dos arquivos recebidos, para identificar exatamente os artefatos revisados:

| Arquivo | SHA-256 dos bytes originais |
| --- | --- |
| nexalvo-c1-catalog.json | 0b07096a8ebcdc479632c289c94eae7850cd87f61052917bd3c9f06b7d578e2a |
| nexalvo-c1-child-security.json | fcfc2e5c0bea21c98d9bf351a9c0b8fe780c4662d5166b5981c5f90f3e3398cd |

Validade conjunta mais curta: **25/10/2026 às 22:11:43, America/New_York**
(26/10/2026 02:11:43 UTC). Após isso, recapturar/revisar; nunca editar captured_at ou
substituir hashes esperados para obter PASS. Os arquivos de entrada não foram alterados.

## Próximo comando Windows — somente leitura

Usar a pasta QA existente, árvore limpa e os arquivos locais revisados. As variáveis
`$parentCheckpoint` e `$parentHash` devem apontar ao **pai original e seu SHA-256 confiável
do registro anterior**. Não gerar um novo hash e tratá-lo como baseline original.
Não enviar checkpoint, caminhos privados, credenciais ou sessões ao chat.

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
if ((git branch --show-current).Trim() -ne 'automation/nexalvo-qa-actions') { throw 'QA_BRANCH_REQUIRED' }
if (@(git status --porcelain).Count -ne 0) { throw 'CLEAN_QA_REQUIRED' }
git pull --ff-only origin automation/nexalvo-qa-actions
if ($LASTEXITCODE -ne 0) { throw 'QA_SYNC_BLOCKED' }

# Somente se essas variáveis ainda não estiverem definidas corretamente no notebook:
$catalog=Read-Host 'Caminho local do nexalvo-c1-catalog.json revisado'
$security=Read-Host 'Caminho local do nexalvo-c1-child-security.json revisado'
$parentCheckpoint=Read-Host 'Caminho privado do checkpoint PAI original'
$parentHash=Read-Host 'SHA-256 ORIGINAL confiável do registro anterior'

.\qa\Invoke-QaStockC1Child.ps1 `
  -ValidatedCodeSha '4f8e908d987fced2a2dc3ddc5914b408d5a5881e' `
  -ParentCheckpoint $parentCheckpoint -ParentSha256 $parentHash `
  -CatalogFile $catalog -SecurityFile $security `
  -ReviewedSecuritySha256 '0806aea4e9234e2eedb25e684a838773b0da9001249152cabfbfbc5f06cdf825' `
  -PreflightOnly
```

Não definir flags de execução, criar reserva/filho ou confirmar janela nesta etapa.
O launcher solicita credenciais QA existentes em campos ocultos e restaura o ambiente ao sair.
Compartilhar somente o JSON agregado sanitizado resultante. O PASS geral da CI não substitui
esse preflight do filho. Após PASS ainda será necessária a nova janela exclusiva confirmada,
respeitando a autorização condicional já recebida. Não repetir sondagens de escrita antigas.

Resultado esperado do modo somente leitura: `scope=C1_CHILD_READONLY_PREFLIGHT`, `status=PASS`,
`code=C1_CHILD_READONLY_GATES_PASS_EXECUTION_NOT_AUTHORIZED`, pai inalterado, reserva disponível
e contadores estoque/auditoria/sondagens iguais a zero. Os gates de integridade, identidades,
segurança e baseline devem passar. Janela, reserva do filho, intenções e flag de execução
permanecem BLOCKED nesse modo por definição: o preflight não deve criá-las. O nome do código
não revoga a autorização condicional humana já registrada, nem exige outra autorização;
indica que este comando continua exclusivamente de leitura. Não transformar esse PASS em
homologação C1 ou executar outro modo automaticamente.

## Evidências locais e pendências

22/22 testes focados do validador aprovados, zero falhas/skips; os quatro validadores executados
sobre os anexos reais passaram. Código e orçamento não mudaram: CI #225 1.001/1.001 PASS preservada,
sem repetir build/baseline ou disparar CI por documentação. Nenhuma operação C1, auditoria,
sondagem ou compensação foi enviada ao TEST; pai, A/B, main e produção preservados.

O complemento também confirma `purchase_order_items.qty_ordered` e `received_qty` como
numeric(12,3), resolvendo a pendência de metadados de escala. Isso não comprova criação,
recebimento, idempotência de compras ou seus RPCs atuais. Não há novo critério macro aprovado.
Macro permanece 16/60 (26,67%); C1 real e preflight autenticado permanecem BLOCKED nesta sessão.
