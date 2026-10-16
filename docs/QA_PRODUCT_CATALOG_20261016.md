# NEXALVO — catálogo de produtos e receitas

Data: 2026-10-16

## Correções

- Criação e edição agora usam uma única validação para nome, SKU, categoria, preço, descrição, foto e receita.
- Nome e SKU duplicados são bloqueados sem diferenciar maiúsculas/minúsculas, inclusive contra produtos inativos.
- Preço não finito, negativo ou vazio é rejeitado; campos textuais são normalizados e limitados.
- Produto ativo não pode depender de item de estoque inexistente ou inativo.
- Ingredientes duplicados, quantidades vazias/não finitas/não positivas e referências inválidas são rejeitados.
- O seletor oferece somente itens ativos ainda não usados; receitas históricas de produto inativo podem continuar referenciando um item inativo.
- A quantidade digitada permanece no formulário até a validação, evitando conversão silenciosa de campo vazio para zero.
- A camada imediatamente anterior a `fn_save_product` repete a validação de identidade, valores e receita.

## Evidência e limite

`qa/product-catalog-regression.test.mjs` executa o validador real e verifica o bloqueio anterior ao RPC nas duas cópias da aplicação. As regressões de imagens/PDV também foram atualizadas para o payload centralizado.

Nenhuma escrita no TEST foi executada. Upload binário e políticas do Supabase Storage continuam pendentes; a entrega mantém somente URL HTTPS validada.
