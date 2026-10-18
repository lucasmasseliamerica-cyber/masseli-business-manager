# NEXALVO — auditoria dos schemas privados e plano de hardening

Data: 2026-10-18  
Branch: `automation/nexalvo-qa-actions`  
Alvo exclusivo: Supabase TEST `msinksoilkluooxenecy`  
Estado: **catálogo privado revisado; hardening preparado e não aplicado; autoridade SUPERADMIN requer reconciliação**

Validação publicada: commit `36e2c1630ffe277ae43535a640785303a5f4201c`; [CI #168](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39099580726) com **12/12 jobs, 485/485 verificações raiz, zero falhas e zero skips**.

Correção posterior: commit `f34232e8ecc81e36c30d1fcd3dfe230e7b0999e1`; [CI #169](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39122084977) com **12/12 jobs, 487/487 verificações raiz, zero falhas e zero skips**.

Nenhuma migração, função, usuário, dado, convite, operação financeira ou deploy foi executado. O
JSON bruto permaneceu fora do Git.

## Preflights reais posteriores à CI #168

O pre-apply executado diretamente no TEST terminou **BLOCKED**, com 7/10 checks aprovados. Os três
checks reprovados são exclusivamente os fingerprints das funções públicas abaixo:

| Função | Catálogo histórico | TEST em 2026-10-18 |
|---|---|---|
| `fn_read_employees_secure()` | `1c13bdeb159e0d78db0a200055cdb36a` | `6a004cb40f967cc39f4c3bd20fec817e` |
| `fn_read_sale_items_secure()` | `161e5147cd4eae4ca6e9a4c074af7cb6` | `b9c489bf2a75339768bcc19ba174821c` |
| `fn_write_audit(text,text)` | `4ab39d24cd80134b7ca7812c8a38dd7d` | `2d1742df2500389b93028511b1cb17e5` |

Os dois fingerprints de export público/privado permaneceram compatíveis. Portanto a divergência não
é explicada por uma mudança global de formatação de `pg_get_functiondef`; ela está limitada às três
funções. Um hash não permite distinguir mudança semântica de alteração textual. A migração conserva
os fingerprints históricos e permanece fail-closed. O rollback histórico agora também recusa toda
execução, pois restaurar corpos antigos sobre definições atuais ainda desconhecidas não é seguro.

`qa/sql/catalog_security_hardening_function_drift_readonly_TEST.sql` captura os três corpos e seus
metadados em transação somente leitura. O resultado deve permanecer fora do Git até passar pela
varredura de segredos e pela comparação semântica; somente então a migração e o rollback poderão ser
regenerados a partir da mesma baseline.

O preflight administrativo real encontrou um operador ativo, com perfil ativo e papel tenant OWNER,
e nenhum claim assinado `SUPERADMIN`. O contador antigo retornou zero porque `NOT (claim =
'SUPERADMIN')` produz `NULL` quando o claim está ausente, e `FILTER` descarta esse resultado. A
consulta foi corrigida com `IS DISTINCT FROM`, incluindo regressões SQL para chave ausente e JSON
`null`. Para o estado informado, o resultado correto é um operador ativo sem claim e
`authority_models_aligned = false`.

## Cadeia de evidência

O export `final_private_security_catalog` possui 81.311 bytes e SHA-256
`8f9e02c2a067962f35be60e0c1fae288a2ff6bb8197f1e58ab99ea4af4b0cf03`. A varredura recursiva
encontrou zero chaves privadas, JWTs, chaves Supabase, chaves AWS, URIs com credenciais, segredos em
literais ou endereços de e-mail. A evidência derivada está em
`qa/evidence/final-private-security-sanitized-20261018.json` e não contém corpos de função.

| Prova | Resultado |
|---|---:|
| Schemas privados | 2 |
| Relações | 6: quatro tabelas e duas sequências |
| Tabelas com RLS / policies de negação direta | 4 / 4 |
| Funções / `SECURITY DEFINER` | 7 / 6 |
| Grants de tabela / coluna | 28 / 84, somente `postgres` |
| Funções privadas executáveis por `authenticated` | 5 |
| Funções ou relações privadas acessíveis por `anon` | 0 |
| Relações privadas legíveis/graváveis diretamente por `authenticated` | 0 |
| Definers sem `search_path` vazio | 0 |

`authenticated` possui somente `USAGE`, sem `CREATE`, nos dois schemas. Isso permite resolver as
cinco funções concedidas sem abrir tabelas. Os cinco wrappers públicos correspondentes são
`SECURITY INVOKER`, têm assinaturas compatíveis, aceitam `authenticated` e negam `anon`.

## Resultado por área

### Exportação de empresa

`nexalvo_backup.export_business_data(uuid)` verifica, antes das leituras, que `auth.uid()` pertence
à empresa solicitada, está ativo e tem papel `OWNER`. Ela exporta 30 tabelas tenant-scoped e exclui
`role_default_permissions`, Auth, arquivos de Storage, infraestrutura e Administração Comercial.
Relacionamentos sem `business_id` próprio são filtrados por pais da mesma empresa.

O payload inclui salário, custos, vendas, caixa, despesas, compras, dados de clientes/fornecedores e
overrides. Isso é compatível com o contrato atual, no qual OWNER possui as 20 permissões. MANAGER e
EMPLOYEE continuam negados pelo gate OWNER, inclusive quando recebem `manageUsers` por override.

Limites implantados:

- 10.000 linhas por tabela;
- 50.000 linhas no total;
- 20 MiB após serialização JSON.

Não foi comprovado bypass multiempresa ou de papel. Permanece um risco condicional de consumo de
recursos: o limite de 20 MiB é verificado depois da materialização do JSON. A quantidade de linhas é
limitada antes disso, mas campos `text` grandes podem ampliar memória/tempo. Antes da homologação
comercial, medir o pior caso em clone isolado e definir timeout/rate limit no gateway; não alterar a
função somente com base no alerta.

### Administração legada implantada

`nexalvo_platform.has_access()` exige simultaneamente uma linha `operators` ativa e um perfil
`public.users` ativo para `auth.uid()`. As tabelas `operators`, `access_audit`, `company_audit` e
`provisioning_requests` negam acesso direto. Não há autoinscrição de operador nas funções exportadas.

O gate implantado não consulta o claim assinado
`app_metadata.nexalvo_platform_role = SUPERADMIN`. O backend novo preparado usa exclusivamente esse
claim. Portanto existem dois modelos de autoridade diferentes:

- implantado: membership privada em `nexalvo_platform.operators`;
- preparado: claim Auth assinado, validado pela Edge Function, com RPCs somente `service_role`.

Isso é uma divergência confirmada de arquitetura, mas ainda não uma elevação explorável: o export não
contém os membros de `operators` nem seus claims. A migração preparada agora falha fechada se detectar
o plano legado, impedindo a instalação acidental de duas autoridades paralelas. O preflight agregado
`qa/sql/platform_admin_operator_alignment_readonly_TEST.sql` conta divergências sem retornar IDs,
e-mails ou documentos de claim.

### Estratégia de autoridade única

A autoridade alvo continua sendo o claim assinado `app_metadata.nexalvo_platform_role =
SUPERADMIN`, já exigido pela interface e pela Edge Function preparada. O cutover deverá aceitar uma
janela curta sem Administração Comercial para evitar qualquer instante com dois mecanismos ativos:

1. confirmar por leitura a identidade única pretendida, o conjunto exato de operadores e a ausência
   de claims concorrentes;
2. em janela controlada, revogar EXECUTE dos wrappers administrativos legados e desativar a
   membership ativa, preservando tabelas e auditoria histórica;
3. somente após a autoridade legada ficar inoperante, atribuir o claim assinado à mesma identidade e
   forçar renovação da sessão;
4. adaptar o preflight da migração nova para aceitar o schema histórico apenas quando não houver
   operador ativo nem wrapper legado executável, aplicar o backend novo e publicar a Edge Function;
5. provar que SUPERADMIN funciona e que OWNER comum, operador histórico sem claim e outra empresa
   são negados.

O rollback deve executar a ordem inversa sem sobreposição: desabilitar primeiro o backend novo,
remover o claim e somente então, mediante autorização separada, reativar a autoridade legada. Nenhum
passo desse cutover foi executado ou autorizado. O estado de corte pode ser comprovado sem expor
identidades por `qa/sql/platform_admin_single_authority_preflight_readonly_TEST.sql`: ele exige zero
operadores ativos, zero endpoint legado executável por `authenticated`, exatamente um claim assinado
e perfil tenant ativo para essa identidade.

### Provisionamento e primeiro OWNER

`provision_company` exige `has_access()`, valida nome/moeda/fuso/local, bloqueia por `request_id` e
vincula replay ao mesmo operador e payload. Empresa, primeiro local, request e auditoria são gravados
na mesma transação.

`assign_first_owner` exige operador, empresa criada pelo plano, identidade Auth confirmada/não banida,
locks separados por empresa e identidade, inexistência de perfil prévio e inexistência de OWNER. O
replay só aceita o mesmo OWNER ativo na mesma empresa. Não foi encontrado caminho de atribuição por
OWNER tenant comum. A coerência dos membros reais de `operators` com o claim SUPERADMIN permanece
bloqueada até o preflight agregado.

### Matriz de permissões

O conjunto versionado do frontend e do serviço `manage-staff-user` coincide em 20 chaves. A prova SQL
histórica verificou 20 chaves em quatro perfis, 80/80, mais casos de overrides sob rollback. O export
privado não contém dados de `role_default_permissions`; assim, ele não muda nem amplia essa prova. A
homologação real continua dependendo de sessões independentes MANAGER/EMPLOYEE e do artefato atual
da matriz global com fingerprint retido.

## Hardening público revisado

A migração `20261017_catalog_security_hardening_TEST.sql` continua corrigindo as vulnerabilidades já
comprovadas no catálogo público: leitura direta de salário/RH e custo de venda, enumeração ampla de
perfis, fornecedor multiempresa em estoque, eventos cliente sem proveniência, policies `public`,
EXECUTE de funções de trigger e default EXECUTE futuro.

O rollback restaura os grants, as 21 roles de policy e os corpos implantados de
`fn_read_employees_secure` e `fn_write_audit`. Testes novos fixam os hashes normalizados dos dois
corpos originais. Não foi encontrada dependência incompatível com `export_business_data`: ela roda
como definer, mantém o gate OWNER e continua apta a ler o backup completo após a retirada dos grants
diretos de salário/custo.

Foi acrescentado `qa/sql/catalog_security_hardening_preapply_readonly_TEST.sql`. Ele exige:

- fingerprints exatos dos facades de funcionários/itens, auditoria e export público/privado;
- grants sensíveis ainda no baseline revisado;
- conjunto exato das 21 policies atribuídas a `public`;
- ausência do trigger novo e de EXECUTE anônimo;
- ausência de `CREATE` para roles de API em `public`.

O export privado também passou a incluir, numa futura reexecução, colunas, constraints, índices,
grants de uso e privilégios padrão. A versão recebida não tinha esses metadados.

As sete definições privadas implantadas também não possuem fonte reprodutível equivalente nas
migrações versionadas. Somente seus fingerprints e sinais sanitizados foram retidos; qualquer
substituição futura deve partir de um patch revisado completo, sem inferir implantação a partir dos
wrappers públicos.

## Classificação consolidada

| Classe | Resultado |
|---|---|
| Vulnerabilidades públicas confirmadas | As seis de `QA_DEFINITIVE_SQL_CATALOG_AUDIT_20261017.md`; correções preparadas, não aplicadas |
| Nova vulnerabilidade privada confirmada | Nenhuma exploração comprovada no export recebido |
| Risco condicional alto | Duas autoridades administrativas se o backend novo for instalado sem reconciliar `operators` e claims |
| Risco condicional de disponibilidade | Export de até 20 MiB valida tamanho após materializar JSON |
| Controle aprovado estaticamente | Owner/tenant gate do export; gates/locks de provisionamento; negação direta privada; wrappers sem `anon` |
| Bloqueio real | Três definições públicas divergentes; operador ativo sem claim; metadados estruturais privados adicionais; sessões SUPERADMIN/OWNER/não-operador e MANAGER/EMPLOYEE |

## Sequência de aplicação exclusiva no TEST

1. Executar a captura somente leitura das três funções divergentes. Enquanto seus corpos atuais não
   forem comparados, o pre-apply e o rollback permanecem **BLOCKED**; não adaptar fingerprints para
   forçar passagem.
2. Reter novo snapshot/fingerprint dos catálogos público e privado. Executar separadamente o
   preflight agregado de operadores; ele não autoriza Administração Comercial.
3. Com autorização específica, aplicar somente `20261017_catalog_security_hardening_TEST.sql` em uma
   transação no TEST. Não incluir Administração Comercial, Storage ou migrações financeiras.
4. Executar imediatamente `catalog_security_hardening_preflight_readonly_TEST.sql` e reexportar o
   catálogo. O diff esperado é apenas o descrito na migração.
5. Rodar OWNER A/B e, quando existirem sessões seguras, MANAGER/EMPLOYEE: perfil próprio/equipe,
   salário redigido, custos redigidos, isolamento A/B e escrita permitida/negada.
6. Se a migração falhar, a transação já reverte tudo. Usar o rollback preparado somente diante de
   incompatibilidade pós-commit comprovada; depois verificar fingerprints/grants originais. O
   rollback reabre vulnerabilidades conhecidas e não é estado final aceitável.

Administração Comercial requer uma autorização e um plano independentes depois de reconciliar as
duas autoridades. Nenhuma etapa acima autoriza migração, deploy ou escrita no TEST.
