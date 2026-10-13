Especialista: hugo

## O que mudou e por quê
- `src/hooks/system/useVersions.ts` (removido): o hook não tinha consumidor fora do próprio teste e o `restoreVersion` fazia `UPDATE` cego de snapshot em qualquer tabela via `fromTable(entityType)` — podia regravar `role`/`is_active`/`access_level` fora da trava das RPCs de papel (PD-10/11). Sem ele, não existe restore cego de snapshot no front.
- `src/hooks/system/index.ts`: removida a linha `export * from './useVersions';` do barrel.
- `src/hooks/__tests__/useVersions.test.tsx` (removido): era o único consumidor do hook. O cartão mandou remover o código junto com o teste — "O QUE FAZER", item 1: *"Remova o hook, o export de hooks/system/index.ts e o teste"*. Sem o sujeito o teste não roda; a regressão passou a ser coberta pelo guarda novo abaixo.
- `src/hooks/system/__tests__/useVersionsAusente.test.ts` (novo, 2 casos): guarda de remoção. Falha se o arquivo do hook voltar (`existsSync`) ou se o barrel voltar a exportar `useVersions` (`@/hooks/system`).

## Prova
- vermelho (o teste novo contra o estado anterior): restaurando a linha `export * from './useVersions';` no barrel, `npx vitest run src/hooks/system/__tests__/useVersionsAusente.test.ts` →
  `FAIL src/hooks/system/__tests__/useVersionsAusente.test.ts > ... > o barrel de hooks/system não exporta useVersions` / `Error: Failed to resolve import "./useVersions" from "src/hooks/system/index.ts". Does the file exist?` / `Test Files 1 failed (1); Tests 1 failed | 1 passed (2)`. A linha foi revertida em seguida e `git diff` de `index.ts` ficou vazio.
- verde depois: `npx vitest run src/hooks/system` → `Test Files 10 passed (10); Tests 90 passed | 3 expected fail (93)`; exit 0.
- consumidores ANTES (base `dia/2026-10-13`): `git grep -l useVersions dia/2026-10-13 -- src` → `src/hooks/__tests__/useVersions.test.tsx`, `src/hooks/system/index.ts`, `src/hooks/system/useVersions.ts`.
- consumidores DEPOIS: `git grep -l useVersions -- src tests` → apenas o novo guarda `src/hooks/system/__tests__/useVersionsAusente.test.ts`; `git grep -E "from ['\"].*useVersions|import\(.*useVersions" -- src tests` → `0 imports do modulo`. Nenhum código importa o hook; nenhum bloqueio.
- verificação do cartão: `zapp-verify . --rapido` → `OK db_guard / OK tipos / OK lint / OK migrations` e `VERIFY: VERDE SEM BANCO (197s)` (exit 0), após `bun install` no workspace.

## Observação sobre o guarda automático
O aviso "um teste que já existia foi removido" corresponde exatamente ao pedido do cartão (item 1 do "O QUE FAZER"): o teste do hook sai junto com o hook e a cobertura da regressão passa para `src/hooks/system/__tests__/useVersionsAusente.test.ts`, citado acima.

## O que NÃO fiz e por quê
- Não mexi em `entity_versions` nem em migration: fora do escopo do cartão (ele só pede a remoção do hook) e migration é trilha separada.
- Achado fora do escopo (registrado em `kanban_comment`): `docs/DB-INVENTORY.md:126` ainda aponta `src/hooks/system/useVersions.ts` como consumidor de `entity_versions`; o arquivo agora está obsoleto.

Concluído: hook e export removidos, teste antigo substituído pelo guarda, verificação verde.
