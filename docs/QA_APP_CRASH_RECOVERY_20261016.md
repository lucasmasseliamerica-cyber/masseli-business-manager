# NEXALVO — recuperação segura de falhas da interface

Data: 2026-10-16

Branch: `automation/nexalvo-qa-actions`

## Entrega funcional

A raiz React agora é protegida por `AppErrorBoundary`. Uma falha inesperada durante renderização ou ciclo de vida deixa de produzir uma página vazia: o usuário recebe uma tela acessível em inglês ou português, com foco no título, instrução objetiva e opções para remontar o aplicativo ou recarregar a página.

A recuperação não repete RPC, pagamento, venda, movimento de estoque ou qualquer outra operação. O botão de remontagem cria uma nova árvore React; o botão de recarga executa uma navegação normal do navegador.

## Sinal sanitizado

Erros capturados pela barreira, erros globais e promises rejeitadas sem tratamento emitem o evento local `nexalvo:client-error`. O evento contém somente:

- identificador aleatório de correlação;
- horário ISO;
- origem limitada a uma allowlist.

Mensagem, stack, objeto de erro, sessão, token e dados da empresa não entram no evento, no `localStorage` ou em requisição de rede. Isso cria um contrato seguro para uma integração futura de observabilidade sem contratar ou ativar um serviço nesta etapa.

## Evidência

- regressões focadas: **23/23 PASS**, zero falhas e zero skips;
- suíte estática completa do job `build-and-security`: **255/255 PASS**, zero falhas e zero skips;
- `npm run build`: PASS, 1.579 módulos transformados;
- nenhuma escrita Supabase, migração, operação financeira ou deploy foi executado.

## Limites

A barreira React recupera falhas de renderização e ciclo de vida. Erros de handlers e tarefas assíncronas continuam sendo tratados pelos fluxos funcionais existentes; quando escapam sem tratamento, geram somente o sinal global sanitizado. Persistência, envio e alerta externo de telemetria ainda não foram implementados e permanecem parte do item amplo de observabilidade.
