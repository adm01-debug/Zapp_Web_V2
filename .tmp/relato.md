Especialista: Íris (area-front-componentes)

## O que encontrei e por quê não commitei código
- O cartão pede o ajuste do recorte por período personalizado só com "Até" (sem "De") na aba
  Arquivos: a varredura precisa continuar pelas páginas antigas (`created_at desc`) até cruzar o
  limite `to`, em vez de parar antes — e a tela não pode anunciar vazio antes de a varredura terminar.
- Conferi o código ATUAL e o comportamento pedido JÁ ESTÁ na base `dia/2026-10-12`, integrado no
  commit `8080a2f75 fix(arquivos): conta figurinhas nas contagens do periodo` (ancestral de HEAD).
  O trabalho anterior do cartão (v2/t-1cc70fe1, commits 22f008542 e 145703d09) foi reescrito/squashado
  nesse commit; por isso não há mudança de código a propor e fecho sem commit de código, como o
  cartão manda.
- `src/components/inbox/tabs/FilesTab.tsx` linhas 78–82: `periodScanReachedBoundary` — com
  `from === null` só para depois de `oldestLoadedTime <= range.to` (linha 81), exatamente o defeito
  do cartão; linhas 251–255 ligam isso a `periodFullyLoaded`/`periodScanning`.

## Critério de pronto
- Item "Adicione teste em `src/components/inbox/tabs/__tests__/FilesTab.periodo.test.tsx`: período
  personalizado só com \"Até\", `hasMore` true e itens carregados todos mais novos que o `to`":
  JÁ EXISTE no mesmo teste do commit `8080a2f75`, descrito em
  `FilesTab.periodo.test.tsx` linhas 327–390 (`describe('... só com \"Até\" (refazer 1)')`):
  - `it('carrega páginas antigas até cruzar o \"Até\" e só então para')` (328–364): `hasMore: true`,
    dois itens mais novos que o `to`, prova que NÃO anuncia vazio, mostra o skeleton e passa a chamar
    `fetchNextPage` (linha 351), parando só quando o item antigo que casa aparece (linha 361).
  - `it('ao atingir o teto de páginas a varredura termina sem skeleton infinito')` (366–389): prova
    o teto `MAX_PAGES_TO_LOAD_ALL` e o aviso no fim.
- Item implementado em `FilesTab.tsx` linhas 78–82 + 251–255 (linha e comportamento acima).

## Prova
- verde depois: `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.periodo.test.tsx`
  → `Test Files 1 passed (1); Tests 10 passed (10)` (inclui os 2 testes "refazer 1" acima).
- `git status --short` → vazio (nenhuma mudança pendente).

## O que NÃO fiz e por quê
- Nada de código novo: o defeito já não existe na base; reimplementar seria regra a mais que o título.
