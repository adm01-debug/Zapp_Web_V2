Especialista: senior (area-front-componentes — worker (hooks) em apoio à área de telas)

## O que mudou
O diff desta entrega é o trabalho do X055 (cherry-pick de `e05bea15e`, como o cartão pede — o código da entrega
anterior deste MESMO trabalho) mais a correção do relato que a recusa pediu ponto a ponto:

- Ponto 1 corrigido: o `TalkXQueryBoundary` ganhou o bloco 0 — `import { currentTalkXForcedState } from './forcedState';`
  na linha 9 e `const forced = currentTalkXForcedState();` na linha 327 de `src/components/talkx/kit/states.tsx`
  (+23 linhas), com os seis retornos do estado forçado (loading, error, empty, crm, wa, perm) ANTES do
  `if (query.isLoading)`. O bloco só age com a trava aberta: `isTalkXKitEnabled` é
  `env.DEV === true || env.VITE_TALKX_KIT === '1'`; sem `?talkxState=` a função devolve `null` e a precedência
  carregando → erro → vazio → conteúdo não muda.
- Ponto 2 corrigido: a frase falsa "nenhuma linha de produção foi alterada por mim" saiu. O diff mostra código de
  produção alterado, sob trava: `src/components/talkx/kit/states.tsx` (+23), `src/pages/ViewRouter.tsx` (+12/-1:
  entrada `'talkx-kit': Views.TalkXKitView` no `VIEW_MAP` e o `kitOpen` que só libera com a trava aberta, sem
  afrouxar o `canAccess`) e `src/pages/lazyViews.ts` (+3: chunk lazy `TalkXKitView`).

## Números do diff (conferidos com `git diff dia/2026-10-16...HEAD`)
11 arquivos no total: os 3 de produção acima, 7 novos de apoio (`docs/talkx/ESTADOS.md`,
`scripts/talkx/gen-estados.mjs`, `scripts/talkx/gen-estados.unit.mjs`,
`src/components/talkx/__dev__/TalkXKit.tsx`, `src/components/talkx/__dev__/__tests__/TalkXKit.test.tsx`,
`src/components/talkx/kit/forcedState.ts`, `src/pages/__tests__/ViewRouter.talkx-kit-gate.test.tsx`) e este relato
(`.tmp/relato.md`). Arquivos de teste entre eles: 3, com 24 casos declarados —
`TalkXKit.test.tsx` (12 blocos `it` → 17 casos em execução), `ViewRouter.talkx-kit-gate.test.tsx` (2) e
`gen-estados.unit.mjs` (10).

## Prova (comandos rodados nesta rodada, um vitest por vez)
- `npx vitest run src/components/talkx/kit/__tests__/states.test.tsx` → Test Files 1 passed, Tests 8 passed
  (arquivo já existente no repositório, não alterado por esta entrega).
- `npx vitest run src/components/talkx/__dev__/__tests__/TalkXKit.test.tsx` → Test Files 1 passed, Tests 17 passed.
- `npx vitest run src/pages/__tests__/ViewRouter.talkx-kit-gate.test.tsx` → Test Files 1 passed, Tests 2 passed
  (trava aberta rende a prancha; trava fechada cai no bloqueio padrão).
- `node --test scripts/talkx/gen-estados.unit.mjs` → tests 10, pass 10, fail 0 — inclui
  "docs/talkx/ESTADOS.md commitado bate com o código do repositório" (doc × código: `forcedState.ts:10/63/72` e
  `states.tsx:9/327`, as mesmas linhas do Ponto 1).
- `zapp-verify . --rapido` → VERDE SEM BANCO: db_guard OK, tipos OK, lint OK, migrations OK.

Os testes tocam código real: o do gate renderiza o `ViewRouter` REAL (os mocks são só a prancha `__dev__` que ele
libera e a chave `isTalkXKitEnabled`, que é o que abre/fecha a trava no teste); o do gerador lê
`src/components/talkx/kit/forcedState.ts` de produção; o do boundary exercita o `TalkXQueryBoundary` real.

## Arquivos no diff (`git diff --name-only dia/2026-10-16...HEAD`)
docs/talkx/ESTADOS.md
scripts/talkx/gen-estados.mjs
scripts/talkx/gen-estados.unit.mjs
src/components/talkx/__dev__/TalkXKit.tsx
src/components/talkx/__dev__/__tests__/TalkXKit.test.tsx
src/components/talkx/kit/forcedState.ts
src/components/talkx/kit/states.tsx
src/pages/ViewRouter.tsx
src/pages/__tests__/ViewRouter.talkx-kit-gate.test.tsx
src/pages/lazyViews.ts
.tmp/relato.md

## Como o diff foi montado
`git log --oneline dia/2026-10-16..HEAD` mostra dois commits: o cherry-pick de `e05bea15e` (a entrega anterior
deste MESMO trabalho, X055 — `git cherry-pick` como o cartão pede) e o commit deste relato. Nada de outro cartão.
