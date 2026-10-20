Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 87s;OK lint 7s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 17:27, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/contacts/ContactsView.tsx           |   3 -
 src/components/ui/GenericEmptyState.tsx            |   2 +-
 .../ui/__tests__/emptyStates.movimento.test.tsx    | 122 +++++++++++
 .../ui/__tests__/motionEffects.movimento.test.tsx  | 139 +++++++++++++
 src/components/ui/empty-state-illustration-art.tsx | 224 +++++++++++++++++++++
 src/components/ui/empty-state-illustrations.tsx    | 187 ++++-------------
 src/components/ui/motion/effects.tsx               |  37 +++-
 src/providers/AppProviders.tsx                     |  11 +
 .../__tests__/AppProviders.motionConfig.test.tsx   |  29 +++
 9 files changed, 588 insertions(+), 166 deletions(-)
```
- Testes alterados neste cartão (3 arquivo[s]) rodados AGORA no seu commit: Test Files 3 passed (3);Tests 11 passed (11)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: integrar — sem risco detectado


## O que mudou e por quê
- src/providers/AppProviders.tsx: um único `<MotionConfig reducedMotion="user">` passa a envolver a árvore (dentro do ErrorBoundary) — o framer-motion do app inteiro volta a respeitar `prefers-reduced-motion: reduce` (transform/layout) sem cada tela ligar o seu.
- src/components/contacts/ContactsView.tsx: removidos o `<MotionConfig>` local e o import — era o único lugar com a config e agora ela é da raiz.
- src/components/ui/empty-state-illustrations.tsx: ficou só o mapa `illustrations`; o desenho das 13 ilustrações saiu para o módulo novo abaixo (a regra da casa `react-refresh/only-export-components` não deixa o módulo que exporta o mapa também declarar componentes — mesmo corte já usado em `src/lib/chunkReload.ts` etc.).
- src/components/ui/empty-state-illustration-art.tsx (arquivo NOVO, fora da lista do cartão — INDISPENSÁVEL): é onde os 13 componentes das ilustrações passam pelo portão com `useReducedMotion` (com movimento reduzido nenhum recebe `animate`/`transition`, inclusive os `pathLength` infinitos que o `MotionConfig` da raiz NÃO desliga). O corte é obrigatório porque a regra da casa `react-refresh/only-export-components` (com `allowConstantExport`) não deixa o módulo que exporta o mapa `illustrations` também declarar componentes: mantendo tudo num arquivo só, o ESLint acusa 13 avisos novos e o ratchet do pre-commit (`lint-ratchet --staged`, baseline 0) recusa o commit. A alternativa seria um `eslint-disable`, que afrouxa a guarda — foi evitada de propósito. Mesmo corte já usado no repo (`src/lib/chunkReload.ts`, `src/components/calls/paginas.ts`). Nenhum consumidor muda: `illustrations[...]` continua igual.
- src/components/ui/GenericEmptyState.tsx: o selo pulsante virou `motion-safe:animate-pulse` (padrão já usado em 85 arquivos do repo) — com movimento reduzido ele para.
- src/components/ui/motion/effects.tsx: `AnimatedCounter` guarda o valor anterior em `useRef` (era um objeto recriado a cada render, então a animação saía sempre do zero) e o início do quadro é marcado com `undefined` em vez de teste falsy; `Typewriter` mostra o texto inteiro de uma vez com movimento reduzido, chama `onComplete` por ref (callback inline do pai reiniciava o efeito e o texto voltava ao começo no meio da digitação) e não faz `setState` dentro do efeito.

## Prova
- vermelho antes (código original do dia restaurado, os 3 testes novos mantidos): `npx vitest run src/components/ui/__tests__/motionEffects.movimento.test.tsx src/components/ui/__tests__/emptyStates.movimento.test.tsx src/providers/__tests__/AppProviders.motionConfig.test.tsx` → `Test Files  3 failed (3)` / `Tests  8 failed | 3 passed (11)` (as 8 falhas são exatamente as asserções de movimento reduzido / MotionConfig / prevRef / onComplete).
- verde depois: o mesmo comando → `Test Files  3 passed (3)` / `Tests  11 passed (11)`.
- regressão da área (ui + providers + consumidores de estado vazio/ContactsView): `npx vitest run src/components/ui/__tests__ src/providers/__tests__ src/components/gmail/__tests__/EmailThreadView.test.tsx src/components/groups/__tests__/GroupsView.test.tsx src/components/inbox/__tests__/ConversationListSidebar.empty-state.test.tsx src/components/inbox/__tests__/InboxEmptyChat.atalhos.test.tsx src/components/nps/__tests__/NPSDashboard.test.tsx src/components/shared/__tests__/ConversationEmptyState.test.tsx src/components/contacts/__tests__/contactsMotion.test.ts` → `Test Files  34 passed (34)` / `Tests  287 passed (287)`.
- `npx tsc -b --force` → sem saída (exit 0). `npx eslint` nos 5 arquivos alterados → sem saída (0 erros, 0 warnings; `node scripts/ci/lint-ratchet.mjs --staged` → "OK: nenhuma nova divida de lint foi introduzida").

## O que NÃO fiz e por quê
- Não toquei em nenhum outro consumidor de `motion.*`: o `MotionConfig` da raiz cobre todos de uma vez, que é justamente o pedido.
- Não mexi em tela fora dos arquivos do cartão; nada de banco, Edge ou migration (o cartão é de tela).
- As ilustrações entram no mapa pelo mesmo `illustrations[...]` de `empty-state.tsx`/`empty-states.tsx`: nenhum consumidor precisou mudar.
- AVISO AUTOMÁTICO "MOVIMENTO: animação sem 'motion-safe:'" — não procede: as duas linhas apontadas estão no arquivo de TESTE (`emptyStates.movimento.test.tsx`), um comentário e a asserção NEGATIVA `not.toMatch(/(^|\s)animate-pulse(\s|$)/)`, que existe exatamente para provar que o selo NÃO usa a classe crua. A classe de verdade no componente é `motion-safe:animate-pulse` (src/components/ui/GenericEmptyState.tsx); nenhuma animação sem `motion-safe` entrou no diff.
