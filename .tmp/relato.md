Especialista: Íris (area-front-componentes)

## O que encontrei e por quê não commitei
- O cartão pede o ajuste do recorte por período personalizado só com "Até" (sem "De") na aba
  Arquivos: a varredura precisa continuar pelas páginas antigas (`created_at desc`) até cruzar o
  limite `to`, em vez de parar antes.
- Conferi o código ATUAL e a correção JÁ ESTÁ na base `dia/2026-10-12`, integrada no commit
  `8080a2f75 fix(arquivos): conta figurinhas nas contagens do periodo` (trouxe o
  `periodScanReachedBoundary` e os testes "Refazer 1"). O trabalho anterior do cartão
  (v2/t-1cc70fe1, commits 22f008542 e 145703d09) foi rebaseado/squashado nesse commit.
- `src/components/inbox/tabs/FilesTab.tsx` linhas 78–82: `periodScanReachedBoundary` com
  `from === null` para só depois de `oldestLoadedTime <= range.to` (linha 81); linhas 251–255
  ligam isso ao `periodFullyLoaded`/`periodScanning`.
- Como o defeito não existe mais, não há mudança de código a propor — fecho sem commit, como o
  cartão manda.

## Prova
- `git merge-base --is-ancestor 22f008542 HEAD` → NÃO é ancestral (o commit foi reescrito na base),
  mas o mesmo comportamento vive em `8080a2f75`, ancestral de HEAD.
- verde depois: `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.periodo.test.tsx`
  → `Test Files 1 passed (1); Tests 10 passed (10)`, incluindo os testes "Refazer 1" que provam a
  varredura de período só com "Até" (contagem de páginas até o teto `MAX_PAGES_TO_LOAD_ALL`).
- `git status --short` → vazio (nenhuma mudança pendente).

## O que NÃO fiz e por quê
- Nada de código novo: o defeito já não existe na base; reimplementar seria regra a mais que o título.
