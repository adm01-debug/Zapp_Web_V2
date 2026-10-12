Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- Retomada da entrega anterior (branch v2/recuperacao-realtime-queda-refazer-t-0aa-...), que falhou no CI: trouxe o commit de codigo dela para esta branch com `git cherry-pick -x eaf1c56bb` (aplicou limpo, sem conflito).
- O cherry-pick repoe 6 arquivos: 3 de producao (`src/hooks/realtime/useSupabaseRealtime.ts`, `src/hooks/chat/useMessages.ts`, `src/hooks/chat/useRealtimeMessages.ts`) e 3 de teste em `__tests__/` (revalidacao de conversa e lista apos queda e retorno de rede).
- Nenhuma linha de producao foi alterada nesta retomada: o codigo e identico ao da entrega anterior, porque o defeito do pedido (guard implicit-any) nao existe no codigo atual.

## Prova
- guard do cartao, passo real do CI (`.github/workflows/ci.yml:183`): `node scripts/ci/implicit-any-ratchet.mjs` -> `implicit-any errors: 0 (baseline: 0)` / exit 0. Nao reproduz.
- suite do guard: `node --test scripts/ci/implicit-any-ratchet.unit.mjs` -> `tests 13 / pass 13 / fail 0`.
- testes da propria entrega: `npx vitest run src/hooks/realtime/__tests__/useSupabaseRealtime.reconexao.test.tsx src/hooks/chat/__tests__/useMessages.reconexao.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx` -> `Test Files 3 passed (3)` / `Tests 11 passed (11)`.
- verificacao pedida pelo cartao: `zapp-verify full .` -> `OK db_guard / OK tipos / OK lint / OK migrations / OK testes / OK build` -> `VERIFY: VERDE SEM BANCO (1166s)`, rc=0.

## O que NAO fiz e por que
- Nao alterei codigo de producao: o guard do cartao passa no codigo atual; o que faltava era repor a entrega na base nova, e o cherry-pick fez isso.
- Fora do meu diff e da minha area, a bateria de guards do CI mostra dois pontos ja existentes e alheios ao diff (so toco `src/hooks/**`): `scripts/ci/check-test-inventory.mjs` acusa 3 `*.test.sh` de `scripts/db-audit` sem citacao em `db-guard.yml`, e `scripts/qa/medir-tipografia.cjs --check` acusa `tsxFontFamilyLiteral: 4 (teto 1)`. Registro em comentario no cartao; nao corrijo aqui.
- Nao mexi em migration, Edge Function, CI ou dependencia.
