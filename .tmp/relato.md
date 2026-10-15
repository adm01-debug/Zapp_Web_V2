Especialista: hugo

Refazer 1 — a entrega anterior (front: syncStatus/lastError/lastSyncedAt/needsReconnect) foi retirada pelo limpador porque quebra o ESPELHO DO CI no empilhamento. Ponto único da recusa abaixo, com causa conferida no código.

Ponto 1 — N217 vermelho: `N217: só os 5 testes da régua entram na medição; *auth* novo precisa de classificação`.
Causa: a faixa do cartão pai (Edge, commit 8351952b2, trazida por DEPENDÊNCIA) criou `supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts`. O nome contém "auth" (re-auth) e a varredura da régua (`scripts/ci/edge-coverage-authz.unit.mjs:335`) exige que todo `*auth*` do disco esteja classificado em TEST_FILES ou TESTES_AUTH_FORA_DA_MEDICAO.
Reprodução (vermelho antes): `node --test --test-name-pattern="classifica" scripts/ci/edge-coverage-authz.unit.mjs` → 1 failed: `teste *auth* sem classificação na régua: gmail-reauth-required.test.ts`.
O que mudei: `scripts/ci/edge-coverage-authz.unit.mjs` — incluí `gmail-reauth-required.test.ts` em TESTES_AUTH_FORA_DA_MEDICAO (1 linha + ajuste no comentário). É a decisão explícita que o próprio cabeçalho da guarda manda ("nunca inclusão silenciosa"); nenhuma asserção foi afrouxada, o teste segue reprovando qualquer *auth* futuro sem classificação. Não entrou em TEST_FILES porque o arquivo exercita `gmail-helpers.ts` (imports conferidos), que não é um dos 5 HELPERS medidos — incluí-lo contaminaria a conta.
Verde depois: mesmo comando → 1 passed. Régua N217 completa: 8/8 verdes (6 unitários + medição do zero via deno + docs bate com medição fresca, relatório inalterado).
Frente (entrega anterior mantida, sem alteração): `src/hooks/gmail/gmailTypes.ts`, `src/hooks/integrations/useGmail.ts` + `src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx` → `npx vitest run src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx` → Test Files 1 passed, Tests 5 passed.

Arquivos (`git diff --name-only dia/2026-10-13...HEAD`):
.tmp/relato.md
scripts/ci/edge-coverage-authz.unit.mjs
src/hooks/gmail/gmailTypes.ts
src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx
src/hooks/integrations/useGmail.ts
supabase/functions/_shared/__tests__/gmail-reauth-required.test.ts
supabase/functions/_shared/gmail-helpers.ts
supabase/functions/gmail-cron-sync/index.ts
supabase/functions/gmail-oauth/index.test.ts
supabase/functions/gmail-oauth/index.ts
supabase/functions/gmail-sync/index.ts

Verificações (comandos rodados agora, neste workspace):
- `node --test --test-name-pattern="classifica" scripts/ci/edge-coverage-authz.unit.mjs` → pass 1 fail 0 (antes: fail 1)
- `node --test scripts/ci/edge-coverage-authz.unit.mjs` (8 testes N217) → pass 8 fail 0
- `npx vitest run src/hooks/integrations/__tests__/useGmail.syncStatus.test.tsx` → Test Files 1 passed (1), Tests 5 passed (5)
- `zapp-verify . --rapido` → VERIFY: VERDE SEM BANCO (23s) — OK db_guard/tipos/lint/migrations; banco_local não se aplica (sem migration)
