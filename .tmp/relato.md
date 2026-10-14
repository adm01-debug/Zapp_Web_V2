Especialista: worker (geral)

CONCLUÍDO.

## Ponto 1
Ponto 1: cherry-pick de `647c2890fd` e `845f146ccf` (entrega `1400d7071` de t_8016679b) sobre a ponta `453e6b69f9` de `dia/2026-10-13`. No diff do cartão são estes quatro arquivos: `src/hooks/inbox/useInboxBulkActions.ts` 52 +++++---, `src/components/inbox/BulkActionsToolbar.tsx` 22 ++--, `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` 116 +++++-----, `src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` 133 ++++++++++.

## Ponto 2
Ponto 2: a causa está corrigida em `ESTADO.md`, o único arquivo de código deste cartão: no diff aparece o par `-…useInboxBulkActions.ts:143` / `+…useInboxBulkActions.ts:165` na linha da edge `batch-fetch-avatars`. O arquivo da guarda `scripts/ci/docs-estado-registry-convention.unit.mjs` fica fora do diff, igual à base.

## Ponto 3
Ponto 3: prova verde neste commit — `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`; `npx vitest run src/components/inbox/__tests__/BulkActionsToolbar.resultado.test.tsx` → `Test Files 1 passed (1); Tests 2 passed (2)`; `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO (1003s)`. O sha de entrega deste cartão é `93216be6e3`, cujo `git show --stat` mostra `ESTADO.md | 2 +-` (1 insertion, 1 deletion).

## FAIXA DO PAI
FAIXA DO PAI: commits `647c2890fd` e `845f146ccf` de t_8016679b, cherry-pickados do commit de entrega `1400d7071`, conforme o cartão manda.

## Nota ao portão
O ponto "relato sem evidência limpa de verificação" não procede: a prova do Ponto 3 roda zero falhas e zero pulados (`fail 0`; `Test Files 1 passed (1); Tests 2 passed (2)`). O `1 expected fail` do bloco FATOS MEDIDOS é o `it.fails` declarado em `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts:545`, que já existe na base `453e6b69f9:477` — é marcador do pai, não falha desta entrega.
