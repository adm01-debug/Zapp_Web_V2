Especialista: worker (geral)

CONCLUÍDO.

## O que mudou e por quê
- `ESTADO.md` (1 inserção, 1 remoção) — a âncora publicada da edge `batch-fetch-avatars` passou de `src/hooks/inbox/useInboxBulkActions.ts:143` para `src/hooks/inbox/useInboxBulkActions.ts:165`, porque a linha `:143` deixou de citar a edge depois que a entrega do cartão pai deslocou a chamada. Commit da correção: `93216be6e3`. Este é o único arquivo de código deste cartão.
- `src/hooks/inbox/useInboxBulkActions.ts`, `src/components/inbox/BulkActionsToolbar.tsx`, `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts`, `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` — faixa do pai (seção abaixo); este cartão não alterou nenhuma linha deles.
- `.tmp/relato.md` — este relato, versionado pelos commits de fechamento.

## Prova
- vermelho antes, sem a correção: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `not ok - ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`
- verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`
- verde depois: `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1); Tests 2 passed (2)`
- verde depois: `npx vitest run src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` → `Test Files 1 passed (1); Tests 27 passed | 1 expected fail (28)` (o `expected fail` é o marcador `test.fails` declarado no teste do pai: zero falhas e zero pulados)
- verde depois: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`
- espelho do CI, passo node (`node --test --test-reporter=tap scripts/ci/*.unit.mjs ...`) → a âncora do cartão passa e `ESTADO.md` sai da lista de falhas do passo.

## Pontos do cartão (O QUE FAZER)
- Ponto 1: cherry-pick de `647c2890fd` e `845f146ccf` (commit de entrega `1400d7071` de t_8016679b) sobre a ponta `453e6b69f9` de `dia/2026-10-13`.
- Ponto 2: causa corrigida em `ESTADO.md:65`; o arquivo da guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` segue como estava.
- Ponto 3: prova acima; sha de entrega deste cartão `93216be6e3`.

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` e `845f146ccf` de t_8016679b, cherry-pickados do commit de entrega `1400d7071`, conforme o cartão manda.
