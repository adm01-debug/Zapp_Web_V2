Especialista: worker (geral)

CONCLUÍDO.

## O que mudou e por quê
`ESTADO.md:65` (1 inserção, 1 remoção, commit `93216be6e3`): a âncora publicada da edge `batch-fetch-avatars` passou de `src/hooks/inbox/useInboxBulkActions.ts:143` para `src/hooks/inbox/useInboxBulkActions.ts:165`, porque a linha `:143` deixou de citar a edge depois que a entrega do cartão pai deslocou a chamada. Este é o único arquivo de código deste cartão; os outros quatro arquivos do diff são a faixa do pai (Ponto 1).

## Ponto 1 (cherry-pick da faixa do pai)
Ponto 1: `647c2890fd` e `845f146ccf` (entrega `1400d7071` de t_8016679b) aplicados sobre a ponta `453e6b69f9`. No diff do cartão esses commits aparecem como: `src/hooks/inbox/useInboxBulkActions.ts` 52 +++++---, `src/components/inbox/BulkActionsToolbar.tsx` 22 ++--, `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` 116 +++++-----, `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` 133 ++++++++++.

## Ponto 2 (causa corrigida)
Ponto 2: no diff, `ESTADO.md` tem exatamente o par `-`/`+` da âncora: `-…useInboxBulkActions.ts:143` e `+…useInboxBulkActions.ts:165`. O arquivo da guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` não aparece no diff.

## Ponto 3 (prova verde)
Ponto 3: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`; `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1); Tests 2 passed (2)`; `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`. O sha de entrega do cartão é `93216be6e3` (`git show --stat 93216be6e3` → `ESTADO.md | 2 +-`, 1 insertion, 1 deletion).

## Demais linhas do relato
- vermelho antes: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
- `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1); Tests 27 passed | 1 expected fail (28)`: o `1 expected fail` é o `it.fails` declarado em `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:545`, que já existe na base `453e6b69f9` (`:477`) e pertence à faixa do pai.
- espelho do CI, passo node (`node --test --test-reporter=tap scripts/ci/*.unit.mjs ...`) → a âncora do cartão passa e `ESTADO.md` sai da lista de falhas do passo.
- `.tmp/relato.md` é este relato, versionado pelos commits de fechamento.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` e `845f146ccf` de t_8016679b, cherry-pickados do commit de entrega `1400d7071`, conforme o cartão manda.
