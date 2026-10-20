REFAZER (retomada de 12/10). Esta entrega falhou antes e não tinha NINGUÉM trabalhando nela.

PEDIDO ORIGINAL
fix(catalogo): RPC publica nao deixa mais o usuario zerar o contador de requisicoes do catalogo (#296) (cartão de origem: t_c7191d8c).

POR QUE FALHOU
teste que o CI do GitHub roda passou a FALHAR com este cartão: guarda: scripts/ci/check-test-inventory.mjs; — rode: deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 <arquivo>


TRABALHO ANTERIOR (aproveite, não recomece): branch `v2/t-c7191d8c-2610062100345f` (commit 0f5e7877b); workspace antigo pode não existir mais — use `git cherry-pick` da branch no seu workspace novo, sobre a dia atual.

O QUE FAZER
1. Confira PRIMEIRO se o conteúdo já está na dia atual (`git log -S`/leitura do arquivo): se já estiver, feche o cartão como obsoleto com a evidência (arquivo e commit), sem refazer.
2. Senão, reaplique sobre a dia atual, resolva o motivo da falha acima e prove com o teste do cartão (um vitest por vez) e `zapp-verify . --rapido` verde.
3. Entregas que mexem em ESTADO.md ou FEATURE_REGISTRY.md: não renumere linhas alheias; o teste é estável (cartão t_fb98870f).
