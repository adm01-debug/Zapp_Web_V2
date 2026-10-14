Especialista: vera

## O que mudou e por quê (refazer 1 do N-020 — os 5 pontos da recusa)
- `scripts/db-audit/check-replay-allowlist-ratchet.py`: orientacao invertida de "baixar o teto" para "SUBIR o teto" na docstring e na mensagem do RATCHET VIOLADO (Ponto 1); `TypeError` (item nao hasheavel, ex.: objeto) agora cai em "RATCHET NAO MEDIDO", exit 2, em vez de traceback com exit 1 que o replay-local.sh leria como "ratchet violado" (Ponto 3).
- `scripts/db-audit/replay-allowlist-baseline.json`: `_comment` com a orientacao corrigida — entrada nova so entra se o teto for SUBIDO no mesmo commit (Ponto 1).
- `scripts/db-audit/replay-local.sh`: so comentario (linhas do bloco do ratchet) com a orientacao corrigida; nenhum comportamento alterado (Ponto 1).
- `scripts/db-audit/check-replay-allowlist-ratchet.test.sh`: cabecalho do caso 5 alinhado ao caso real ("teto vazio (fechado) contra lista com entrada -> exit 1"); caso 6f novo (item nao hasheavel -> exit 2, diz que nao mediu, sem traceback); comentarios do caso 2 com o vocabulario corrigido ("sem subir o teto") (Pontos 1, 2, 3).
- `scripts/ci/check-test-inventory.mjs`: uma palavra no comentario da entrada N-020 ("sem subir o teto") — mesma classe de defeito do Ponto 1, no arquivo que esta entrega ja tocava; a entrada da ALLOWLIST nao mudou.

## Prova (vermelho antes, verde depois)
- vermelho antes: teste novo (com o 6f) contra o verificador sem a correcao -> `FALHA: 6f: item nao hasheavel -> exit 2 (esperado '2', obtido '1')`, `FALHA: 6f: sem traceback (achei 'Traceback' ...)`, `REPROVOU` / EXIT=1. As outras 19 checagens passaram, entao o 6f e o discriminante.
- verde depois: `bash scripts/db-audit/check-replay-allowlist-ratchet.test.sh` -> `ok : 6f: item nao hasheavel -> exit 2`, `ok : 6f: diz que nao mediu`, `ok : 6f: sem traceback`, `PASSOU: a lista de falhas esperadas do replay so pode diminuir (entrada nova -> exit 1; remover entrada -> passa; teto do repositorio cobre a lista real)` / EXIT=0 (22 checagens `ok`, zero FALHA).
- familia de exit codes preservada (a mesma do replay-local.sh: 0 dentro do teto, 1 violado, 2 nao medi) — os casos 1/2/5 e 6a-6f do proprio teste a verificam.
- sintaxe: `python3 -m py_compile` (PY_OK), `bash -n` no teste e no replay-local.sh (SH_TEST_OK, SH_REPLAY_OK), JSON do teto recarregado (JSON_OK).
- nao quebrei os vizinhos (arquivos copiados 1:1 para replica em /tmp, sem docker e sem banco): `replay-classify.test.sh` -> `PASSOU: 4 casos (verde, inesperada, obsoleta, limpo)`; `replay-local-harness.test.sh` -> `PASSOU` (13 `ok`: A nome unico/rotulo/digest, B bootstrap exit 2, C SIGTERM), rodando o replay-local.sh com o comentario alterado e o `docker` de mentira.
- `git diff --stat` do meu trabalho (contra b80e8f90f): 5 arquivos de codigo, 20 insercoes, 13 remocoes; o commit na ponta soma este relato (6 arquivos, 50 insercoes, 62 remocoes, patch de 19091 caracteres) — abaixo do teto de 25 mil do criterio 3.

## Pontos da recusa anterior
- Ponto 1: resolvido — "SUBIR o teto" em check-replay-allowlist-ratchet.py (docstring e mensagem do RATCHET VIOLADO), replay-allowlist-baseline.json (_comment) e replay-local.sh (comentario); mesma varredura aplicada aos comentarios do teste e do inventario. Acrescentar falha = adicionar a linha no teto no mesmo commit; remover linha = apertar.
- Ponto 2: resolvido — cabecalho do caso 5 alinhado ao caso real em check-replay-allowlist-ratchet.test.sh; o aviso "FORA DA LISTA" continua checado no caso 3, entao nao ha caso faltando.
- Ponto 3: resolvido — `TypeError` capturado como "nao medi" (exit 2) em check-replay-allowlist-ratchet.py; caso 6f no teste prova vermelho->verde (linhas acima).
- Ponto 4: resolvido — este relato comeca com a linha `Especialista: vera`.
- Ponto 5: resolvido — este relato usa "subir o teto no mesmo commit" em todos os trechos.

## Caminhos do mesmo defeito (git grep por "baixa" em scripts/)
- Corrigidos (vocabulario do teto): replay-local.sh:65, check-replay-allowlist-ratchet.py:14 e 76, check-replay-allowlist-ratchet.test.sh:14 e 82, check-test-inventory.mjs:102, replay-allowlist-baseline.json (_comment).
- Nao sao o defeito (outro sentido, nao tocados): `team-membership-bootstrap-owner.test.sh` ("rebaixado" = papel) e `retry-disposable-postgres-test.sh` ("pre-baixada/baixada" = download de imagem).

## O que NÃO fiz e por quê
- Nao rodei `zapp-verify --rapido`: o modo V1 esta congelado (CONGELADO sem MODO_V2 — `hermes-tarefa-iniciar/fechar` recusam), entao a verificacao padrao da fabrica nao executa neste turno; a prova acima e o teste do cartao + vizinhos + sintaxe, todos verdes.
- Nao rodei o inventario em node: a mudanca no check-test-inventory.mjs e de uma palavra em comentario; nenhum arquivo rastreado entrou ou saiu, entao o resultado do inventario nao muda por construcao.
- Commit na branch `v2/n-020-lista-falhas-replay-2610121213b506`, sobre b80e8f90f, com os 5 arquivos de codigo + este relato; sem push (congelado — integracao e do operador).
- Nao rebaseei sobre a dia atual: a ponta dia/2026-10-14 so mudou replay-local.sh no bloco de classificacao (commit 957949e1ed, "MIGRATION CULPADA"), hunk disjunto do meu (bloco do ratchet); nao ha conflito entre eles.
- As skills `area-verificacao-ci`, `armadilhas-vera` e `afinar-ci` citadas no pedido nao existem no meu perfil; trabalhei com as skills fabrica (receber-revisao-de-codigo, refazer-sem-diff-alheio, relato-que-passa, armadilhas-senior).
- Arquivos de codigo do diff (5, `git diff --name-only` sem o relato): scripts/ci/check-test-inventory.mjs, scripts/db-audit/check-replay-allowlist-ratchet.py, scripts/db-audit/check-replay-allowlist-ratchet.test.sh, scripts/db-audit/replay-allowlist-baseline.json, scripts/db-audit/replay-local.sh. O commit leva ainda este `.tmp/relato.md` (versionado neste repositorio como nos cartoes anteriores).
