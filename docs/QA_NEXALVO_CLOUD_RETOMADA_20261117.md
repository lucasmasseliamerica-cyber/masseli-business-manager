# NEXALVO — retomada operacional no Cloud (17/11/2026)

Data de referência: America/New_York. Este registro complementa o checkpoint do notebook;
não substitui arquivos, diários ou autorizações existentes no Windows.

## Base e procedência

- Branch exclusiva: `automation/nexalvo-qa-actions`. A cópia Linux foi atualizada por
  fast-forward até `e050b0b46567c63553d66d7816850e7bec844cfd`, sem reset ou perda de arquivos.
- O workspace desta sessão é `/workspace/masseli-business-manager`. Ele não compartilha a
  pasta `C:\Users\lucas\Documents\NEXALVO-P005-ISOLATED`.
- `QA_NEXALVO_CHECKPOINT_RETOMADA_20261117.md` e o commit Windows `c4be296` não estavam no
  checkout/histórico QA obtido. Não se afirma que foram recuperados, integrados ou alterados.
  Foi reproduzido independentemente o defeito Cash descrito pelo operador.
- Cobertura mais recente informada pelo operador: **20/60 (33,33%)**. O detalhamento
  versionado disponível ainda corresponde ao histórico 16/60. Falta o checkpoint/recibo
  de 17/11 para associar os quatro critérios adicionais às linhas da matriz.
- Nenhum critério operacional foi promovido por testes locais, build ou CI deste lote.

## Resultados encerrados — preservar, sem repetição

Os resultados abaixo foram confirmados pelo operador no pedido de retomada. Não foram
reexecutados nem receberam nova inspeção SQL nesta sessão.

| Recorte | Estado preservado | Qualificação |
| --- | --- | --- |
| C1 | PASS 18/18 real | Encerrada; não executar launcher antigo ou catálogos de outubro |
| Staff v7 | PASS 13/13 API | Restauração confirmada; API não comprova UI; perfis continuam inativos |
| Caixa | PASS 4/4 RPC | Não equivale à jornada pela interface |
| Compras `_02` | PASS 4/4 UI | Estoque, custos e financeiro restaurados |
| Cinco migrações caixa/compras | Instaladas/verificadas | Não reaplicar; recibos detalhados ainda estão no Windows |
| Origens staff | Configuradas/verificadas | Não repetir probes já consumidos |
| A/fotos e B #1253 | Encerradas | Sem upload, venda, estorno ou recuperação repetidos |
| C2 | BLOCKED histórico | Marcadores/tentativa consumida preservados, sem retry |

## Correções publicadas e evidências locais

`0ee443a0dfc6a7d0ece6d3af5a7f78c3b61db149` corrige a leitura do caixa:

- A abertura normalizada visualmente para `income` deixa de entrar em Vendas Cash mesmo
  se um registro histórico contiver `sale_id` indevido. A reprodução foi US$ 145 → US$ 45.
- O sinal de cada lançamento usa o tipo original (`ledgerType`, com fallback legado).
  Despesa vinculada a venda não vira venda Cash negativa.
- Aberturas não normalizadas também são excluídas do saldo corrente; despesas legítimas
  com a mesma categoria textual continuam incluídas.
- Estornos, receita bruta, valor contado e diferença armazenada permanecem separados.
- Corrigida a tradução PT-BR do filtro de intervalo personalizado.
- `App.jsx` e `src/App.jsx` permanecem byte a byte idênticos. Não houve alteração SQL.

`e0e7bbf1758bec42f63565a80c97975d4a82f70c` atualiza apenas patches compatíveis de build:
Vite 6.4.4 → 6.4.6 e postcss-selector-parser 6.1.4 → 6.1.6. O lockfile remove também
`cssesc`, dependência que deixou de ser necessária. Tailwind permanece 3.4.17.

| Verificação | Resultado | Natureza da evidência |
| --- | --- | --- |
| Reprodução antes do patch Cash | 8 FAIL / 4 PASS | 12 testes novos, ledger sintético; falhas esperadas comprovam o defeito |
| Cash e regressões de cálculo/validação afetadas | 26/26 PASS, zero skips | TAP local; repetidos após mudança do compilador/parser por risco técnico concreto |
| UI EN desktop / PT-BR mobile | 2/2 PASS, zero skips | Chromium real, backend interceptado, reload e fechamento armazenado 60/diferença 0 |
| Artefato compilado em modo Preview após patches | Build PASS + 2/2 UI PASS | Servido localmente; sem sessão/registro real do TEST |
| Comparação dos artefatos antes/depois dos patches de dependência | 6/6 arquivos idênticos | SHA-256, incluindo CSS; não houve alteração visual gerada pelo parser |
| CI offline nº 6 | SUCCESS, Linux e Windows | [Execução 44138544187](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/44138544187), SHA `0ee443a` |

Os testes de browser abortam gravações, inclusive a reconciliação acessória de alertas.
Login e respostas do backend são sintéticos. Não comprovam persistência ou homologação
financeira real. São **28 cenários locais únicos**, não 56 funcionalidades: Linux e Windows
executam os mesmos comandos (26 testes unitários e dois de browser por sistema).

CI da revisão de dependências: [offline nº 7 / 44141264320](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/44141264320).
**SUCCESS: dois jobs executados, Linux e Windows, com todas as etapas aprovadas.**
O resultado final está no [recibo sanitizado deste lote](./evidence/nexalvo-cloud-operational-20261117.json).
Os workflows QA integrais nº 279 e nº 280 são ignorados pelo marcador offline já existente;
**SKIPPED não significa PASS**. Nenhum orçamento de autenticação real foi consumido.

## Dependências — gate integral ainda reprovado

A QA integral nº 278 em `e050b0b` reprovou no gate npm, não no build. O agregador ficou
incompleto e os jobs autenticados dependentes não executaram. Não se reutiliza esse run
como aprovação integral da candidata.

| Auditoria local | Antes | Depois |
| --- | --- | --- |
| Pacotes com alertas de desenvolvimento/build | 14: 11 altos + 3 moderados | 11 altos, zero moderados/críticos |
| Dependências de runtime | 0 | 0 |
| Política `qa/npm-audit-policy.mjs` | FAIL | FAIL, preservada sem ampliar allowlist |

Os patches removem GHSA-rj75-hqrm-r3gf (parser) e GHSA-8g5g-mxqh-grgj (Vite).
Os 11 pacotes restantes propagam GHSA-fc5q-39xc-vjpf de picomatch:
`anymatch`, `chokidar`, `fast-glob`, `fdir`, `micromatch`, `picomatch`, `readdirp`,
`sucrase`, `tailwindcss`, `tinyglobby` e `vite`.

Na consulta npm deste lote, a versão publicada mais recente de picomatch é 4.0.7 e o
advisory abrange `<=4.0.7`. Não foi encontrada correção publicada compatível.
`fixAvailable` também sugere downgrade do Vite e mudanças maiores; isso não comprova
uma solução segura. Não foram aplicados `audit fix --force`, downgrade ou migração Tailwind 4.
O advisory descreve ReDoS ao processar globs adversariais no tooling; não é prova de
exploração do aplicativo publicado. Ainda exige tratamento antes do aceite de segurança.

## Preview, rede e acesso Windows

A referência histórica `e050b0b` e seu Preview permanecem preservados:
https://masseli-business-manager-4oj8jbkxw-lucas-masseli.vercel.app/.

A candidata `e0e7bbf` foi compilada em modo Preview com alvo TEST e Terminal desabilitado.
Há arquivo ZIP e manifesto SHA-256 no diretório de evidências Cloud. Isso **não comprova
publicação**. Esta sessão não possui ferramenta/autenticação Vercel utilizável nem acesso
Desktop Commander. Tentativas HTTPS ao TEST e ao Preview terminaram em CONNECT 403 do
proxy antes de chegar aos serviços. A integração automática Git/Vercel não foi confirmada.
Não se afirma que o notebook ou o Preview estejam indisponíveis globalmente.

Não foi possível consultar o recibo de paginação nem o estado efetivo do Windows. A
solicitação UAC anterior não é considerada concluída. Nenhuma restauração, encerramento de
processos, reinício ou comando remoto foi repetido. O restabelecimento da paginação automática
já está autorizado, se ainda necessário; reinício exige aviso prévio para salvar o trabalho.

## Caixa UI, relatórios e orçamento

Abrir 10 / entrada Cash 2 / fechar 12 com diferença zero permanece BLOCKED nesta sessão.
O último relato de consumo é 0/3, mas o **saldo atual é desconhecido** sem o diário original.
Nenhum login, refresh, GET de identidade ou autorização de escrita é presumido disponível.

Antes de admitir a jornada, conferir no Windows: checkpoint mais recente, journal, guards,
ponte SQL, nomes/SHAs reais dos arquivos e candidata efetivamente publicada. Reconciliar
qualquer envio anterior; só então atualizar vínculos/origens afetados, conferir uma sessão
OWNER B legítima e o escopo vigente. Não usar service_role como sessão, gerar credenciais
ou reativar staff. Bloquear gravações acessórias de alertas.

Leituras de Histórico/Relatórios devem aproveitar o fechamento 60/diferença 0 e a compra
`_02`/reversão já existentes: período, fuso, totais e exportações. Esses registros não foram
consultados nesta sessão; o cenário sintético correspondente não os substitui.

Consumo deste lote Cloud: **zero autenticações reais, zero envios financeiros/de estoque,
zero SQL/migrações, zero operações Storage e zero exportações**. Isso não altera o saldo
histórico dos diários do Windows. Nenhuma produção, main, conta, claim ou perfil foi alterado.

## Backup — alternativa preparada, sem execução

Backup permanece **SUSPENDED**. O estado de eventual captura posterior à admissão Windows
é desconhecido; não inferir zero exportações nem repetir captura sem reconciliar seu diário.
Não usar espaço em claro no C:, formatar D:, apagar arquivos ou modificar BitLocker.

Alternativa a revisar depois da estabilização: fluxo binário nativo `pg_dump -Fc` → `age`
com destinatário público previamente aprovado → arquivo cifrado exclusivo em D:. A chave
privada fica fora do notebook/repositório; nenhum dump temporário em claro ou contêiner de
3 GiB é necessário. Uma fila de tamanho limitado transfere bytes entre os processos;
memória limitada, uma captura e sem servidor PostgreSQL/restauração local simultâneos.

Pré-requisitos: recibo da paginação **e** leitura efetiva do Windows, pressão de memória
normalizada, journal reconciliado, ferramentas verificadas, destino/método de proteção e
limite de captura aprovados, espaço livre atualizado. Os 7,48 GiB livres e pico 1,91 GiB são
históricos, não admissão atual. FAT32 limita cada arquivo a menos de 4 GiB; impor teto,
interromper sem retry se atingido e preservar a captura parcial cifrada para reconciliação.

No PowerShell 5.1, não usar o pipe textual entre processos binários. Usar transporte nativo
de bytes com contrapressão, saída exclusiva `.partial`, códigos de saída de ambos os
processos e confirmação antes de renomear. A proteção por destinatário elimina a necessidade
de gravar uma senha de criptografia em disco. O segredo de conexão continua apenas no
mecanismo seguro existente. Não há executor admitido ou exportação disparada por este plano.

A conferência de restauração completa, Storage e Auth exige destino isolado protegido e
escopo próprio; um hash do arquivo cifrado não prova restaurabilidade. Adequação operacional
e memória devem ser demonstradas antes de retomar qualquer backup.

## Próximos gates e pedido único de complementos

1. Restabelecer o acesso existente ao notebook ou disponibilizar apenas o checkpoint de
   17/11 e recibos **sanitizados**: paginação efetiva/resultado, journal de caixa UI e seus
   saldos, nomes/SHAs dos guards/ponte e estado de eventual exportação. Não enviar senhas,
   tokens, dumps, checkpoint privado ou dados pessoais.
2. Restabelecer a integração Vercel existente e o acesso de rede ao projeto TEST/Preview,
   com a política de rede do ambiente permitindo os respectivos domínios e a API Vercel.
   Não criar credenciais pelo chat, contratar plano ou promover produção.
3. Após conciliar esses recibos, conferir a candidata de código contra `c4be296` no Windows,
   preservando ambas as linhas de histórico. Publicar/verificar um único Preview de código
   no projeto existente, atualizar somente admissões afetadas e retomar o escopo autorizado
   que ainda tiver saldo e gates. Documentação isolada não justifica outro deployment.

As restrições acima são limites efetivos de acesso/evidência desta sessão. Novos testes
operacionais, Auth, sandbox Stripe e exportações não são liberados automaticamente.
IA adiada; Oracle descartada; evento cancelado; Terminal/cobranças desabilitados. Supabase
Free preservado, sem contratação. A verificação de planos, configuração de produção,
recuperação e critérios de lançamento continua obrigatória antes de qualquer promoção.
