# NEXALVO — finalização funcional do PDV

Data: 2026-10-15. Escopo: branch `automation/nexalvo-qa-actions`. Nenhuma venda persistente, migração, conta, convite, deploy ou escrita no Supabase foi executada.

## Funcionalidades entregues

- Cadastro e edição de produto com URL de imagem HTTPS, limite de 2.048 caracteres, prévia e fallback visual.
- Persistência pelo campo `image_url` já suportado por `fn_save_product`; protocolos inseguros, `data:` e valores inválidos são rejeitados antes do RPC.
- Lista de produtos com miniaturas e cartões rápidos no PDV para adicionar ou incrementar produtos no carrinho.
- Validação do método de pagamento, canal e localização ativa antes da venda.
- Bloqueio de desconto/taxa não finitos e desconto total superior ao subtotal antes de qualquer escrita.
- Rejeição do adaptador de cartão tratada sem promessa não capturada ou tela presa. O operador recebe orientação para verificar o terminal/provedor antes de repetir; o NEXALVO não registra a venda nesse caminho.

## Evidência local

- Regressões focadas e relacionadas: **37/37 PASS**, 0 FAIL, 0 SKIPPED.
- Novas regressões do PDV: **11/11 PASS** nas cópias `App.jsx` e `src/App.jsx`.
- Build Vite: PASS, 1.578 módulos.
- Auditoria de runtime: zero vulnerabilidades.
- Aviso conhecido: bundle principal com aproximadamente 557,53 kB antes de gzip.

## Pendências preservadas

- Upload binário, substituição e remoção em Supabase Storage dependem da definição e validação das políticas de Storage; esta entrega suporta URLs HTTPS existentes.
- Métodos de cartão continuam usando o simulador explicitamente identificado até existir integração autorizada com provedor/terminal.
- A jornada persistente real no TEST continua fora desta entrega.

## Continuação — busca e categorias (2026-10-16)

- O catálogo rápido busca por nome, SKU e categoria com normalização de acentos e caixa.
- Busca e categoria podem ser combinadas e limpas no estado sem resultados.
- Filtrar a vitrine não remove nem duplica linhas já adicionadas ao carrinho.
- Regressões afetadas: **35/35 PASS**, zero falhas/skips; build Vite PASS. Nenhuma venda ou escrita Supabase foi executada.
