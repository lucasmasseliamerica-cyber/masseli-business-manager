# NEXALVO — entrega operacional

A operação do NEXALVO continua após o cancelamento do evento de 15/11/2026. O aceite usa a matriz operacional e a checklist cumulativa. Os registros do evento ficam como histórico. A integração de IA está adiada. Cobertura comprovada **16/60**. [Matriz](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md) · [Checklist cumulativa](./NEXALVO_100_PERCENT_CHECKLIST.md) · [Histórico do evento](./QA_NEXALVO_EVENTO_20261115.md)

| Frente | Estado | Critério restante e próxima ação |
| --- | --- | --- |
| Preview e autenticação | OWNER TEST verificado | Sessão real na empresa fictícia QA, unidade LOJA QA - TESTE, navegação para Pedidos, Configurações e Estoque e sessão restaurada após reload. [Evidência](./evidence/nexalvo-operational-continuation-20261111.json) |
| Configuração inicial | Implementada e verificada localmente | Em Configurações → Configuração inicial, o OWNER percorre empresa/impostos, unidades, estoque inicial, produtos e operadores. Cada passo abre o formulário existente. Validar persistência na empresa de teste após salvar e recarregar, com valores da própria empresa. |
| Permissões e staff | Janela pendente | A coleta anterior encerrou em COLLECTION antes de Auth. PID 16660 encerrado, sem despacho da integração. Saldo **17 Edge e 4 PATCH**, incluindo recuperação. A admissão da próxima janela foi preparada e verificada localmente com os dois recibos preservados. Executar o pacote fixado com sessões reais no mesmo processo após confirmação de horário e exclusividade. [Pacote staff](./QA_STAFF_INTEGRATED_RENEWAL_20261111.md) |
| Produtos, estoque e clientes | Evidência parcial válida | Confirmar CRUD com SKU, preço, composição/custo, produto visível no PDV, saldo por unidade e cliente arquivável. Usar fixtures TEST autorizadas e conservar históricos. C1 e fotos continuam válidos no seu escopo. C2 permanece consumido. |
| Pedidos, vendas e relatórios | Evidência parcial válida | Reusar B para venda, reload, replay e cancelamento. Homologar transições, meios de pagamento pendentes, comprovante e totais por período e papel com leitura autenticada. |
| Compras e fornecedores | Fixture P0.05 reconfirmada por leitura | Empresa fictícia, fornecedor, insumo e unidade ativos. Saldo 15,000 em uma posição e zero pedidos com a tag P0.05 do navegador. A jornada persistente precisa de autorização própria. O runner antigo usa compensação automática após falha e fica desativado até a adequação ao limite e à parada por incerteza. |
| Caixa e financeiro | Correção candidata | A leitura do TEST identificou que o fechamento exclui movimentações pela categoria textual. A correção calcula por tipo de lançamento e normaliza Cash, sem tocar registros anteriores. Prova local passou. Revisar o pacote TEST abaixo. Normalização e idempotência na criação de despesa seguem escopos próprios. |
| Stripe TEST | Instalação verificada | Vincular sandbox, empresa/unidade e leitor de teste. Configurar webhook e Secrets do TEST em etapa revisável. Ensaiar com leitor simulado, depois homologar o S700 físico quando disponível. A dependência física se aplica ao aceite de cartão presencial. [Pacote Stripe](./QA_STRIPE_TERMINAL_EVENTO_TEST_20261111.md) |
| Backup e restauração | Ensaio lógico local PASS | PostgreSQL 17 restaurou oito relações de uma venda sintética em base nova, incluindo estoque, financeiro, auditoria e proteção da cobrança. O painel Supabase TEST confirmou plano Free sem backups agendados. Para o aceite integral, preparar exportação lógica do TEST com acesso seguro, restaurar em destino isolado e conferir também Auth, Storage e funções. [Evidência](./evidence/nexalvo-operational-continuation-20261111.json) |
| Produção | Em preparação | Conferir serviços e configurações próprios de produção, homologação por papel, recuperação, plano comercial da Vercel e escopo de cada alteração remota antes da promoção. O Preview continua identificado como TEST. |

## Jornadas no Preview

| Jornada | Resultado observado | Etapa pendente |
| --- | --- | --- |
| Catálogo e PDV | A fixture B ativa apareceu no catálogo e em Nova venda. A fixture de foto histórica aparece no catálogo, está inativa e foi excluída do PDV. | Validar CRUD e foto em produto vendável em escopo de fixture aprovado. |
| Compras e fornecedores | A lista de compras, a entrada Nova compra e o catálogo de fornecedores abriram. | A jornada de compra, recebimento, pagamento e reversão persistentes exige escopo próprio e adequação do runner à parada por incerteza. |
| Clientes e financeiro | O controle Novo cliente e a tela Cash Flow carregaram na sessão OWNER QA. | Cadastro, edição e conciliação com movimentação persistente em fixture aprovada. |
| Relatório de outubro | A interface e a consulta ao TEST concordaram em 251 cancelamentos, 0 pedidos válidos e US$ 0,00 de receita. Período pelo fuso America/New_York. | Período com vendas válidas, conciliação com caixa e exportação por papel. |

A sessão OWNER foi reutilizada a partir da evidência do commit `6deca2b`. As leituras no Preview terminaram no painel inicial. [Evidência das jornadas](./evidence/nexalvo-published-journeys-20261111.json)

## Origens para revisão

A origem fixada para a homologação publicada é `https://masseli-business-manager-kb2n942fr-lucas-masseli.vercel.app`. As duas URLs Preview retornaram `403 ORIGIN_DENIED` em `manage-staff-user`, `platform-admin` e `terminal-payment`. `http://127.0.0.1:5173` retornou 204 com origem exata para staff e administração. O Terminal rejeitou também a origem local.

| Função | Ajuste proposto no TEST | Verificação após autorização |
| --- | --- | --- |
| `manage-staff-user` | Para uso direto no Preview, adicionar somente a origem fixada a `STAFF_ADMIN_ALLOWED_ORIGINS`, preservando as entradas autorizadas, incluindo a origem local. O executor staff atual usa a origem local já aceita. A mesma variável admite destinos de convite na função. A decisão sobre a inclusão precisa contemplar esse efeito antes de uso direto no Preview. | OPTIONS 204 com origem exata para Preview e local e 403 para a origem anterior, se continuar fora da lista. Confirmar `verify_jwt=true`. Convites e alterações da lista Auth Redirect URLs têm escopo próprio. |
| `terminal-payment` | Configurar `STRIPE_TERMINAL_TEST_ALLOWED_ORIGINS` com a origem fixada e manter `STRIPE_TERMINAL_TEST_ALLOW_CHARGES=false` durante a preparação. | OPTIONS 204 para a origem fixada e 403 para as demais origens verificadas. Vínculo e liberação de cobrança dependem do sandbox e da fixture confirmados. |
| `platform-admin` e `terminal-webhook` | Administração local e webhook Stripe com verificação de assinatura. | Acesso de navegador para administração e alteração de webhook exigem escopo próprio. |

A alteração proposta é de configuração do projeto TEST. Nenhum segredo foi modificado nesta verificação. O Stripe Dashboard pediu login. O TEST registrava zero vínculos, tentativas e eventos do Terminal. [Pacote Stripe](./QA_STRIPE_TERMINAL_EVENTO_TEST_20261111.md)

## Janela staff preparada

O PID 16660 e a porta 50332 encerraram na coleta. O diário da integração contém zero encaminhamentos Auth ou de negócio dessa janela. Os hashes dos seis registros encerrados foram conferidos e vinculados ao recibo `458245742c01ae49179dcf1aba4b2e9c0ce8c04bf9a35c59a55c957c68d3306c`. O manifesto local é `70b177897e78b8ca6414164915122bdf4f89ea5f2bb5f779e9fcebfdb9317f67`.

O saldo preservado é **17 Edge, 4 PATCH e 83 GET autenticados** do pacote de negócio. OWNER A e MANAGER têm um GET administrativo e um POST Auth cada no escopo vigente. EMPLOYEE tem um GET e um POST do saldo anterior. A nova admissão exige os dois encerramentos íntegros e a ausência de despacho anterior. A janela expirada foi rejeitada. Doze testes locais passaram, incluindo uma janela futura hipotética e bloqueio de reabertura pelo novo lock exclusivo.

Após a confirmação de uma janela exclusiva de 45 minutos, reservar os últimos 10 minutos para recuperação, registrar a disponibilidade do operador e atualizar as leituras de admissão da fixture, locks e função staff. A coleta mascarada e o executor usam o mesmo processo. Qualquer resultado incerto encerra os encaminhamentos do lote. [Pacote staff anterior](./QA_STAFF_INTEGRATED_RENEWAL_20261111.md)

## Correção do fechamento de caixa para revisão

O operador manteve o pacote em revisão. O pacote prevê uma aplicação da migração [20261111_cash_register_close_ledger_TEST.sql](../migrations/20261111_cash_register_close_ledger_TEST.sql) somente no Supabase TEST `msinksoilkluooxenecy`. SHA-256 `a2b9685abf58a2984c822dee232a13d9b1bec462e521f3004eeb541ddc6f35bc`. A transação valida a definição vigente de `fn_close_cash_register(uuid,numeric,text,text)` pelo MD5 `abc12e6f24daac827c1fea828377e7a0` antes de alterar a função. O DDL mantém assinatura, proprietário e grants e não inclui alteração de dados. Timeouts do DDL são 5 s para lock e 30 s para execução.

No cenário local, abertura de 100, despesa Cash de 60 com a categoria da abertura, entrada Cash de 20 com grafia mista e despesa eletrônica de 9 resultaram em saldo esperado de 60. A definição anterior rejeitou o fechamento sem justificativa. Com a correção, a diferença foi zero e houve uma linha de auditoria. A reaplicação foi bloqueada pela validação da definição anterior. O pós-flight da eventual instalação confere função, assinatura e grants por leitura. A homologação de abertura, despesa e fechamento persistentes exige escopo de fixture e janela próprios.

## Publicação e recuperação

O [Preview TEST atual](https://masseli-business-manager-kb2n942fr-lucas-masseli.vercel.app/) está em READY no deployment dpl_8c6aAPEMkrhLm4pT5mhw56dfB6o6, commit d554b2b67be1f87c72158be0a3c131086f6a2e66. A tela inicial e o reload da rota de autenticação passaram no navegador. A URL anterior abriu novamente e funciona como referência de retorno da QA. O login do OWNER TEST e a restauração da sessão após reload foram conferidos no navegador. O painel Configuração inicial apareceu na conta autenticada.

A equipe `lucas-masseli` está no plano Hobby. A Vercel reserva Hobby para uso pessoal não comercial. A opção comercial equivalente é Pro, com base de **US$ 20/mês**, um assento de deploy e US$ 20/mês de crédito de uso. Assentos extras, consumo adicional e impostos podem aumentar o custo. A mudança é de plano da equipe, em Settings → Billing, com aprovação específica do custo. [Vercel Hobby](https://vercel.com/docs/plans/hobby) · [Vercel Pro](https://vercel.com/docs/plans/pro-plan#platform-fee)

Para voltar a uma versão no TEST, abra a URL imutável da última versão verificada e confira o ambiente, a tela de login e a rota de entrada. O deployment `dpl_Eyp9mRJCC532kFFfzC7w8kkEVZgR` é a referência anterior. [Preview anterior](https://masseli-business-manager-ewdbjnobw-lucas-masseli.vercel.app/)

Uma recuperação de produção usa apenas um deployment anterior já associado à produção e compatível com o esquema vigente. Confirme ambiente e commit antes de promover. Preserve tentativas financeiras pendentes e reconcilie com a operação original. O rollback do frontend não reverte dados nem configurações. [Rollback Vercel](https://vercel.com/docs/instant-rollback)

No ensaio de recuperação, compare o backup e a restauração isolada por escopo, contagem e chaves, confira uma venda e seus lançamentos e confirme acesso com os papéis autorizados. Backup lógico do banco e cópia dos objetos de Storage são verificações distintas. Para incidentes, registre horário, ambiente, versão, módulo, código sanitizado e identificador da operação. Evite incluir tokens, payloads, dados de clientes ou cartão. [Backup e restauração Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

## Roteiro de homologação geral

Entre no Preview com um usuário TEST existente e confira empresa, unidade e permissões. Com a fixture autorizada, configure catálogo e estoque, abra o caixa, registre pedido e venda, confira comprovante e baixa, compare financeiro e relatório e feche o caixa. Examine a mesma operação após reload ou falha de conexão. No cartão, confirme o estado na Stripe antes de entregar o comprovante ou iniciar uma segunda cobrança. Registre o equipamento e o resultado físico da S700 separadamente.
