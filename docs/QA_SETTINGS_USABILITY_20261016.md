# NEXALVO — configurações comerciais e fuso

Data: 2026-10-16

## Correções

- O fuso da empresa, já existente na tabela `businesses`, agora pode ser selecionado na interface e controla os limites de dia usados por dashboard, relatórios e filtros operacionais.
- A moeda carregada da empresa agora alimenta efetivamente o formatador monetário compartilhado.
- Nome da empresa, moeda, fuso e taxa de imposto são validados antes de qualquer escrita.
- A taxa aceita apenas números finitos entre 0 e 100; o formulário preserva a entrada inválida para exibir o erro em vez de convertê-la silenciosamente para zero.
- Listas comerciais exigem ao menos uma opção, limite de 80 caracteres e unicidade sem diferenciar maiúsculas/minúsculas.
- A camada de persistência repete a validação antes da primeira chamada ao Supabase, protegendo também chamadas fora do formulário.
- A auditoria de alteração passa a registrar o fuso escolhido.

## Evidência

`qa/settings-usability-regression.test.mjs` exercita a implementação real de limites de data em `America/Los_Angeles` e `America/Sao_Paulo`, valida entradas válidas/inválidas e verifica o bloqueio anterior à escrita nas duas cópias da aplicação.

Nenhuma migração ou escrita no Supabase foi executada. Persistência autenticada e revisão visual nos fusos suportados continuam parte da homologação real.
