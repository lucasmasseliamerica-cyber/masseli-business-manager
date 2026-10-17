# NEXALVO — upload privado de fotos de produtos preparado

Data: 2026-10-16

Branch: `automation/nexalvo-qa-actions`

Ambiente permitido para futura validação: Supabase TEST `msinksoilkluooxenecy`

## Entrega funcional

O cadastro de produtos agora aceita JPEG, PNG e WebP de até 5 MB, apresenta prévia local e permite substituir ou remover a foto. O catálogo de produtos e os cartões do PDV usam a mesma imagem resolvida. URLs HTTPS existentes continuam compatíveis.

Uploads privados usam uma referência estável no campo `products.image_url`:

`storage://nexalvo-product-images/<business_id>/<product_id>/<object_id>.<extensão>`

O navegador nunca persiste uma URL assinada. Ao carregar os produtos, solicita URLs assinadas em lote com validade de dez minutos e aceita somente URLs HTTPS da origem Supabase configurada. Referências malformadas, caminhos com travessia, MIME não permitido e arquivos vazios ou grandes falham antes da rede.

## Consistência e compensação

O fluxo segue esta ordem:

1. valida produto e arquivo;
2. envia um objeto novo com UUID e `x-upsert: false`;
3. salva a referência pelo RPC atômico `fn_save_product`;
4. somente após a confirmação do RPC remove a imagem privada anterior;
5. se o RPC falhar, tenta remover o upload ainda não vinculado;
6. se a resposta do RPC confirmar escrita mas o refresh falhar, preserva a imagem nova e informa que os dados em tela podem estar desatualizados.

Se a conexão cair depois que o RPC foi enviado e antes de chegar a resposta, o resultado é incerto. Nesse caso a interface preserva o objeto recém-enviado, orienta atualizar e verificar o produto e não arrisca apagar uma imagem que o servidor talvez já tenha vinculado.

Falha de limpeza nunca reverte ou mascara um produto já salvo. A interface avisa que a pasta privada precisa de verificação administrativa. Remover uma foto também atualiza o produto antes de excluir o objeto, preservando a referência existente quando a gravação falha.

## Storage e isolamento preparados

`migrations/20261016_product_images_storage_TEST.sql` prepara um bucket privado `nexalvo-product-images`, limite servidor de 5 MB e allowlist JPEG/PNG/WebP. As quatro políticas usam o primeiro segmento do caminho e `current_business_id()` para isolar empresas. INSERT, UPDATE e DELETE também exigem `user_can('manageRecipesAndCosts')`; o caminho completo exige três UUIDs e extensão conhecida.

Artefatos adicionais:

- `qa/sql/product_images_storage_preflight_readonly_TEST.sql`: inspeciona bucket, políticas, grants, funções de autorização, coluna/constraints de `products.image_url` e definição implantada de `fn_save_product`;
- `migrations/20261016_product_images_storage_rollback_TEST.sql`: recusa rollback se existir qualquer objeto no bucket;
- `qa/product-image-storage.test.mjs`: cobre validação, caminhos, protocolo upload/sign/delete, ordem transacional no frontend, compensação, políticas e traduções.

## Evidência e limites

- regressões focadas finais de produto/PDV/Storage: **37/37 PASS**, zero falhas e zero skips;
- suíte estática completa do job `build-and-security`: **251/251 PASS**, zero falhas e zero skips;
- `npm run build`: PASS, 1.578 módulos transformados;
- commit publicado: `ad5b13ddb73588a04583b6f8c33437d6d7201467`;
- [GitHub Actions #155](https://github.com/lucasmasseliamerica-cyber/masseli-business-manager/actions/runs/38992693110): **SUCCESS**, 12/12 jobs, preflight autenticado `PASS [OK]` e agregador **446/446 PASS**, zero falhas/skips;
- nenhuma criação de bucket, política, upload, deleção, migração ou escrita no TEST foi executada.

A integração está **APROVADA localmente** e **BLOQUEADA para homologação real** até: executar o preflight no TEST, confirmar que `image_url` e `fn_save_product` aceitam a referência estável, receber autorização específica, aplicar a migração, testar upload/substituição/remoção com um produto QA isolado e provar que outra empresa não consegue assinar, ler, alterar ou excluir o objeto.
