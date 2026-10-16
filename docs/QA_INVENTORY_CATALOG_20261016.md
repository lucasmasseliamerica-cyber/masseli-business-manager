# NEXALVO — Estoque: edição e ciclo de atividade do cadastro

Data: 2026-10-16
Escopo: branch `automation/nexalvo-qa-actions`; nenhuma escrita no Supabase, migração ou operação financeira.

## Problema confirmado

O módulo de estoque já permitia criar e movimentar insumos, mas não oferecia edição dos metadados nem desativação/reativação. O hook Supabase já persistia esses campos de catálogo com isolamento por `business_id`, portanto a lacuna estava na interface.

## Correção

- Editor de nome, SKU, categoria, unidade, mínimo, máximo, validade, fornecedor e observações.
- Quantidade por local e custo médio permanecem somente leitura porque são derivados do ledger.
- Validação de campos vazios, números não finitos/negativos, limites, data, tamanho, nome e SKU duplicados.
- Aba de itens inativos com reativação; itens inativos não podem iniciar recebimento, ajuste, perda ou transferência.
- Desativação confirmada preserva estoque, movimentos e referências históricas.
- Um insumo usado pela receita de produto ativo não pode ser desativado até a receita ou o produto ser atualizado.
- Transferências agora exigem origem e destino ativos e distintos antes do RPC.

## Evidências

Comando executado:

```text
node --test qa/inventory-catalog-regression.test.mjs qa/inventory-usability-regression.test.mjs qa/product-catalog-regression.test.mjs qa/ui-responsive-regression.test.mjs
```

Resultado: **40/40 PASS**, 0 falhas, 0 skips.

```text
npm run build
```

Resultado: **PASS**, Vite transformou 1.578 módulos e gerou o bundle. Permanece o aviso conhecido de chunk principal acima de 500 kB; não é falha de compilação.

## Limites

Esta etapa comprova validação, integração do fluxo e compilação local. A persistência autenticada dos novos controles no Supabase TEST e a revisão visual em navegador ainda não foram executadas; nenhuma funcionalidade ampla de estoque foi declarada integralmente homologada por esta evidência.
