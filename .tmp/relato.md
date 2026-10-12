Especialista: worker (ci) (area-verificacao-ci)

## O que mudou e por quê (cartão N-020 — RD-1 / W3-2)
- `scripts/db-audit/check-replay-allowlist-ratchet.py` (novo): o verificador do ratchet. Le a lista
  de aceitas (`replay-known-failures.json`, chave `esperadas`) e o teto
  (`replay-allowlist-baseline.json`, chave `aceitas`) e so aceita lista SUBCONJUNTO do teto. Entrada
  nova -> exit 1 nomeando a entrada; entrada removida -> exit 0; teto/lista ausente, ilegivel ou sem
  a chave -> exit 2 (nao medi, nunca verde). Diferença exata de CONJUNTO, nao faixa nem contagem.
- `scripts/db-audit/replay-allowlist-baseline.json` (novo): o teto de hoje, uma linha por falha ja
  medida no canonico. E a única forma de acrescentar falha nova: baixar o teto no mesmo commit (ato
  explicito, auditavel) — sem isso o replay nem sobe.
- `scripts/db-audit/replay-local.sh`: chama o ratchet ANTES de subir o container (fail-closed cedo,
  sem gastar o setup) e propaga o codigo (1 = lista acima do teto; 2 = nao medi). Cabecalho de
  codigos de saida atualizado.
- `scripts/db-audit/check-replay-allowlist-ratchet.test.sh` (novo): o teste unitário do cartão.
- `scripts/ci/check-test-inventory.mjs`: registra o teste novo na ALLOWLIST (achado do inventario de
  CI quando nasce um `.test.sh` em `scripts/db-audit`), com a justificativa de ser offline.
- `.tmp/relato.md`: este relato (arquivo versionado neste repositorio, como nos cartoes anteriores)
  — e o sexto arquivo do diff; os cinco de codigo/guarda sao os de cima.

## Prova (vermelho antes, verde depois)
- vermelho antes: `bash scripts/db-audit/check-replay-allowlist-ratchet.test.sh` com o verificador
  ausente (estado da base, sem a correção) -> `FALHA: 2: entrada nova -> exit 1 (esperado '1',
  obtido '2')` ... `REPROVOU` / `EXIT=1`. Foi a mutação do caso 2 (entrada nova em
  `replay-known-failures.json`) que discriminou: sem o ratchet ela nao derruba.
- verde depois: `bash scripts/db-audit/check-replay-allowlist-ratchet.test.sh` ->
  `ok : 2: entrada nova -> exit 1`, `ok : 2: nomeia a entrada nova`, `ok : 3: remover entrada passa
  (exit 0)`, `ok : 7: lista real dentro do teto real -> exit 0`,
  `PASSOU: a lista de falhas esperadas do replay so pode diminuir` / `EXIT=0` (19 checagens `ok`).
- casos do teste: 1 lista igual ao teto (0); 2 MUTAÇÃO entrada nova sem baixar o teto (1, e sem
  acusar a entrada ja aceita); 3 entrada removida/reparada (0); 4 lista vazia (0); 5 teto fechado +
  1 aceita (1); 6a-6e fail-closed — lista ausente, teto ausente, JSON quebrado, chave `esperadas`
  faltando, nome vazio do teto (todos 2); 7 os arquivos REAIS do repositorio, sem argumento (0 — o
  teto cobre a lista do dia, nao e vacuo).
- nao quebrei os vizinhos: `bash scripts/db-audit/replay-local-harness.test.sh` -> `PASSOU` (13 ok;
  A exit 0, B exit 2, C SIGTERM, inclui o `docker` de mentira) e
  `bash scripts/db-audit/replay-classify.test.sh` -> `PASSOU: 4 casos` (o classificador nao foi
  tocado).
- `node --test scripts/ci/check-test-inventory.unit.mjs` -> `pass 7`, `fail 0`; e
  `node scripts/ci/check-test-inventory.mjs` nao lista mais o teste novo como orfao (delta vs base:
  os mesmos 4 orfaos pre-existentes, ver abaixo).

## O que NÃO fiz e por quê
- Não editei `.github/workflows/db-guard.yml`: promover o passo é do dono do workflow (o mesmo
  caminho que o cartão N-016 seguiu para o próprio replay). A entrada na ALLOWLIST do inventário
  deixa o teste rastreado e a promoção de uma linha.
- `node scripts/ci/check-test-inventory.mjs` já FALHA na base desta branch, por 4 testes órfãos que
  não são deste cartão (`department-invite-contract-audit-vocabulary`, `talkx-conversion-defaults`,
  `team-chat-media-contract`, `team-direct-conversation-race` — nenhum em db-guard.yml nem na
  ALLOWLIST). Provei o antes/depois com `git stash` no meu diff e a lista se repete; não mexi neles
  (assunto de outro cartão) e deixo registrado em comentário no cartão.
- O passo de replay no db-guard.yml do cartão N-016 não está nesta base (a branch
  `v2/n-016-replay-db-guard-2610121133c45a` não foi integrada ainda); o ratchet é chamado pelo
  `replay-local.sh`, então vale assim que o passo dele entrar, sem depender daquele merge.
