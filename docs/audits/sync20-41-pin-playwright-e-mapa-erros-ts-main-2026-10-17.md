# SYNC20-41 — pin do Playwright (e2e-logado) e mapa dos 98 erros de TS da main (2026-10-17)

Base: branch do dia `dia/2026-10-17`, HEAD `d723a90107`.
Nada aqui toca produção: tudo local, sem push, sem deploy.

## 1. Pin do Playwright: lock, fonte única e contrato

### O que foi medido antes

| Onde | Estado medido |
|---|---|
| `bun.lock` (base do dia) | `playwright@1.63.0`, `playwright-core@1.63.0`, `@playwright/test@1.63.0` |
| `package.json` (base do dia) | `@playwright/test: ^1.56.1` |
| `.github/toolchain.json` | `"playwright": "1.63.0"` (fonte única da casa — E75) |
| 6 pontos de pin, 3 workflows | `bunx playwright@1.63.0` |
| `main` (= `a9b4d6c`, destino da fusão) | `package.json` `^1.64.0`, `bun.lock` resolve **1.64.1**, mas os 6 pins seguiam `1.63.0` → **divergência** |

Na base do dia o pin já casava com o lock (1.63.0). A divergência 1.63.0 × 1.64.1 está na
`main`; é ela que a fusão do dia leva de volta e que a guarda N-022 reprova (2 pins divergentes,
medido no diagnóstico SYNC20-02).

### O que mudou (alvo = 1.64.1, a versão da `main`)

| Arquivo | Mudança |
|---|---|
| `package.json` | `@playwright/test`: `^1.56.1` → `^1.64.1` |
| `bun.lock` | 3 entradas para `1.64.1` (`playwright`, `playwright-core`, `@playwright/test`) |
| `.github/toolchain.json` | `playwright`: `1.63.0` → `1.64.1` |
| `.github/workflows/ci.yml` | linhas 440 e 446 → `playwright@1.64.1` |
| `.github/workflows/e2e-logado.yml` | linhas 127 e 131 → `playwright@1.64.1` |
| `.github/workflows/e2e-talkx.yml` | linhas 91 e 95 → `playwright@1.64.1` |
| `scripts/ci/ci-docs-baseline.unit.mjs` | asserções do lock e da linha E76 → `1.64.1` |
| `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md` | linha 108 (E76) → `1.64.1` |

Cada mudança é a mesma decisão (a versão do Playwright) em um lugar declarado; nenhuma
guarda foi desligada nem enfraquecida.

### O que prende a igualdade (os três conferentes)

1. `scripts/ci/playwright-version-lock.unit.mjs` (N-022) — compara cada pin `playwright@x` dos
   workflows com a versão resolvida em `bun.lock`.
2. `scripts/ci/check-workflow-pins.mjs` (roda no `ci.yml`) — compara os literais com a fonte
   única `.github/toolchain.json` (e confere SHA de Actions, owners autorizados, digest de imagem).
3. `scripts/ci/ci-docs-baseline.unit.mjs` — prende o `bun.lock`, os 3 workflows e a linha E76 do
   plano de auditoria à mesma versão.

### Provas (rodadas nesta árvore)

| Comando | Resultado |
|---|---|
| `node --test scripts/ci/playwright-version-lock.unit.mjs scripts/ci/check-workflow-pins.unit.mjs scripts/ci/ci-docs-baseline.unit.mjs` | **42 passed / 0 failed** |
| `node scripts/ci/check-workflow-pins.mjs` | `OK: 16 workflows ... e as versões de toolchain de .github/toolchain.json.` (exit 0) |
| Vermelho por mutação: `e2e-logado.yml:127` de volta a `@1.63.0`, depois `node --test scripts/ci/playwright-version-lock.unit.mjs` | `✖ N-022` — `versão do Playwright fora do bun.lock: e2e-logado.yml:127 → playwright@1.63.0 (bun.lock: 1.64.1)` — 3 passed / 1 failed; mutação revertida |
| `bun run typecheck` na base do dia | exit 0, saída vazia (árvore do dia sem erro de TS) |

## 2. Mapa dos 98 erros de TS da `main` (`a9b4d6c`) — sem corrigir nada

Método: `git archive a9b4d6c | tar -x -C .tmp/main`, `node_modules` do dia ligado por symlink,
`node ../../node_modules/typescript/bin/tsc -b --force` dentro da árvore da `main`.
Resultado: **98 erros** (`error TS`), exit 2. O baseline de typecheck da casa está vazio e o dia
é limpo, logo estes 98 são dívida exclusiva da `main` — nenhum deles é regressão da base do dia.

### Por lote (agrupados pelo remédio, não só pelo código)

| Lote | Código(s) | Nº | Sintoma típico |
|---|---|---|---|
| L1 — nomes de RPC fora do `Database` types (types.ts stale) | TS2345 | 14 | `Argument of type '"admin_list_cron_jobs"' is not assignable to parameter of type ...` |
| L2 — payload/objeto com propriedade a mais | TS2353 | 10 | `'sender_participant_jid' does not exist in type 'NormalizedRealtimeMessage'` |
| L3 — assinatura de callback/prop divergente | TS2322 | 28 | `Type '(finalScore: number, xpEarned: number) => Promise<void>' is not assignable to type '(score: number) => void'` |
| L4 — propriedade ausente no tipo do dado | TS2339 | 36 | `Property 'map' does not exist on type 'string \| number \| ...'` |
| L5 — export/módulo inexistente | TS2305, TS2307, TS2724 | 4 | `has no exported member 'WARROOM_MAX_ROWS'` / `Cannot find module '@/hooks/gamification/mutations'` |
| L6 — casos isolados | TS2304, TS17001, TS2739, TS2554, TS2352, TS2769 | 6 | `Cannot find name 'handleDisconnectDialogOpenChange'` / `JSX elements cannot have multiple attributes with the same name` |

Total: 14 + 10 + 28 + 36 + 4 + 6 = **98**.

### Por arquivo (todos os que têm erro)

| Arquivo | Erros |
|---|---|
| `src/components/team-chat/__tests__/useTeamChatPanel.search-antigas.test.tsx` | 11 |
| `src/hooks/team-chat/useTeamReadState.ts` | 9 |
| `src/components/gamification/TrainingMiniGames.tsx` | 5 |
| `src/components/inbox/__tests__/InboxEmptyChat.cta.test.tsx` | 5 |
| `src/components/inbox/__tests__/VirtualizedRealtimeList.reabrir.test.tsx` | 5 |
| `src/hooks/dashboard/useDashboardStats.ts` | 4 |
| `src/components/admin/useTarefasAgendadas.ts` | 3 |
| `src/components/dashboard/SentimentAlertsDashboard.tsx` | 3 |
| `src/hooks/analytics/__tests__/useGoalsDashboard.test.tsx` | 3 |
| `src/hooks/groups/actions.ts` | 3 |
| `src/hooks/integrations/__tests__/useKnowledgeBase.erro.test.tsx` | 3 |
| `src/hooks/ui/useOnboarding.ts` | 3 |
| `src/adapters/evolutionAdapter.ts` | 2 |
| `src/components/inbox/ConversationListSidebar.tsx` | 2 |
| `src/components/inbox/__tests__/VoiceChangerPicker.voz-temporaria.test.tsx` | 2 |
| `src/components/inbox/chat/ChatMessagesArea.tsx` | 2 |
| `src/hooks/business/useWarRoomData.ts` | 2 |
| `src/hooks/inbox/__tests__/useInboxFilters.type-url.test.tsx` | 2 |
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` | 2 |
| `src/hooks/integrations/useGmail.ts` | 2 |
| `src/components/connections/ConnectionCard.tsx` | 1 |
| `src/components/connections/ConnectionsView.tsx` | 1 |
| `src/components/gamification/__tests__/TrainingMiniGames.creditoXp.test.tsx` | 1 |
| `src/components/inbox/ChatPanel.tsx` | 1 |
| `src/components/inbox/RealtimeCollaboration.tsx` | 1 |
| `src/components/inbox/RealtimeInboxView.tsx` | 1 |
| `src/components/inbox/__tests__/StatusChips.contrasteChipAtendendo.test.tsx` | 1 |
| `src/components/inbox/__tests__/VoiceChangerPicker.aria.test.tsx` | 1 |
| `src/components/inbox/__tests__/useChatMediaSending.audio-meme-falha.test.ts` | 1 |
| `src/components/inbox/chat/__tests__/MessageBubble.interactive-list-item.test.tsx` | 1 |
| `src/components/inbox/contact-details/ConversationMemorySection.tsx` | 1 |
| `src/components/queues/QueueAlertsDisplay.tsx` | 1 |
| `src/components/settings/SettingsView.tsx` | 1 |
| `src/components/talkx/TalkXTemplates.tsx` | 1 |
| `src/components/talkx/TalkXView.tsx` | 1 |
| `src/components/talkx/__tests__/TalkXTemplateEditor.states.test.tsx` | 1 |
| `src/hooks/business/__tests__/useWarRoomData.test.tsx` | 1 |
| `src/hooks/business/useCSAT.ts` | 1 |
| `src/hooks/chat/useConversationActions.ts` | 1 |
| `src/hooks/gamification/__tests__/mutations.test.tsx` | 1 |
| `src/hooks/inbox/__tests__/useRealtimeInbox.sendAudio.test.tsx` | 1 |
| `src/hooks/inbox/useInboxBulkActions.ts` | 1 |
| `src/hooks/inbox/useInboxUnreadTotal.ts` | 1 |
| `src/hooks/system/__tests__/configuracoes.leituraErro.test.tsx` | 1 |
| `src/hooks/system/useAppBootstrap.ts` | 1 |

45 arquivos. **43 dos 98 erros** estão em arquivos de teste (`__tests__`/`.test.`) e **55** em
código de produto.

### Leitura para o próximo cartão

- L1 + boa parte de L4 têm uma mesma raiz provável: o `types.ts` da `main` está atrasado em
  relação ao banco (RPCs novos e formato do retorno). É o plano do SYNC20-04; regenerar o
  `types.ts` deve derrubar os dois lotes de uma vez.
- L2 (10) e L5 (4) são contratos de tipo/teste que só existem na `main`; nenhum deles aparece
  na base do dia.
- L3 (28) e L6 (6) são independentes do `types.ts` (assinaturas de callback e casos isolados).

Este documento é só mapa: nada foi corrigido, nenhum baseline foi alterado e nenhum erro foi
escondido (o baseline segue `issues: []`).
