Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- Retomada da entrega anterior, que falhou no CI: trouxe o commit de codigo dela para esta branch com `git cherry-pick -x eaf1c56bb` (aplicou limpo, sem conflito).
- O cherry-pick repoe 6 arquivos: 3 de producao (`src/hooks/realtime/useSupabaseRealtime.ts`, `src/hooks/chat/useMessages.ts`, `src/hooks/chat/useRealtimeMessages.ts`) e os 3 testes deles em `__tests__/`, que revalidam a conversa e a lista apos queda e retorno de rede.
- Nenhuma linha de producao foi alterada nesta retomada: o codigo e o mesmo da entrega anterior, e o guard do cartao passa nele.

## Prova
- guard do cartao, passo real do CI (`.github/workflows/ci.yml:183`): `node scripts/ci/implicit-any-ratchet.mjs` -> `implicit-any errors: 0 (baseline: 0)`, exit 0.
- suite do guard: `node --test scripts/ci/implicit-any-ratchet.unit.mjs` -> `tests 13 / pass 13 / fail 0`.
- testes da propria entrega: `npx vitest run src/hooks/realtime/__tests__/useSupabaseRealtime.reconexao.test.tsx src/hooks/chat/__tests__/useMessages.reconexao.test.tsx src/hooks/chat/__tests__/useRealtimeMessages.reconexao.test.tsx` -> `Test Files 3 passed (3)` / `Tests 11 passed (11)`.
- verificacao pedida pelo cartao: `zapp-verify full .` -> `OK db_guard / OK tipos / OK lint / OK migrations / OK testes / OK build` -> `VERIFY: VERDE SEM BANCO (1166s)`, rc=0.

## O que NÃO fiz e por quê
- Nao alterei codigo de producao: o guard do cartao passa no codigo atual, e o que faltava era repor a entrega na base nova, o que o cherry-pick fez.
- Nao mexi em migration, Edge Function, CI nem dependencia.
