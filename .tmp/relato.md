Especialista: worker (geral)

CONCLUÍDO.

## O que mudou
`ESTADO.md:65`: a âncora publicada da edge `batch-fetch-avatars` passou a apontar para
`src/hooks/inbox/useInboxBulkActions.ts:165`; antes apontava para `:143`, linha que a entrega do
cartão pai (t_8016679b) deslocou. Diff próprio deste cartão: `ESTADO.md`, 1 inserção e 1 remoção,
no commit `93216be6e3`.

## Prova (comandos rodados neste commit)
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`
- `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 2 passed (2)`
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`
- espelho do CI (passo node, `node --test --test-reporter=tap scripts/ci/*.unit.mjs ...` + `grep '^not ok '`): o item `node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` não aparece na saída.
- vermelho antes, mesmo comando de âncora: `not ok 2 - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge` / `error: 'âncora desatualizada: src/hooks/inbox/useInboxBulkActions.ts:143 não cita batch-fetch-avatars'`

## Pontos do cartão (O QUE FAZER)
- Ponto 1: cherry-pick de `647c2890fd` e `845f146ccf` (commit de entrega `1400d7071` de t_8016679b) sobre a ponta `453e6b69f9` de `dia/2026-10-13`.
- Ponto 2: causa corrigida em `ESTADO.md:65`; `scripts/ci/docs-estado-registry-convention.unit.mjs` ficou intacto, nenhuma asserção afrouxada.
- Ponto 3: prova acima, sha de entrega deste cartão `93216be6e3`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` e `845f146ccf` de t_8016679b, cherry-pickados do commit de entrega `1400d7071`, conforme o cartão manda.
