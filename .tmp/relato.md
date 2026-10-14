Especialista: worker (geral)

CONCLUÍDO.

## O que mudou
`ESTADO.md:65` — a âncora publicada da edge `batch-fetch-avatars` aponta agora para
`src/hooks/inbox/useInboxBulkActions.ts:165`; a linha anterior (`:143`) deixou de citar a edge quando
a entrega do cartão pai (t_8016679b) deslocou a chamada. Commit da correção: `93216be6e3`.

## Prova (comandos rodados neste commit)
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`
- `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 2 passed (2)`, `Tests 29 passed`
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`
- espelho do CI, passo node (`node --test --test-reporter=tap scripts/ci/*.unit.mjs ...`) → a âncora do cartão passa (`pass 11`, `fail 0`) e `ESTADO.md` sai da lista.

## Pontos do cartão (O QUE FAZER)
- Ponto 1: cherry-pick de `647c2890fd` e `845f146ccf` (commit de entrega `1400d7071` de t_8016679b) sobre a ponta `453e6b69f9` de `dia/2026-10-13`.
- Ponto 2: causa corrigida em `ESTADO.md:65`; o arquivo da guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` segue como estava.
- Ponto 3: prova acima; sha de entrega deste cartão `93216be6e3`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` e `845f146ccf` de t_8016679b, cherry-pickados do commit de entrega `1400d7071`, conforme o cartão manda.
