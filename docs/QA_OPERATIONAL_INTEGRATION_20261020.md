# NEXALVO — integração e correções operacionais P0/P1

Escopo: `automation/nexalvo-qa-actions`, Supabase TEST `msinksoilkluooxenecy`.
Data de referência do cliente: 20/10/2026; evidências possuem horário UTC próprio.
Comercialização automática, checkout de licenças e novas contas permanecem congelados.

**Entrega parcial comprovada; A-Jornada persistente BLOCKED.** A cobertura operacional permanece
**13/60 (21,67%)**, com 15 PENDENTES e 32 BLOQUEADOS. Novos testes não promoveram critérios reais.
Não houve migração, deploy, execução financeira/compras persistentes ou execução do runner de fotos.
As CIs executaram autenticação/ciclo de sessões QA; isso não equivale a uma jornada de fotos.

## Publicação e preservação

| SHA integral | Resultado |
| --- | --- |
| `9b381e891af2b6f0e0e783560168bb6039e5503f` | Correção de testes de URLs assinadas recebida do remoto, preservada sem recriação |
| `396afacaa8d4bf256edaeb22032c45c5954f7126` | Pacote local de fotos/Windows preservado no merge e publicado |
| `50fc57b5e864d983a6a0b0df457f2c7c0d3cb84a` | Merge das duas linhas, sem conflitos ou force push; CI #187 aprovada |
| `9f0fbcaebd38d082aaf9c762ac0fa9f61bf5c147` | Compra rápida, cálculos, guard de insumos/PDV e SQL preparado fail-closed; CI #188 aprovada |
| `441634a5bdc775f30a6e5086a6c5a075c1eddd3d` | CSV seguro e bloqueio da matriz atualizado; CI #189 aprovada |

Backup pré-merge foi verificado por `git bundle verify` fora do repositório. `main` e produção
não foram alterados. Push autenticado por helper temporário; nenhum token foi salvo em Git/config.
`App.jsx` e `src/App.jsx` permanecem idênticos. Nenhum `.env` foi incluído.

## Problemas corrigidos

| Módulo | Problema e impacto | Correção preparada/publicada | Evidência e limite |
| --- | --- | --- | --- |
| Fotos | Dois testes antigos ainda esperavam um prefixo de URL menos restrito | Integrar o commit exato `9b381e8`; preservar resolução de `/object/sign/` dentro de `/storage/v1` e do bucket correto | Storage + guards 30/30; CI #187; não prova upload real |
| Estoque/compras | Compra rápida oculta no modo remoto; modal sem `purchaseOps`/`locations` | Liberar atalho somente com operação disponível, passar RPC/unidades e preservar unidade do insumo | Browser React com HTTP simulado: criar, consultar e reload; estoque não é recebido na criação |
| Compras | `3 × 1.234` mostrava `3.70`, mas enviava custo `1.23`, resultando em `3.69` após consulta | Calcular prévia e persistência com o mesmo custo canônico; desconto/imposto arredondados antes do total | Browser verifica subtotal, payload e reconsulta; backend real ainda depende da jornada D |
| Formulários | Primeiro fornecedor/insumo inativo podia iniciar uma seleção invisível ou inválida | Preferir opções ativas; preencher seleções vazias quando o carregamento termina | Browser com inativos antes das opções ativas; validação mantém rejeição de seleção desativada |
| Estoque | Criação de insumo após timeout não travava o botão, embora o latch global já impedisse outra RPC | Estado explícito incerto, botão bloqueado e erro visível; reabertura não contorna latch global | Browser simula commit seguido de 504 e comprova apenas um POST; reload exige conferência humana/histórico |
| PDV | Composição ausente/inativa/negativa, preço negativo e saldo não finito podiam alcançar a confirmação de cartão externo | Validar antes de iniciar pagamento; estoque negativo permitido não dispensa composição válida; alíquota limitada | Cinco cenários de navegador sem confirmação externa nem POST de venda; não é cobrança ou venda real |
| SQL preparado | `IF NOT user_can(...)` não negava NULL; tenant NULL precisava de rejeição explícita | `IS NOT TRUE` e `p_business_id IS NULL`, antes de reservar chave | Sete testes PostgreSQL descartável; risco condicional do wrapper preparado, sem exploração implantada comprovada |
| Exportações | CSV escapava aspas, mas texto poderia ser interpretado como fórmula em planilha; CR isolado não era citado | Neutralizar texto iniciado por operadores/controles; preservar números nativos negativos e citar CR/LF | Regressão de encoder e download CSV real no browser com HTTP simulado; não executa Excel ou fórmula |

As validações frontend reduzem erros antes de receber pagamento; não substituem autorização,
locks, RLS ou validação transacional no servidor. Proteção CSV trata uma saída insegura comprovada;
a exploração depende do comportamento/configuração da planilha. Não há evidência de exploração.

## Testes e CI

| Execução | Resultado comprovado | Escopo |
| --- | --- | --- |
| Storage e guards de A-Jornada | 30/30 PASS; 0 FAIL; 0 SKIPPED | Local, testes unitários/contratos; não é Storage real |
| Regressões afetadas de estoque/compras/PDV | 80/80 PASS; 0 FAIL; 0 SKIPPED | Local; contém subsets de testes operacionais |
| Segurança/manifesto/despesas preparadas | 33/33 PASS; 0 FAIL; 0 SKIPPED | Local; não aplica migrações |
| Idempotência de compras | 7/7 PASS; 0 FAIL; 0 SKIPPED | PostgreSQL 17 descartável sem rede/portas/volumes externos |
| Browser funcional antes do lote CSV | 16/16 PASS; 0 FAIL; 0 SKIPPED | React/Vite real, **HTTP inteiramente simulado** |
| CSV/relatórios/permissões | 34/34 PASS; 0 FAIL; 0 SKIPPED | Local; inclui o novo teste de CSV e testes sobrepostos ao lote anterior |
| Download CSV no navegador | 1/1 PASS; 0 FAIL; 0 SKIPPED | Nova regressão específica, HTTP simulado |
| Build Vite final | PASS | Após os dois lotes de código |
| Syntax Node/root-src/secret scan | PASS | Somente arquivos explícitos foram adicionados aos commits |
| [CI #187](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39540216913) | 612/612 TAP PASS; 0 FAIL; 0 SKIPPED nos testes executados | Merge `50fc57b`: oito jobs PASS, quatro grupos persistentes BLOCKED |
| [CI #188](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39541023169) | 627/627 TAP PASS; 0 FAIL; 0 SKIPPED nos testes executados | `9f0fbca`: oito jobs PASS, quatro grupos persistentes BLOCKED |
| [CI #189](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39541323542) | 629/629 TAP PASS; 0 FAIL; 0 SKIPPED nos testes executados | `441634a`: oito jobs PASS, quatro grupos persistentes BLOCKED |

Não somar os subsets locais com a CI. Os resultados se sobrepõem. A primeira execução dos novos
testes teve dois timeouts por seletor exato incorreto no teste (o título contém também fornecedor).
O seletor foi corrigido; a suíte seguinte passou 16/16. Não foi atribuído a credenciais/infraestrutura.

As sete regressões SQL usam a **migração real preparada** e um criador legado local permissivo para
isolar a autorização do wrapper. Provam NULL/false/revogação, tenant/identidade/chave, replay e payload
alterado, grants/RLS, rollback vazio e recusa de rollback com histórico. A concorrência foi observada
em duas sessões sobrepostas, com a segunda esperando lock, e produziu um único pedido/chave.
Não comprovam o corpo legado implantado, o ciclo completo ou comportamento em carga no Supabase.

[Evidência sanitizada e hashes](./evidence/operational-integration-20261020.json).

As observações Actions foram feitas no HTML público real (jobs e resumo agregado). A API GitHub
retorna 403 nesta sessão; isso não impediu push nem comprovação dos estados publicados. Nenhuma CI
histórica foi reiniciada sem alteração de código. Quatro jobs são ignorados por autorização:
`authenticated-concurrency`, `replay-financial`, `network-after-commit`, `two-tenant-concurrency`.
Nunca registrar esses grupos como PASS.

## Dependências

`npm audit --omit=dev`: **zero alertas**. Audit completo: sete pacotes afetados, cinco altos e dois
moderados, nenhum crítico; dois advisories de origem propagados pela árvore de build.

| Pacote instalado | Nível | Alternativa e pendência |
| --- | --- | --- |
| braces 3.0.3 | Alto | Advisory GHSA-vfj7-8cjw-p6xm; sem correção compatível comprovada nesta árvore |
| chokidar 3.6.0 | Alto transitivo | Remoção da cadeia vulnerável pela atualização major Tailwind; não sobrepor major sem revisão |
| fast-glob 3.3.3 | Alto transitivo | `fixAvailable` não prova correção isolada compatível; depende da cadeia micromatch/braces |
| micromatch 4.0.8 | Alto transitivo | Dependência de braces; atualização isolada não comprovou eliminar advisory |
| postcss-nested 6.2.0 | Moderado transitivo | Cadeia de selector-parser; revisão de compatibilidade necessária |
| postcss-selector-parser 6.1.4 | Moderado | Advisory GHSA-rj75-hqrm-r3gf; versão corrigida >=7.1.6 envolve major da dependência |
| tailwindcss 3.4.17 | Alto transitivo | Audit propõe Tailwind 4.3.3, major; migrar em lote separado com regressão visual |

Gate conhecido de dependências PASS, sem novos advisories; não equivale a audit completo sem alertas.
Não executar `npm audit fix --force` nem declarar os sete resolvidos. Nenhuma dependência foi mudada
nestes dois lotes funcionais.

## Pendências e operações separadas

| Jornada/pacote | Estado | O que falta |
| --- | --- | --- |
| A — Fotos | BLOCKED | Sessões QA seguras no executor, Windows/janela exclusiva e validação da fixture; executar todos os checks e restaurar |
| B — Vendas | BLOCKED para persistência | Autorizar fixture/venda TEST, limites, fault injection e estorno/compensação separados; código/mock não homologa |
| C — Estoque | BLOCKED para persistência | Duas unidades/insumo QA exclusivos, snapshot de quantidade/custo e compensação autorizados |
| D — Compras | BLOCKED para persistência | D-Infra de idempotência e D-Jornada separados; ciclo UI receber/pagar/reverter continua desligado |
| E — Financeiro | BLOCKED para persistência | Baselines/ACLs reais revisados, rollbacks de restauração e autorização E-Infra por pacote; depois E-Jornada |
| F — Perfis/autenticação | BLOCKED para homologação real | MANAGER/EMPLOYEE existentes com vínculo/sessões seguras; recuperação/convite reais ainda pendentes, sem criar identidades |
| G — Configuração/idioma | PENDING | PT/EN/PIX/Zelle e fuso configurado têm código/testes; falta jornada real de salvar/reload e conferência operacional |
| H — Terminal | BLOCKED | Backend/adapter e persistência de tentativa, Stripe TEST/leitor e homologação controlada; modo online-only permanece fail-closed |
| Impressora/backup | BLOCKED | Hardware/driver e restauração em destino isolado autorizado; PDF/browser ou export não provam restauração |

Não vincular automaticamente o fuso contábil existente ao idioma de cada operador. Isso alteraria
os limites de dia/relatórios entre usuários da mesma empresa. Preservar o fuso empresarial explícito;
preferências regionais para configuração inicial não são migração do histórico financeiro.

Para D-Infra, o rollback de idempotência recusa apagar chaves utilizadas. Para E-Infra, scripts de
verificação encerrados em ROLLBACK não substituem restauração da definição/ACL anterior. Capturar e
revisar as definições implantadas antes de liberar esses rollbacks. Não aplicar patches nesta fase.
[Plano com limites e compensação B/C/D/E](./QA_OPERATIONAL_PERSISTENT_BATCH_01.md).

## Próxima ação mínima para A-Jornada

Esta sessão não possui Desktop Commander, PowerShell nativo ou sessões QA locais. O notebook pode
estar online por outra integração. A autorização de A-Jornada **já foi concedida**; não falta outra
permissão genérica. Falta execução segura e prova dos gates, sem senhas/tokens enviados pelo chat.

No notebook, preservar eventuais alterações locais e sincronizar pela QA, sem reset/force. Somente
após CI final aprovada, worktree limpa e reserva da fixture contra outros dispositivos:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
.\qa\Invoke-QaPhotoJourney.ps1 -ValidatedCodeSha '441634a5bdc775f30a6e5086a6c5a075c1eddd3d' -ExclusiveWindowConfirmed
```

O wrapper solicita os dados necessários em campos ocultos. Não usar transcript/redirecionamento
de sessão, não inserir credenciais no comando e não publicar snapshot privado. Só compartilhar o
JSON agregado sanitizado. O mutex é local: reservar a janela entre dispositivos é requisito real.

O executor exige fixture exclusiva, foto NULL, pasta vazia, ausência de receita/venda/atualização
prévia; captura snapshot, usa no máximo dois PNG pequenos, executa UI/reload/substituição/remoção,
negação B/anon e compensação só dos objetos próprios. Timeout após envio não autoriza novo envio:
reconciliar positivamente o resultado e usar o checkpoint privado. Recuperação isolada não promove
a jornada inteira a PASS. Apenas 16/16 checks reais e restauração comprovada encerram A-Jornada.

Não reaplicar Storage/quatro policies já instaladas. Preservar auditoria e timestamps de operações.
Sem observação dos objetos reais, o estado antes/depois permanece **NÃO MEDIDO**, não “zero residual”.
