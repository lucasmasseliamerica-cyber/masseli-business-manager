# A-Jornada de fotos — executor preparado, homologação real BLOCKED

Data do cliente: 20/10/2026. Escopo: QA `automation/nexalvo-qa-actions`, somente Supabase TEST
`msinksoilkluooxenecy`. A autorização explícita desta tarefa cobre a jornada isolada de fotos;
não é necessário pedir novamente autorização genérica de A-Jornada. Não cobre migrações, novas
políticas, novos produtos/contas, finanças, Stripe ou comercialização automática.

[Evidência agregada e hashes](./evidence/photo-a-journey-preparation-20261020.json).

## Fixture inativa — correção de 21/10/2026

O usuário confirmou a fixture existente com `active=false` e `image_url=null`. O preflight agora
aceita `active` estritamente booleano, inclusive `false`; não reativa o produto. Os guards de save,
conciliação e compensação continuam exigindo o valor exato do snapshot, preço/SKU preservados e
receita vazia. Nome/empresa, OWNER A/B, permissões, ausência de vendas/objetos históricos, janela
exclusiva, snapshot e compensação permanecem obrigatórios. Valores NULL/ausentes/textuais são negados.

Regressão reproduzida antes da correção: 1/1 FAIL (`DEDICATED_FIXTURE_REQUIRED`). Depois: 32/32
Storage/guards e 4/4 cenários de fotos no navegador PASS, zero falhas/skips; build PASS. O browser
usa HTTP inteiramente simulado: confirma produto inativo durante uploads/saves/reloads/remoção,
preço/SKU/receita preservados e eventos novos de auditoria sem reescrever histórico anterior.
Nenhum upload persistente foi executado nesta correção. O cenário real continua sem homologação;
consultar a CI associada ao novo commit QA antes de atualizar `ValidatedCodeSha` no notebook.

## Estado vigente — integração publicada, A-Jornada real BLOCKED

O commit `9b381e891af2b6f0e0e783560168bb6039e5503f` já está no GitHub e foi integrado
por merge com `396afacaa8d4bf256edaeb22032c45c5954f7126`, sem recriar commits ou force push.
O merge publicado `50fc57b5e864d983a6a0b0df457f2c7c0d3cb84a` foi aprovado na
[CI #187](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39540216913):
**612/612 TAP PASS**, oito jobs PASS e quatro grupos persistentes BLOCKED/ignorados pelo gate.
Storage + guards: **30/30 PASS** locais. Os dois testes de URLs assinadas estão corrigidos.
O lote funcional posterior também passou na [CI #188](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39541023169), **627/627**.

**O bloqueio de Git e das asserções antigas está resolvido.** O bloqueio real continua sendo a
execução segura com sessões QA A/B, janela exclusiva e fixture validada. Não há Desktop Commander,
PowerShell/Windows nem sessões QA nesta sessão Linux. Isso não afirma que o notebook está offline.
As sessões de CI comprovam o preflight A/B daquela execução; não fornecem credenciais locais nem
comprovam a jornada real de fotos. Não foram medidos snapshots reais Storage antes/depois.
Não houve execução do runner persistente; não foi removido nenhum objeto histórico.

CI final do lote operacional `441634a`: [#189](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39541323542), **629/629 PASS**, oito jobs PASS e quatro grupos persistentes BLOCKED.
Usar o SHA de código aprovado e o comando Windows no
[relatório vigente](./QA_OPERATIONAL_INTEGRATION_20261020.md). A autorização A-Jornada já existe;
não solicitar outra autorização genérica nem reexecutar A-Infra. A tabela abaixo é histórica e
não descreve os bloqueios atuais. Sua evidência original foi preservada.

## Registro histórico — preparação antes da integração de 9b381e8

**BLOCKED, sem gravações TEST.** Infraestrutura Storage privada instalada/quatro políticas e
preflight OWNER A/B PASS foram informados pelo usuário. Não foram apresentados como nova
execução local. A sessão atual não tem Desktop Commander, sessões QA A/B ou acesso à pasta
Windows. Isso é limitação desta sessão, não declaração de indisponibilidade global do notebook.

| Item | Estado | Evidência/pendência |
| --- | --- | --- |
| Preservar/sincronizar alterações remotas | CONCLUÍDO | Fast-forward `6fcc60f` → `454500da688e1d49e1ea734e8f40cdbddd76fbbb`; preservados `795610e` e `454500d`, sem force push |
| Commit exato `9b381e8` | BLOCKED | Não existe nos objetos locais nem no histórico QA recebido; GitHub `/commit/9b381e8.patch` retorna 404. SHA completo ainda desconhecido; não foi recriado |
| Publicar `9b381e8` e integrar o novo pacote | BLOCKED | O checkout que possui esse commit precisa disponibilizá-lo no GitHub; nenhuma nova publicação neste avanço |
| Correção de upload com resultado desconhecido | CONCLUÍDO no código local | HTTP 408/5xx e transporte perdido preservam o caminho; formulário trava novos saves/uploads/desativação até recarga/conciliação |
| Regressões locais afetadas | PASS | **50/50**, zero falhas/skips, incluindo 15 guards/contratos do executor |
| Browser React/Vite | PASS, HTTP simulado | **8/8**, zero falhas/skips; três cenários de fotos, incluindo upload e save incertos |
| Testes de Storage antigos no remoto | FAIL | **13/15 PASS, 2 FAIL**: asserções esperam `startsWith("/storage/v1/object/sign/")`, mas o código usa prefixo mais restrito com bucket. Correção indicada pelo usuário está no commit ausente `9b381e8` |
| Build | PASS | Build Vite local aprovado; dependências versionadas não alteradas |
| Executor Windows | Preparado; runtime BLOCKED | Arquivo PowerShell com prompts ocultos/ACL privada e runner Node. Windows/PowerShell indisponíveis; imagem Microsoft para análise AST não pôde ser baixada (403). Não afirmar validação nativa |
| CI remota atual | FAIL | [#185](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/39531682082), commit `454500d`: 2 jobs falhos, 10 ignorados. Não é CI deste novo pacote local |
| Jornada persistente e isolamento de objetos | BLOCKED | Sessões reais, commit/CI e fixture exclusiva ainda não verificáveis nesta sessão |
| Snapshot real antes/depois e compensação | NÃO EXECUTADOS | Zero logins QA, uploads, saves, deletes Storage, migrações ou mutações comerciais enviados por esta execução |

Os logs detalhados da CI não estavam disponíveis pela API nesta sessão. O HTML público comprova
os estados dos jobs. A reprodução local comprova as duas asserções desatualizadas; não inferir
uma contagem TAP integral da CI a partir desses resultados locais.

## Correção funcional local

O upload anteriormente tratava erro de transporte ou gateway como falha definitiva. O modal
tentava remover o caminho e permitia novo envio mesmo sem confirmar a primeira gravação. Isso
poderia disputar com uma gravação ainda em andamento. A correção:

- marca upload 408/5xx/transporte como incerto e mantém seu caminho único;
- não apaga nem reenvia automaticamente esse caminho;
- bloqueia upload, save, remoção e desativação, inclusive após fechar/reabrir o modal na mesma página;
- a memória da página não é journal durável; após reload, a retomada controlada usa o snapshot privado do executor e exige conciliação;
- mantém rejeição definitiva 403 como falha de permissão, sem afirmar commit;
- traduz a mensagem de resultado desconhecido PT/EN;
- preserva o comportamento de salvamento já confirmado e erro apenas de refresh.

O consolidado estático é **63/65 PASS, 2 FAIL, 0 SKIPPED**, incluindo o subset 50/50 e
os 13/15 de Storage. Não somar esses subsets novamente.

Dois testes browser demonstram objetos simulados preservados e ausência de novo POST/DELETE
após resultado desconhecido. O terceiro demonstra o ciclo completo e retorno a zero objetos
simulados. **Nenhum desses resultados comprova persistência Supabase.**

## Executor preparado

Arquivos: `qa/Invoke-QaPhotoJourney.ps1`, `qa/photo-journey.TEST.mjs`,
`qa/photo-journey-core.mjs` e `qa/photo-journey-guards.test.mjs`.

1. Exige branch limpa QA, ancestral `9b381e8` e SHA de código validado. Só aceita commits
   posteriores ao SHA aprovado se alterarem exclusivamente `docs/`.
2. Credenciais QA A/B são solicitadas por `Read-Host -AsSecureString`, convertidas por BSTR
   somente em memória de processo e restauradas/removidas no `finally`. Não entram no histórico
   de comandos, argumentos, arquivos, logs, Git, traces ou estado de browser exportado.
3. Não utiliza credencial administrativa para autenticar usuários. Confirma Auth/perfil ativo,
   OWNER A/B fixos, contexto de empresa, `manageRecipesAndCosts` e leitura cruzada negada.
4. Só aceita a fixture `ZZ_QA_PHOTO_CATALOG_20261021_EXCLUSIVE`, única na empresa A e com estado
   `active` booleano preservado (inclusive `false`), com foto
   originalmente **NULL**, pasta vazia, sem receita, itens de venda ou eventos prévios de atualização
   desse produto. Foto/histórico existente gera BLOCKED; não limpar para forçar um preflight verde.
5. Exige uma janela operacional exclusiva confirmada e mutex local contra dois executores no
   notebook. Snapshot e comparação antes de cada escrita detectam alterações observadas. **Isso
   não é um lock distribuído:** sem exclusividade contra outros dispositivos, não iniciar.
6. Snapshot de produto/receita e journal dos caminhos ficam fora do Git, em TEMP com ACL somente
   do usuário Windows; em Linux, modos 0700/0600. Nenhuma sessão, senha ou URL assinada é gravada.
7. Vite isolado usa `127.0.0.1:4187`, sem herdar credenciais privadas; browser em contexto efêmero,
   sem trace/HAR/vídeo/screenshot. Não assume que o servidor local em 5173 seja o código validado.
8. Guarda de rede só libera save da foto da fixture, uploads PNG próprios (máximo dois, cada
   um menor que 5 MiB), assinatura/leitura autorizadas, deleção de caminhos registrados e auditoria
   relacionada. Bloqueia reconciliação automática de alertas e outras mutações do aplicativo.
9. O teste exercita preview, offline antes do envio, upload real e save com resposta perdida
   **depois** de confirmar o commit por leitura, reload, substituição, reload, remoção e reload.
   Interromper a resposta não simula o banco: a futura execução consulta o TEST real.
10. Para cada uma das duas imagens, verifica bytes armazenados para A, negação de GET e assinatura
    a OWNER B/anon e negação do endpoint público. Não tenta acessar usando uma URL assinada de A
    como B: essa URL é uma capacidade temporária e não prova isolamento por usuário.
11. Auditoria é preservada. Registra explicitamente `QA Photo Reconciled` após observar o primeiro
    commit cuja resposta se perdeu; não inventa um evento normal de save que a UI não executou.
12. Compensa só os caminhos gerados, nunca históricos ou ainda referenciados. Um estado incerto
    bloqueia compensação; códigos da falha primária e da compensação são preservados no agregado.

`updated_at` deve avançar com os saves, e a auditoria nova deve permanecer. A restauração
compara campos de negócio, receita e imagem NULL; não reescreve timestamps nem apaga histórico.
Hashes físicos dos snapshots podem diferir por essa razão e serão apresentados como diferentes.

## Execução no notebook após receber o commit e a CI

A primeira ação indispensável é sincronizar o commit que existe apenas no Windows. No checkout
QA indicado, preserve as alterações e publique a branch sem force push:

```powershell
Set-Location 'C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED'
git status --short --branch
git push origin automation/nexalvo-qa-actions
```

Se o push disser non-fast-forward, não forçar: preservar as duas linhas por merge da QA remota.
O pacote local do Codex deve depois integrar o `9b381e8` original por merge, preservando ambos os
históricos; não usar cherry-pick para recriar o SHA informado. Publicar e exigir CI do código novo.

Depois da publicação e CI aprovadas, atualizar o checkout e executar, na janela exclusiva real:

```powershell
.\qa\Invoke-QaPhotoJourney.ps1 -ValidatedCodeSha '<SHA completo do código aprovado na CI>' -ExclusiveWindowConfirmed
```

O parâmetro de janela exclusiva confirma uma condição operacional, não pede novamente a
autorização de A-Jornada já concedida. Não informe credenciais pelo chat. O script prepara
Playwright/Chromium antes dos campos ocultos, sem alterar package.json/lockfile. Execução nativa
Windows continua requisito de validação, não comprovado pelo teste estático do script.

## Recuperação

O script mantém o arquivo privado `photo-recovery.json` e informa só sua pasta. Não iniciar nova
jornada se houver snapshot não restaurado. Após resultado desconhecido, primeiro usar:

```powershell
.\qa\Invoke-QaPhotoJourney.ps1 -ValidatedCodeSha '<SHA validado>' -ExclusiveWindowConfirmed -RecoveryFile '<snapshot privado>' -ReadOnlyRecovery
```

Essa etapa não grava no banco/Storage. Só libera a compensação se observar positivamente o upload
com bytes/hash esperados ou a nova versão do produto com a referência pretendida. Ausência estável
de objeto/alteração **não prova rollback** e permanece BLOCKED, sem repetir gravação.

Depois de conciliação positiva, usar o mesmo comando sem `-ReadOnlyRecovery` para compensar
apenas os objetos registrados e restaurar a referência NULL. Recuperação isolada permanece
BLOCKED para homologação: não substitui as etapas da jornada que não foram executadas.

## Critérios reais ainda necessários

OWNER A/B, isolamento de produto, permissões, fixture exclusiva, snapshot, preview, falha de
upload/recuperação, upload+reload, resposta perdida conciliada, troca+reload, remoção+reload,
negação de objetos para B/anon, auditoria, restauração da fixture e zero objetos residuais:
**16 checks obrigatórios ainda BLOCKED nesta execução**. Estado Storage antes/depois: **não
medido**, não zero. A-Jornada não está 100% aprovada.

Matriz operacional permanece **13/60 (21,67%)**, 15 PENDENTES e 32 BLOQUEADOS. Atualizar os critérios
de fotos somente depois de evidência sanitizada real. Infraestrutura confirmada pelo usuário
substitui o bloqueio histórico de bucket ausente, sem aprovar upload/isolamento por inferência.

Ainda faltam, além das fotos: sessões reais MANAGER/EMPLOYEE e autenticação completa; jornadas UI
de vendas/estoque/compras/caixa com compensação e concorrência; patches financeiros/idempotência
autorizados; conciliação de relatórios/configurações; impressão física, backup/restauração e
resiliência; integração Terminal online-only e pagamentos Stripe TEST; tratamento dos alertas
de build. Site comercial, checkout e licenciamento automático permanecem congelados.
