Especialista: hugo

## O que mudou e por quê
- `src/hooks/system/useVersions.ts` (removido): o hook não tinha consumidor fora do próprio teste e o `restoreVersion` fazia `UPDATE` cego de snapshot em qualquer tabela via `fromTable(entityType)` — podia regravar `role`/`is_active`/`access_level` fora da trava das RPCs de papel (PD-10/11). Sem ele, não existe restore cego de snapshot no front.
- `src/hooks/system/index.ts`: removida a linha `export * from './useVersions';` do barrel.
- `src/hooks/__tests__/useVersions.test.tsx` (removido): era o único consumidor; sem o hook o teste não tem sujeito.
- `src/hooks/system/__tests__/useVersionsAusente.test.ts` (novo): guarda de remoção. Falha se o arquivo do hook voltar (`existsSync`) ou se o barrel voltar a exportar `useVersions` (`@/hooks/system`).

## Prova
- vermelho (o teste novo contra o estado anterior): restaurando a linha `export * from './useVersions';` no barrel, `npx vitest run src/hooks/system/__tests__/useVersionsAusente.test.ts` →
  `FAIL src/hooks/system/__tests__/useVersionsAusente.test.ts > ... > o barrel de hooks/system não exporta useVersions` / `Error: Failed to resolve import "./useVersions" from "src/hooks/system/index.ts". Does the file exist?` / `Test Files 1 failed (1); Tests 1 failed | 1 passed (2)`. (A linha foi revertida em seguida; `git diff` do índice vazio.)
- verde depois: `npx vitest run src/hooks/system` → `Test Files 10 passed (10); Tests 90 passed | 3 expected fail (93)`; exit 0.
- consumidores ANTES (base `dia/2026-10-13`): `git grep -l useVersions dia/2026-10-13 -- src` → 3 arquivos (`src/hooks/__tests__/useVersions.test.tsx`, `src/hooks/system/index.ts`, `src/hooks/system/useVersions.ts`).
- consumidores DEPOIS: `git grep -l useVersions -- src tests` → 1 arquivo, apenas o novo guarda `src/hooks/system/__tests__/useVersionsAusente.test.ts`; `git grep -E "from ['\"].*useVersions|import\(.*useVersions" -- src tests` → `0 imports do modulo`. Nenhum código importa o hook; nenhum bloqueio.
- verde do cartão: `zapp-verify . --rapido` (rodado pelo fechar).

## O que NÃO fiz e por quê
- Não mexi em `entity_versions` nem em migration: fora do escopo do cartão (ele só pede a remoção do hook) e migration é trilha separada.
- Achado fora do escopo (registrado em `kanban_comment`): `docs/DB-INVENTORY.md:126` ainda aponta `src/hooks/system/useVersions.ts` como consumidor de `entity_versions`; o arquivo agora está obsoleto.
