# Dossiê — claude__feat-talkx-x054-cmdk-261108-0100 (PR #2788)

**Ref:** `origin/claude/feat-talkx-x054-cmdk-261108-0100` · tip `2bbbe224e` · merge-base `b5ad544ec` (2026-11-07) · 2 commits à frente, não ancestral de `origin/main`.

## Propósito
X054 — ⌘K com dono único: `useTalkXCommandItems` passa a buscar campanhas/segmentos/templates via `useQuery` com `enabled=open` (em vez de ler o cache), remove o listener duplicado de ⌘K do `CommandPalette.tsx` legado, e adiciona botão "Buscar (⌘K)" + trilha clicável no `TalkXView`. Commits: `19179f9bf`, `2bbbe224e`.

## Veredito: **INCORPORADA** (confiança alta) · apagar branch: **seguro**

A main absorveu o trabalho pela PR #2793 (`81a8cd979`, "corrige erros TypeScript X054 … Substitui o draft PR #2788"), que trouxe os mesmos 6 arquivos + `kit/primitives.tsx` (prop `onItemClick` do `ModuleBreadcrumb`, que faltava na branch e quebrava o typecheck). Depois, #2869 (`e903a7e51`) refinou as queryKeys. O que resta de diferença entre a branch e a main são **rejeições deliberadas** da main, não trabalho perdido.

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/hooks/integrations/useTalkXCommandItems.ts` | INCORPORADA e **superada**: main tem `useQuery` + `enabled` + `staleTime` + `STATUS_LABEL.sending` idênticos; única diferença é a queryKey `['talkx-campaigns','cmd-palette']` (idem segments/templates) em vez da chave plana da branch — mudança proposital para não envenenar o cache de `useTalkX.ts` | `git show origin/main:src/hooks/integrations/useTalkXCommandItems.ts` (linhas 33-80); `git log -S"'cmd-palette'"` → `e903a7e51 fix(talkx): isola queryKeys do cmd-palette para evitar cache poisoning (#2869)` |
| `src/hooks/integrations/__tests__/useTalkXCommandItems.test.ts` | INCORPORADA: mesmos 4 testes; só muda `setQueryData` para a subchave `'cmd-palette'` e `item?.action?.()` (TS2722 corrigido na #2793) | `git show origin/main:<arquivo>`; corpo do commit `81a8cd979` |
| `src/components/keyboard/CommandPaletteHost.tsx` | INCORPORADA a parte útil (`useTalkXCommandItems(onNavigate, open)` — main linha 29). A branch também **removia a busca de contatos** (`searchContactCommands`), que já existia na base (#2728, `83e821b8a`) — regressão que a main corretamente não aceitou | `git show 81a8cd979 -- src/components/keyboard/CommandPaletteHost.tsx` (só 1 linha alterada); `git show b5ad544ec:…/CommandPaletteHost.tsx` linhas 6 e 24 já tinham contatos |
| `src/components/CommandPalette.tsx` (legado) | INCORPORADA a parte útil: main removeu o listener `keydown` ⌘K duplicado (`81a8cd979`). Main manteve o listener `open-global-search` (linhas 61-65) que a branch apagava; componente legado só é importado em `src/hooks/ui/__tests__/preferencias-storage-bloqueado.test.tsx:37`, não é montado no app → sem efeito em produção | `git grep "components/CommandPalette'" origin/main -- src`; `GlobalKeyboardProvider.tsx:91` é o dono real do evento |
| `src/components/talkx/TalkXView.tsx` | INCORPORADA: `useGlobalKeyboard`/`openCommandPalette` (l.10, 330), botão Buscar (l.573-578), `ModuleBreadcrumb … onItemClick` (l.535), `ArrowLeft`/"Voltar à campanhas" removidos. A branch também **re-adicionava `p-4`/`p-6`** nos estados de carregamento — paddings que #2712 (`f4e5a10c6`, "evita padding duplicado nos carregamentos do Talk X", já na base) tinha removido de propósito; main manteve sem padding (l.60, 487) | `git grep -n -E "openCommandPalette|onItemClick|Buscar" origin/main -- src/components/talkx/TalkXView.tsx`; `git merge-base --is-ancestor f4e5a10c6 b5ad544ec` = sim |

## Lacunas a recuperar
Nenhuma. Os 3 resíduos (remoção da busca de contatos no Host, remoção do `open-global-search` no palette legado, paddings `p-4`/`p-6` no TalkXView) são ou regressões contra fixes já na main ou cosméticos sem efeito — não portar.

## Banco / edges / workflows
Não há migration, edge ou workflow na branch (`git diff --stat` só toca `src/`).

## Verificação adversarial

**Parecer: CONCORDO — INCORPORADA, apagar branch é seguro.** Tentei refutar com o diff completo `b5ad544ec..2bbbe224e` (5 arquivos, 155+/60-) e com `diff` arquivo-a-arquivo entre `origin/main` e o tip da branch. Não sobrou um único hunk de valor ≥ médio fora da main.

### Diff arquivo-a-arquivo (main vs tip) — tudo o que a branch tem de diferente

| Arquivo | Resíduo exclusivo da branch | Classificação |
|---|---|---|
| `useTalkXCommandItems.ts` | só as queryKeys planas `['talkx-campaigns']` (idem segments/templates) contra `['talkx-campaigns','cmd-palette']` + comentário da main | **Regressão.** `e903a7e51` (#2869) isolou a subchave para o ⌘K não regravar o cache de `useTalkX.ts` com `select('id,name,status').limit(50)`. Portar seria reintroduzir o cache poisoning. Todo o resto (useQuery, `enabled`, `staleTime: 60_000`, `STATUS_LABEL.sending`, `TalkXCampaignSlim`, `openTalkXItem`) é byte-a-byte igual na main |
| `__tests__/useTalkXCommandItems.test.ts` | mesmas queryKeys planas + `item?.action()` em vez de `item?.action?.()` | **Regressão.** `item?.action()` é o TS2722 que travava o CI Gate (corpo de `81a8cd979`). Os 4 testes, inclusive o `open=false (enabled=false)`, estão na main |
| `CommandPaletteHost.tsx` | remoção de `searchCommandSources`/`searchContactCommands` e `onSearch={searchCatalogProducts}` | **Regressão.** A busca de contatos já existia na merge-base; main a manteve (`origin/main:…/CommandPaletteHost.tsx:6,21-27,36`). A parte útil (`useTalkXCommandItems(onNavigate, open)`) está na main, linha 29 |
| `CommandPalette.tsx` (legado) | remoção do `useEffect` do `open-global-search` (main l.60-65) | **Cosmético sem efeito + regressão em potencial.** O componente só é importado por `src/hooks/ui/__tests__/preferencias-storage-bloqueado.test.tsx:37`; não é montado no app. O dono real do evento é `GlobalKeyboardProvider.tsx:91`, e quem dispara é `Sidebar.tsx:172,186` e `MobileShell.tsx:50`. A parte útil (listener `keydown` ⌘K duplicado) a main já removeu em `81a8cd979` |
| `TalkXView.tsx` | só `p-4` (fallback, main l.60) e `p-6` (carregamento roteado, main l.487) | **Regressão.** `f4e5a10c6` "fix: evita padding duplicado nos carregamentos do Talk X (#2712)" é ancestral da merge-base (`git merge-base --is-ancestor f4e5a10c6 b5ad544ec` = sim) e removeu exatamente esses paddings porque somavam ao gutter do `ViewContainer`; há guarda `scripts/ui-audit/view-container-padding.unit.mjs` |

Na direção oposta, a main está **muito à frente** no `TalkXView.tsx`: tela de relatório (`TalkXCampaignReport`, `topView 'report'`, `openReport`, `reportCampaignId`), guarda `keepLocalDraft`/`localDraftRouteId` e normalização de `?screen=report`. Rebasear a branch não acrescenta nada e destruiria esse trabalho.

### Prova de incorporação
- `81a8cd979` (#2793, 2026-11-08) — "Substitui o draft PR #2788": os 5 arquivos da branch na íntegra + `talkx/kit/primitives.tsx` (prop `onItemClick` do `ModuleBreadcrumb`, que a branch usava sem existir → TS2322/TS7006) + `docs/talkx/ESTADOS.md`.
- `e903a7e51` (#2869, 2026-11-13) — refinou as queryKeys.
- `git merge-base --is-ancestor 2bbbe224e origin/main` = **NOT_ANCESTOR**: o trabalho entrou por re-push, não por merge da branch — a não-ancestralidade não é sinal de perda aqui.
- X054 verificado na main: `TalkXView.tsx:10` `useGlobalKeyboard`, `:330` `openCommandPalette`, `:535` `ModuleBreadcrumb … onItemClick (i===1 → backToList)`, `:574-578` botão `aria-label="Buscar (⌘K)"`; `ArrowLeft`/"Voltar à campanhas" ausentes.

**Lacunas adicionais: nenhuma.** Nenhum item para resgatar; portar qualquer resíduo seria reverter fix já em produção.
