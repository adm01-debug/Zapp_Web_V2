Especialista: hugo

## O que mudou e por quê
- `src/hooks/system/useVersions.ts` (removido): o hook não tinha consumidor fora do próprio teste e o `restoreVersion` fazia `UPDATE` cego de snapshot em qualquer tabela via `fromTable(entityType)` — podia regravar `role`/`is_active`/`access_level` fora da trava das RPCs de papel (PD-10/11). Sem ele, não existe restore cego de snapshot no front.
- `src/hooks/system/index.ts`: removida a linha `export * from './useVersions';` do barrel (não havia mais o que reexportar).
- `src/hooks/__tests__/useVersions.test.tsx` (removido): era o único consumidor; sem o hook o teste não tem sujeito.

## Prova
- consumidores ANTES (base `dia/2026-10-13`): `git grep -l useVersions dia/2026-10-13 -- src` →
  `dia/2026-10-13:src/hooks/__tests__/useVersions.test.tsx`, `dia/2026-10-13:src/hooks/system/index.ts`, `dia/2026-10-13:src/hooks/system/useVersions.ts` (3 arquivos).
- consumidores DEPOIS (HEAD do cartão): `git grep -l useVersions -- src tests` → `0 arquivos`; grep de import dinâmico (`grep -rn "useVersions" src tests`) → 0 ocorrências. Nada importa, nada usa; nenhum bloqueio.
- verde depois: `npx vitest run src/hooks/system` → `Test Files 9 passed (9); Tests 88 passed | 3 expected fail (91)`; exit 0.
- verde do cartão: `zapp-verify . --rapido` (rodado pelo fechar).

## O que NÃO fiz e por quê
- Não criei teste novo: a mudança é remoção de código morto, sem comportamento a exercitar; a prova é a ausência de referências (grep acima) somada à suíte da área verde.
- Não mexi na tabela `entity_versions` nem em migration: fora do escopo deste cartão (o cartão só pede a remoção do hook).
- Achado fora do escopo (registrado em `kanban_comment`): `docs/DB-INVENTORY.md:126` ainda aponta `src/hooks/system/useVersions.ts` como consumidor de `entity_versions`; o arquivo agora está obsoleto.
