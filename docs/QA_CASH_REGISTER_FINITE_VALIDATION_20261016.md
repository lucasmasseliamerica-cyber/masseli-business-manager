# NEXALVO — validação finita antes dos RPCs de caixa

Data: 2026-10-16. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma abertura, movimentação, fechamento ou escrita financeira foi executada.

## Problema confirmado e correção

- Movimentação e fechamento em modo remoto chamavam o RPC antes das validações locais.
- Os caminhos locais rejeitavam `NaN`, mas ainda aceitavam infinitos.
- Movimento de caixa agora valida tipo, valor positivo finito e motivo antes de qualquer chamada remota.
- Fechamento agora valida valor físico finito e não negativo antes de qualquer chamada remota.
- O valor encaminhado ao RPC é normalizado para duas casas e o motivo é aparado.
- A prévia de diferença deixa de renderizar quando o valor informado não é finito.

## Evidência local

- Regressões de caixa, idempotência de despesas, segurança e interface: **36/36 PASS**, 0 FAIL, 0 SKIPPED.
- Os testes usam spies para comprovar **zero chamadas RPC** em entradas inválidas.
- Build Vite: **PASS**, 1.578 módulos transformados.
- `App.jsx` e `src/App.jsx`: conteúdo idêntico.

A validação local reduz chamadas inválidas e melhora a mensagem ao operador. A prova da implementação SQL implantada e as jornadas financeiras persistentes continuam sujeitas às autorizações documentadas.
