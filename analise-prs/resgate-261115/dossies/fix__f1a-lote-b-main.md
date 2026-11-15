# Dossiê — fix__f1a-lote-b-main (branch `origin/fix/f1a-lote-b-main`, PR #2058)

- tip `10d843f9` · merge_base `9d65fed6` · 2 commits (2026-10-18) · 9 arquivos, todos testes (`src/**/__tests__/**`)
- Triagem 2026-11-08 dizia OBSOLETA; **verificado agora: INCORPORADA** (a intenção está na main, com prova por arquivo).

## Propósito
`10d843f92 fix(test): mock de @/lib/logger sem createLogger — 9 arquivos (lote F1a)`: adicionar `createLogger` aos mocks de `@/lib/logger` em 9 testes, porque `src/lib/invokeEdge.ts` faz `const log = createLogger('edge-invoke')` (origin/main `src/lib/invokeEdge.ts:34-36`) e os mocks só exportavam `getLogger`/`log` → testes quebravam.
`caf781e8c chore(fmt): prettier nos arquivos` : só reformatação (quebra de linha em objetos/argumentos, `import("react")` → `import('react')`), sem efeito semântico.

## Arquivo × achado × evidência (origin/main)
| arquivo | o que a branch adicionava | estado na main | evidência |
|---|---|---|---|
| src/components/calls/__tests__/IncomingCallAlert.ringtone.test.tsx | `createLogger` no mock | PRESENTE (versão mais rica, com `withCorrelation`) | main:141 `createLogger: vi.fn(() => ({ ..., withCorrelation: ... }))` — commit 61a973da6 (#2182) |
| src/components/calls/__tests__/IncomingCallAlert.volume.test.tsx | idem | PRESENTE | main:157 — 61a973da6 (#2182) |
| src/components/notifications/__tests__/NotificationsPopover.test.tsx | idem | PRESENTE | main:57 — 61a973da6 (#2182) |
| src/hooks/__tests__/helpers/alertBehaviorTestKit.ts | `createLogger: () => loggerSpies` em `loggerMock()` | PRESENTE (ordem das chaves diferente) | main:141 `return { createLogger: () => loggerSpies, getLogger: ..., log: ... }` — 4b9585052 (#2156) |
| src/hooks/__tests__/useNotifications.contagem-reconciliada.test.tsx | idem | PRESENTE | main:61 — 4b9585052 (#2156) |
| src/hooks/__tests__/useNotifications.test.tsx | idem (+ comentário) | PRESENTE | main:32 — 4b9585052 (#2156) |
| src/hooks/__tests__/useSentimentAlerts.test.ts | idem (+ comentário) | PRESENTE | main:49 — 61a973da6 (#2182) |
| src/hooks/communication/__tests__/mediaVolume.players.test.tsx | idem | PRESENTE | main:50 — 61a973da6 (#2182) |
| src/pages/__tests__/ChatPopup.rolagem-mensagem-nova.test.tsx | idem | PRESENTE | main:114 — 61a973da6 (#2182) |

As "lacunas" mecânicas (234 linhas) são: (a) o texto do `createLogger` da branch é diferente do da main (main usa `vi.fn(() => ({... withCorrelation ...}))`, branch usava `() => ({...})`) — mesma intenção, versão da main é superconjunto; (b) reformatação prettier (`git diff -w origin/main origin/fix/f1a-lote-b-main` reduz o diff a essas duas coisas); (c) nos 3 arquivos com `framer-motion`, a main já mudou o mock para `importOriginal` + `useReducedMotion` (commit a5760922c, Vitest 4) — a versão da branch seria REGRESSÃO se portada.

## Veredito
**INCORPORADA** — confiança alta. Nada a recuperar. `apagar_branch_seguro = true`.
Nenhuma migration/edge/workflow envolvida; sem consulta ao banco.

## Verificação adversarial (2026-11-15)

Parecer: **CONCORDO com INCORPORADA**. Tentei refutar e não achei um único hunk de valor fora da main.

Como tentei refutar (todas as checagens feitas por mim, não copiadas da triagem):
1. **Isolei o que a branch realmente mudava de semântico.** `git show 10d843f92 --stat` = 9 arquivos, **11 inserções / 1 deleção**, e todas as 11 linhas são literalmente `createLogger: () => ({...})` adicionado ao `vi.mock('@/lib/logger', ...)` (+ 2 linhas de comentário em `useNotifications.test.tsx:38` e `useSentimentAlerts.test.ts:53`). A deleção única é `alertBehaviorTestKit.ts:141` (`loggerMock()` reescrito para incluir `createLogger`). O segundo commit `caf781e8c` é `prettier` — é ele que infla as "234 linhas de lacuna" do JSON (re-quebra de linha de objetos), não trabalho novo.
2. **Conferi os 9 arquivos na main, um por um** (`git show origin/main:<arquivo> | grep -n createLogger`): todos têm `createLogger` no mock. Linhas: ringtone:141, volume:157, NotificationsPopover:57, alertBehaviorTestKit:141, contagem-reconciliada:61, useNotifications.test:32, useSentimentAlerts:49, mediaVolume.players:50, ChatPopup.rolagem:114. Em 6 deles a main usa `createLogger: vi.fn(() => ({ debug, info, warn, error, withCorrelation: vi.fn(...) }))` — **superconjunto** do que a branch propunha.
3. **Diff token-a-token (ignorando todo espaço/quebra de linha)** dos 9 arquivos, main × branch, via `difflib` sobre o stream de tokens (script em `/tmp/claude-0/-home-user-Zapp-Web-V2/19ff5006-3a0f-568b-84a1-eb12d2182604/scratchpad/tokdiff.py`). Resultado: as ÚNICAS diferenças reais são (a) a variante textual do `createLogger` (main mais rica, com `withCorrelation`); (b) ordem de chaves em `alertBehaviorTestKit.ts` e `contagem-reconciliada`; (c) aspas `import("react")` vs `import('react')`; (d) os 2 comentários em português; (e) o mock de `framer-motion`, onde a **main** tem `async importOriginal` + `useReducedMotion` e a branch tem a versão antiga; (f) `LOCAL_VOICE_ID: 'local'` existe só na main (`ChatPopup.rolagem`). Ou seja: tudo que a branch tem a main tem igual ou melhor, e em (e)/(f) a branch seria **regressão** se portada.
4. **Procedência na main:** `git log -S'createLogger' --oneline origin/main -- <arquivos>` → `61a973da6` (#2182) e `4b9585052` (#2156). Não é remoção/revert acidental; é substituição deliberada por versão melhor.
5. **PR #2058**: `state=closed`, `merged=false`, `mergeable_state=dirty`, fechada em 2026-11-01. Fechada sem merge, mas o conteúdo chegou por #2156/#2182 — por isso INCORPORADA e não OBSOLETA (a triagem anterior, que dizia OBSOLETA, estava imprecisa no rótulo, não no efeito prático).

Ressalva sem efeito sobre o veredito: o corpo da PR #2058 lista 2 arquivos **deixados de fora** da branch (`src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` e `src/pages/__tests__/ChatPopup.messageBalloon.test.tsx` / `ChatPopup.pagination.test.tsx`, por causa de `AuthProvider` e do virtualizador do `MessageBubble` em jsdom). Não são lacuna **desta branch** (ela nunca os tocou), mas seguem sendo trabalho em aberto se esses testes ainda estiverem vermelhos na main.

`apagar_branch_seguro = true` confirmado: zero conteúdo exclusivo de valor; o `tip 10d843f92` não é ancestral de `main`, mas tudo que ele carregava já está lá por outra via.
