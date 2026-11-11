# NEXALVO — entrega para o evento de 15/11/2026

A S700 e o Stripe Terminal são requisitos da primeira versão operacional. A conta Stripe dos EUA foi confirmada pelo operador. A entrega do leitor e o ensaio físico seguem pendentes. A cobertura operacional registrada é **16/60**. [Matriz operacional](./NEXALVO_OPERATIONAL_ACCEPTANCE_MATRIX.md)

| Prioridade | Frente | Estado | Evidência e condição de conclusão |
| --- | --- | --- | --- |
| 1 | URL Vercel e acesso | Preview verificado | O [Preview QA](https://masseli-business-manager-ewdbjnobw-lucas-masseli.vercel.app) usa o Supabase TEST. A tela inicial, troca de idioma, acesso direto, reload e arquivos foram conferidos em navegador, com teste adicional em tela móvel. Login e navegação interna de um operador seguem pendentes. [Evidência](./evidence/nexalvo-vercel-preview-20261111.json) |
| 2 | Produtos, preços, impostos, pedidos e vendas | Comprovado no escopo B | Venda Other USD 0,49, desconto/imposto, reload, replay e cancelamento no TEST. Validar os produtos, a tabela de preços, os impostos, os canais e os comprovantes usados no evento. [B #1253](./evidence/sale-b-1253-reported-real-evidence-20261021.json) |
| 3 | Pagamento S700 | Bloqueado | Backend e webhook instalados no Supabase TEST em 11/11, com pós-flight PASS. Faltam acesso ao sandbox e configuração Stripe TEST, entrega/registro da S700, rede do local e ensaio físico. [Evidência da instalação](./evidence/terminal-evento-test-install-20261111.json) |
| 4 | Estoque, persistência e financeiro | Comprovado nos escopos B e C1 | Baixa, estorno, ajuste e transferência conferidos nos escopos registrados. A integração Terminal foi ensaiada localmente. Homologar a venda Terminal no TEST, incluindo estoque, custo, itens e lançamento. [C1](./QA_C1_CHILD_REAL_CLOSURE_20261102.md) |
| 5 | Recuperação sem duplicidade | Pendente | PostgreSQL descartável confirmou reserva concorrente, falha no commit e finalização única. Browser simulado confirmou recarga com a mesma tentativa. Repetir esses cenários na versão publicada e no equipamento real. |
| 6 | Recebimento e compras | Bloqueado | RPCs de recebimento/pagamento/estorno comprovadas sob rollback. Pendente o ciclo persistente por operador no escopo autorizado. [P0.04/P0.05](./P0_04_05_SQL_LIFECYCLE_20261013.md) |
| 7 | Caixa, comprovante e relatórios | Pendente | B comprovou o efeito de venda e estorno no ledger. No ensaio, conferir comprovante, venda não numerário, caixa físico, fechamento, divergência e relatório da unidade em USD no fuso local. |
| 8 | Acesso e permissões dos operadores | Bloqueado | Recuperação Auth MANAGER/EMPLOYEE concluída anteriormente. A renovação da coleta encerrou em 11/11 às 04:04:35 UTC, na fase COLLECTION. Zero envios Auth e zero envios de negócio. Staff suspenso, 0/17 Edge e 0/4 PATCH. Exige janela aplicável, admissão dos arquivos aprovados e nova coleta sob o protocolo revisado. |
| 9 | Fotos e demais funções | Pendente | A comprovou Storage privado e isolamento. Cadastro completo, receitas/custos, clientes, tarefas/ponto, preferências, relatórios e exportações seguem os critérios próprios da matriz. [A/fotos](./evidence/photo-a-journey-user-confirmed-20261021.json) |

## Caminho crítico e prazo

1. O operador consulta estoque e data de entrega da S700 no checkout do Dashboard Stripe, para o ZIP de recebimento. A S700 suporta o fluxo server-driven nos EUA por Wi-Fi ou Ethernet com acessório compatível. Confirmar alimentação, rede do leitor e internet do notebook no local. [S700](https://docs.stripe.com/terminal/readers/stripe-reader-s700-s710) · [Pedidos e envio](https://docs.stripe.com/terminal/fleet/order-and-return-readers)
2. O Preview da QA está publicado em [NEXALVO TEST](https://masseli-business-manager-ewdbjnobw-lucas-masseli.vercel.app), com autenticação da Vercel. A versão é `1813cff21e53b90243298e0ada7508a86696fb8c`. Acesso direto e reload passaram. Falta o login de um operador de teste. O deployment de produção registrado é `dpl_BASNGoZmMwdBZMKrbizbhrE2Lv5E`. [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)
3. Com o pacote instalado no TEST e a origem Preview confirmada, falta identificar o sandbox Stripe, a empresa/unidade QA, a localização do Terminal, o leitor e o limite em centavos. A aprovação da configuração deve incluir esses dados. [Pacote Stripe TEST](./QA_STRIPE_TERMINAL_EVENTO_TEST_20261111.md)
4. Executar sandbox Stripe e ensaio com S700 física antes da abertura do evento. A passagem para modo live requer revisão própria do ambiente, autorização dos efeitos e teste real com valor combinado. O prazo depende da entrega do leitor e da conclusão desses gates. A data de entrega ainda não foi confirmada.

## Ensaio publicado

| Caso | Evidência exigida |
| --- | --- |
| Acesso e permissão | Login de cada operador previsto, empresa/unidade correta e negação de operador sem `manageSales` |
| Venda aprovada | Preço, quantidade, desconto, imposto e USD conferidos antes de cobrar. `succeeded` na Stripe, um pedido, itens, baixa, financeiro e auditoria. Comprovante legível |
| Recusa | Tentativa original conciliada, sem venda paga, baixa ou receita |
| Cancelamento antes da captura | Mesmo PaymentIntent, cancelamento confirmado na Stripe, zero venda paga |
| Perda de conexão | Simular perda após despacho. A interface mostra Verificando pagamento e recupera a tentativa existente após reconexão |
| Reload e reinício | Abrir o PDV novamente, consultar a tentativa e conferir que continuam existindo um intent e uma venda |
| Falha na finalização | Pagamento confirmado e venda pendente até a transação completar. Uma única baixa e um único lançamento após recuperação |
| Fechamento | Separar numerário e Stripe, conciliar saldo físico, relatório, fechamento e registros do processador |

Registrar o commit, deployment, equipamento, modelo, firmware, rede, operador por papel, valores TEST, horários, contagens e estado final. As evidências ficam sem credenciais, dados de cartão ou `client_secret`.

## Orientação ao operador

Abra a URL de operação aprovada, entre com sua conta e confira a unidade e o caixa. Confira os itens e o total. Para cartão, use **Cobrar no leitor** quando o aplicativo confirmar a conexão. Em **Verificando pagamento**, consulte a mesma tentativa e aguarde a confirmação do sistema para entregar o comprovante. Após recusa ou cancelamento confirmado, o operador pode preparar a próxima venda.

No fechamento, conte o numerário e confronte as vendas Stripe com o relatório do processador. Em divergência, registre o pedido, valor e horário e preserve a tentativa para conciliação. A reversão de uma venda Stripe aprovada exige procedimento de reembolso próprio. O fluxo atual bloqueia o estorno financeiro isolado no ERP.
