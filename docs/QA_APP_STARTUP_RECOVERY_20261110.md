# QA — recuperação ao carregar o aplicativo

O bootstrap importava o módulo principal antes de montar a proteção de erros. No Chromium local, um HTTP 503 simulado para `/src/App.jsx` impediu a tela de recuperação de aparecer.

Agora o bootstrap instala os sinais locais, monta a proteção e carrega o aplicativo sob `Suspense`. Se o carregamento falhar, a tela acessível em português e inglês oferece recarga manual e uma referência sanitizada. O botão de remontagem continua disponível para falhas de renderização, mas não aparece quando falha a importação: o navegador pode preservar a rejeição até a próxima navegação. Nenhuma operação de negócio é repetida.

No Windows, a regressão no Chromium falhou antes da correção. Depois, as cinco verificações afetadas passaram: a tela apareceu com uma única ação, o sinal não incluiu erro bruto, não houve novo carregamento até a recarga manual e a tela de login voltou após a recarga. O teste bloqueou e conferiu ausência de requisições externas. O build Vite gerou o chunk separado do App e passou. Os dois arquivos `App.jsx` não foram alterados.

Para reproduzir com Chromium instalado pelo Playwright:

```text
node --test qa/app-error-boundary.test.mjs qa/app-startup-recovery-browser.test.mjs
npm run build
```

O job offline correspondente está definido para Linux/Windows. Não houve execução remota de CI nesta validação local. A falha do HTML, do bootstrap ou das dependências dele ainda exige recuperação no nível de hospedagem. Monitoramento, alertas e o ensaio operacional continuam pendentes. Cobertura operacional: 16/60.

O bootstrap também carregava o CSS antes de montar a proteção. Um 503 sintético no CSS reproduziu a tela vazia no Chromium. Com o CSS sob a mesma proteção de carregamento do App, os dois cenários afetados passaram. O build Vite e uma prova adicional contra o CSS compilado confirmaram a tela de recuperação e a recarga manual. A cobertura operacional segue em 16/60.
