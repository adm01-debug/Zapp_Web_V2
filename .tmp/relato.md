Especialista: iris (area-front-componentes) — worker (telas e componentes)

## Como resolvi o motivo da retomada
Motivo registrado: a guarda que o CI do GitHub roda passou a falhar com a entrega anterior —
`scripts/ci/implicit-any-ratchet.mjs`.
- Reprodução no estado atual (dia/2026-10-11), mesmo comando do passo do CI:
  `node scripts/ci/implicit-any-ratchet.mjs` -> `implicit-any errors: 0 (baseline: 0)` (exit 0). NÃO reproduz.
- Testes da própria guarda, rodados como no job de unit tests do CI
  (`node --test scripts/ci/implicit-any-ratchet.unit.mjs`, que é o padrão de `.github/workflows/ci.yml:101`):
  `tests 13`, `pass 13`, `fail 0`.
- O comando com `deno test` que o cartão sugere dá erro de harness (o `spawn` do compilador sob o runner do
  deno volta sem status por falta de `--allow-write`); o harness que o CI usa de fato é `node --test`, e por ele
  a guarda passa. Não há defeito na guarda.

## O que mudou e por quê
- Confirmei no código ATUAL (dia/2026-10-11) que o pedido do chip "Arquivadas" JÁ está implementado, pelo commit
  `32c68d56a feat(inbox): filtro Arquivadas lista so conversation_status archived`:
  `src/components/inbox/conversation-list/StatusChips.tsx:10` (`ChipTab` inclui `'archived'`), `:49-57` (conta por
  `contact.conversation_status === 'archived'` e exclui as arquivadas de Todas/Não lidas/Em atendimento/Aguardando),
  `:67` (`{ id: 'archived', label: 'Arquivadas', count: counts.archived, icon: Archive }`). Nenhuma mudança de
  produção foi necessária.
- `src/components/inbox/__tests__/StatusChips.test.tsx`: cherry-pick do commit `aa1d5c5ff` da branch anterior
  `v2/chip-arquivadas-statuschips-refazer-c338-...`, que acrescenta os casos do item 4 do critério que faltavam na
  base, renderizando o componente REAL: (a) "Arquivadas" mostra `0` quando não há arquivadas; (b) clicar em
  "Arquivadas" chama `onChipTabChange('archived')`; (c) o chip ativo recebe o estilo de ativo e os demais seguem
  inativos.
- `.tmp/relato.md`: este relato (arquivo versionado do projeto).

## Prova
- `npx vitest run src/components/inbox/__tests__/StatusChips.test.tsx` -> `Test Files 1 passed (1); Tests 12 passed (12)`.
- `node scripts/ci/implicit-any-ratchet.mjs` -> `implicit-any errors: 0 (baseline: 0)` (exit 0).
- `node --test scripts/ci/implicit-any-ratchet.unit.mjs` -> `tests 13; pass 13; fail 0`.
- `zapp-verify . --rapido` -> `OK db_guard 0s; OK tipos; OK lint; OK migrations; VERIFY: VERDE SEM BANCO`.
- `zapp-verify full .` (rodado neste workspace) -> `OK testes 1189s; OK build 20s; VERIFY: VERDE SEM BANCO (1403s)`.

## Nota sobre vermelho→verde
A implementação do chip já estava na base (entregue por outro cartão, `32c68d56a`), então estes testes cobrem
comportamento já existente e passam também na base: não há linha de produção para ficar vermelha neste cartão.
O que eles provam é o item 4 do critério que a base NÃO cobria (0 quando não há, clique em `archived`, estilo ativo),
como regressão do comportamento pedido.

## O que NÃO fiz e por quê
- Não alterei `StatusChips.tsx`: o pedido já está implementado na base; mudar sem defeito seria escopo indevido.
- Não mexi em `src/i18n/index.ts`: os rótulos dos chips não existem lá (o único "Resolvidas" de `index.ts` é
  `dashboard.resolvedToday`, outro assunto), então o cartão não pede chave nova.
- Não toquei em migration, Edge Function, dependência, nem no que Arquivar faz hoje (`archiveContact`/`bulkArchive`).
