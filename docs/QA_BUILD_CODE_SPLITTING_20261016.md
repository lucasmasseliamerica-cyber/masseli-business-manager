# NEXALVO — divisão do bundle de produção

Data: 2026-10-16. Escopo: branch `automation/nexalvo-qa-actions`.

## Alteração

O build Vite agora separa React, o conjunto de ícones e eventuais bibliotecas de terceiros em chunks estáveis. Isso permite cache independente e reduz o volume do arquivo principal alterado a cada entrega.

## Evidência local

Medição antes da alteração:

- JavaScript principal: **587,61 kB** (164,18 kB gzip).
- Build concluía com alerta de chunk acima de 500 kB.

Medição depois da alteração:

- Aplicação principal: **426,97 kB** (114,07 kB gzip).
- React: **142,93 kB** (45,78 kB gzip).
- Ícones: **15,22 kB** (3,51 kB gzip).
- CSS: **13,73 kB** (3,72 kB gzip).
- Build Vite: **PASS**, 1.578 módulos, sem alerta de chunk acima de 500 kB.

A soma total permanece próxima porque a alteração organiza o carregamento e o cache; ela não remove funcionalidades. Testes de volume real, rede lenta e métricas de usuário continuam pendentes no item amplo de performance.
