# Dossiê — claude__fix-ci-tests-261019-1200 (PR #2098)

**Ref:** `origin/claude/fix-ci-tests-261019-1200` · tip `16a4c54f0` · merge-base `ee2947491` (2026-10-18) · 2 commits (2026-10-19)
**PR #2098** "fix: corrigir falhas de CI — testes, a11y, bundle e motion (261019)" — CLOSED sem merge em 2026-10-31 (corpo: "superseded, tudo já na main").
**Main avaliada:** `dac285f62` (HEAD local == origin/main), CI Gate SUCCESS, Unit Tests 1/3–3/3 SUCCESS (statusCheckRollup via GraphQL).

## Propósito
Destravar a CI de 19/10: mocks de teste incompletos (useQueueGoals, logger, react-query), baseline a11y de icon-buttons, reduced-motion em ConnectionsView/ScheduleCalendarView, `aria-live` em useScreenProtection. O 2º commit ("push arquivos restantes") subiu cópias **desatualizadas** de `CRMAutoSync.tsx` e `useTeamChatPanel.ts` (apagam a refatoração e os comentários que a main já tinha no merge-base).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `src/__tests__/a11y/icon-buttons-baseline.json` | INCORPORADA — as 5 entradas removidas (ExternalProductManagement, WarRoomAlertRow, Leaderboard, QueuesComparisonDashboard ×2) não existem na main | `git show origin/main:<arq> \| grep -c` = 0; line_check removed_still_in_main=0 |
| `src/components/connections/ConnectionsView.tsx` | INCORPORADA — gating por `useReducedMotion` | main L4, L34, L145 |
| `src/components/schedule/ScheduleCalendarView.tsx` | INCORPORADA — `MotionConfig reducedMotion="user"` | main L2, L156, L340 |
| `TeamFileUploader.tsx`, `ClientWalletView.tsx`, `useScreenProtection.ts` | INCORPORADA (byte-idêntico) | hunk PRESENT_BYTE |
| `src/components/inbox/CRMAutoSync.tsx` | OBSOLETA — a branch substitui a versão refatorada (auto-sync removido, `useSyncToCRM`, estados "CRM não configurado"/"contato não encontrado") por uma versão antiga que chama `supabase.functions.invoke('crm-sync')` direto: **regressão**. A única linha útil (`aria-label={tooltipText}`) já está na main | main L1-17 (doc do gatilho `trg_enqueue_crm_sync_from_closure`), L21 `useSyncToCRM`, L165 `aria-label={tooltipText}` (entrou por `4b9585052` #2156, 2026-10-21) |
| `src/components/team-chat/useTeamChatPanel.ts` | OBSOLETA — remove 72 linhas de comentários (TC-006/TC-007/TC-010/SL-072/SL-082) que a main mantém (regressão); troca `sonner`→`@/lib/lazyToast`. A fachada `lazyToast` existe na main (`src/lib/lazyToast.ts`) mas é destinada aos módulos do boot (telefonia); o painel do Team Chat não está no caminho do first paint e a main mantém `sonner` (L13) como em 304 outros arquivos | `git show origin/main:src/components/team-chat/useTeamChatPanel.ts` L13; `git show origin/main:src/lib/lazyToast.ts` L1-15 |
| `src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx` | OBSOLETA — a branch esvaziava os asserts do `InboxEmptyChat` ("renderiza sem erro") e adicionava mocks de `useQueueGoalMetrics`/`useCustomShortcuts`/`ConversationEmptyState`. A main manteve os asserts reais; `ConversationEmptyState` ainda expõe `.text-center` (L41) e `.w-28` (L50) e o teste passa na CI da main (Unit Tests SUCCESS em `dac285f62`) | main test L135-163; `src/components/shared/ConversationEmptyState.tsx` L41, L50 |
| `src/hooks/__tests__/useRateLimitLogs.test.tsx` | OBSOLETA — mesma necessidade (mockar a cadeia `select→order→range→abortSignal`) resolvida de outra forma na main (`buildChain`, commit `e1f2ee4dd` 2026-10-27); contagens `toHaveBeenCalledTimes(2/4/2)` já iguais na main (L115, L117, L127) | `git show origin/main:<arq>` L28-42 |
| `src/hooks/__tests__/useTeamChatNotifications.global.test.tsx` | OBSOLETA — mock de `createLogger` já na main (L98, via `61a973da6` #2182); wrapper `QueryClientProvider` desnecessário: `useTeamChatNotifications.ts` não importa react-query (imports L1-9) e o teste passa na main | main test L96-98, L138-168 |

## Veredito: **OBSOLETA** (confiança alta)
Tudo que era útil está na main (a11y baseline, reduced-motion, aria-label, aria-live); o restante é regressão (arquivos desatualizados) ou correção de teste superada por outra já verde na CI da main.

## Lacunas a recuperar
Nenhuma. Não portar `CRMAutoSync.tsx` nem `useTeamChatPanel.ts` desta branch — são versões anteriores ao merge-base.

**apagar_branch_seguro: true**

## Verificação adversarial

Refutação tentada contra `OBSOLETA`; **não refutada**. Main de referência: `origin/main` = `dac285f62`
(HEAD local do worktree é `346c62601`, que difere de `origin/main` só em 3 arquivos de copiloto não
relacionados — `git diff --stat origin/main HEAD`: `ChatInputArea.tsx`, `RadarPanel.tsx`,
`useCopilotSession.ts` — então rodar teste local vale como prova sobre a main; corrijo o dossiê, que
afirmava "HEAD local == origin/main").

Checagem hunk por hunk do `git diff ee294749 origin/claude/fix-ci-tests-261019-1200` (11 arquivos):

1. **a11y baseline** — as 5 entradas que a branch apagava não existem na main: `git show
   origin/main:src/__tests__/a11y/icon-buttons-baseline.json | grep -n
   "ExternalProductManagement\|WarRoomAlertRow\|leaderboard/Leaderboard\|QueuesComparisonDashboard"` → exit 1,
   zero ocorrências. A main regerou o arquivo minificado com 12 findings (a branch tem 16). INCORPORADA.
2. **reduced-motion / a11y** — `ConnectionsView.tsx` main L4/L34/L145, `ClientWalletView.tsx` main
   L2/L20/L25-26, `ScheduleCalendarView.tsx` main L2/L156/L340 (`MotionConfig reducedMotion="user"`),
   `useScreenProtection.ts` main L119-120 (`role='alert'` + `aria-live='assertive'`),
   `TeamFileUploader.tsx` main L10 (`@/lib/lazyToast`). Todos presentes. INCORPORADA.
3. **CRMAutoSync.tsx** — branch = 87 linhas, main = 181, merge-base = 180: a branch é a versão
   **anterior ao próprio merge-base** (chama `supabase.functions.invoke('crm-sync')` direto; a main
   usa `useSyncToCRM` L50 e documenta o gatilho `trg_enqueue_crm_sync_from_closure` L1-17). Os dois
   únicos ganchos úteis da versão da branch — `aria-label={tooltipText}` e `data-testid="crm-sync-button"` —
   estão na main em L165-166 (e L74, L139), com três testes dedicados
   (`CRMAutoSync.aria.test.tsx:53`, `CRMSyncButton.crm-desligado.test.tsx:50`,
   `CRMSyncButton.dica-focavel.test.tsx:28,79`). Nada a resgatar; portar seria regressão.
4. **useTeamChatPanel.ts** — filtrando comentários do diff, a única mudança de código é
   `-import { toast } from 'sonner'` / `+import { toast } from '@/lib/lazyToast'`. As outras 72 linhas
   removidas são comentários (TC-006/TC-007/TC-010/SL-072/SL-082) que a main mantém. Não há guard/lint
   exigindo `lazyToast` (`git grep -ln lazyToast origin/main -- scripts eslint.config.js` → vazio) e a main
   usa `sonner` em 304 arquivos contra 11 em `lazyToast`. Valor < médio: preferência de bundle sem regra
   vigente, não lacuna.
5. **Os 3 testes** — rodados na árvore local (idênticos a `origin/main`, `git diff --stat origin/main HEAD`
   sobre os 3 arquivos + `useRateLimitLogs.ts` + `ConversationEmptyState.tsx` = vazio):
   `npx vitest run src/components/__tests__/reduzirMovimentoInboxCrmConexoes.test.tsx
   src/hooks/__tests__/useRateLimitLogs.test.tsx
   src/hooks/__tests__/useTeamChatNotifications.global.test.tsx` → **3 arquivos / 28 testes passando**
   (4,5 s). A necessidade da branch (CI verde) já está atendida por outro caminho. Contagem de `it()`
   idêntica (4/12/4 na main e na branch) e os nomes só divergem nos dois casos que a branch
   **enfraquecia** (`'as animações nascem no estado final (nenhum laço)'` → `'renderiza sem erro'`).
   Nenhum caso de teste se perde.
6. **Branch segura de apagar** — PR #2098 `state=closed`, `merged=false`, `merged_at=null`,
   `mergeable_state=dirty` (API GitHub, 2026-10-31); nenhuma PR aberta aponta para o tip `16a4c54f0`.

Conclusão: `concorda=true`, veredito mantido **OBSOLETA**, `apagar_branch_seguro=true`. Zero hunks de
valor ≥ médio fora da main.
