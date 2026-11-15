# claude/fix-unit-tests-src-261024-1630 (PR #2221) — OBSOLETA

- ref: `origin/claude/fix-unit-tests-src-261024-1630` · tip `d31f39ae0` · merge_base `2d97c44cf` (2026-10-24)
- main avaliada: `dac285f62` (2026-11-15)
- 19 commits, 45 arquivos, 33 com lacuna mecânica (461 linhas)

## Propósito
Destravar os **Unit Tests de `src/`** que já estavam vermelhos na `main` em 24/10 (o merge_base é
justamente `2d97c44cf fix(ci): ci-gate bloqueia merge quando unit tests falham`). Dois tipos de mudança:
(a) mocks/ajustes nos testes para pararem de falhar; (b) correções no código de produção que os testes
cobravam (useAuth, chat.service, useWarRoomAlerts, useTeamChatNotifications, useTalkXSegments, AdminView,
MediaMigrationTool, useDashboardKpi, useDiagnosticsData, useUserSettings, useInboxFilters, useKnowledgeBase,
useAgentCelebrations, TalkXTemplateEditor, TalkXOverview).

**A main resolveu o mesmo problema por outro caminho**, 3 dias depois, em
`e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)` (2026-10-27), e depois
refatorou os mesmos arquivos (#2816 MediaMigrationTool, pacote 5 `ab657aa34` useInboxBulkActions).

## Prova executada (não só leitura)
Os 19 arquivos de teste tocados pela branch **passam na árvore atual da main** (HEAD `346c62601`, que contém
`origin/main` inteira):

```
Test Files  11 passed (11)   Tests  61 passed (61)     # AdminView x6, AgentsView x3, SummaryResult, ChatMessagesArea
Test Files   8 passed  (8)   Tests  97 passed | 1 expected fail  # team-chat x2, command-palette, canal-estavel,
                                                                # useContainerColumns, useInboxBulkActions,
                                                                # filesPeriod.adversarial, security-push-listener
```
Ou seja: nenhuma das adições de mock da branch é necessária hoje.

## Arquivo × achado × evidência

### Código de produção — já na main (igual ou melhor)
| Arquivo | Lacuna da branch | Onde está na main |
|---|---|---|
| `src/hooks/auth/useAuth.tsx` | `offlineSendQueue.clear()` no logout (SEC-FRONTEND-04) | `useAuth.tsx:12`, `:173` e `:248` (main cobre os dois caminhos de sign-out; a branch cobria um) |
| `src/services/chat.service.ts` | mime/extensão reais no `uploadAudio` | `chat.service.ts` `uploadAudio`: `mimeType = blob.type.split(';')[0].trim()`, `extByMime` com webm/ogg/m4a + **mp3** (superset) |
| `src/hooks/gamification/useAgentCelebrations.ts` | `marcoMontagem` + celebra conquista posterior | `:174` `const marcoMontagem = Date.now()`, `:190` compara com `TOLERANCIA_RELOGIO_MS` (superset), dep `celebrarConquista` em `:205` |
| `src/hooks/business/useWarRoomAlerts.ts` | sai do `usePushNotifications`, usa `Notification` + `settings.browserNotifications` | `:151` `if (settings.browserNotifications)` → `showBrowserNotification(...)`; deps `:164` idênticas |
| `src/hooks/chat/useTeamChatNotifications.ts` | HZ5-09: refs p/ preferências, canal estável, `Notification` direta | `:140-152` (`activeIdRef`/`notifSettingsRef`/`isQuietHoursRef`), `:161` `uniqueRealtimeTopic('team-chat-notifications')` (resolve melhor que `:${profile.id}`), `:207-222`, `:254` `}, [profile]` |
| `src/hooks/integrations/useTalkXSegments.ts` | `lead_origin` comingSoon; bloqueio de `real_sector`/`real_uf` | `:90` comingSoon; `:80-81` `ponteOnly: true`; `:209` `if (def.ponteOnly) return null`; `:281` `assertNoPonteOnlyFields()` chamada nas RPCs (mesma falha fechada, generalizada por flag). O `quoted` da branch (`/[\\"]|"/`) era redundante — main mantém `/[\\"]/` em `:199` |
| `src/hooks/inbox/useInboxFilters.ts` | `useSearchParams` + `normalizeContactType` | `:2`, `:65`, `:97`, `:151-160` (`setSearchParams(..., {replace:true})`), `:168` |
| `src/hooks/integrations/useKnowledgeBase.ts` | estado `error` agregando as duas queries | `:61`, `:65`, `:73` (+ `:75` try/catch, superset) |
| `src/hooks/dashboard/useDashboardKpi.ts` | `p_from`/`p_until` na RPC | `:122-125` assinatura nova **com fallback** para `p_since` se a migration não estiver aplicada (superset) |
| `src/hooks/system/useDiagnosticsData.ts` | `connectionsCountError` entra no health do banco | `:317` `classifyHealth(connectionsCountError ?? dbError, ...)` |
| `src/hooks/system/useUserSettings.ts` | estado `isError` | `:88`, `:258`, `:307`, `:326` |
| `src/components/admin/AdminView.tsx` | aba `cron` + refetch ao ativar aba | `:27` import `CronJobsTab`, `:47` `AdminTab` com `'cron'`, `:195` item da aba, `:502` render; `:104` `if (activeTab === 'users' \|\| activeTab === 'audit') void fetchData()` (superset) |
| `src/components/admin/MediaMigrationTool.tsx` | reescrita: contagem prévia, AlertDialog, histórico de audit_logs | main foi além em `cf79d70dd feat(admin): extrai lógica de banco do MediaMigrationTool para serviço (#2816)`: `countPendingMedia`/`fetchMigrationHistory` em `src/services/mediaMigration.service.ts`, `AlertDialog` em `:311-325`, histórico em `:281-309` |
| `src/components/talkx/TalkXTemplateEditor.tsx` | prop `onActiveTemplateChange` | `:72`, `:80`, `:141` |
| `src/components/talkx/TalkXOverview.tsx` | `aria-label={\`Ações de ${c.name}\`}` | tabela virou o kit: `src/components/talkx/kit/table.tsx:211` `label={rowLabel ? \`Ações de ${rowLabel(row)}\` : 'Ações'}`, coberto por `__tests__/TalkXOverview.lifecycle.test.tsx:115` |
| `src/hooks/integrations/useTalkXSuppression.ts` | — | `PRESENT_REVERSE_APPLIES` (prova mecânica: já na main) |
| `scripts/db-audit/team-receipts-reactions-conversation-id.test.sh` | — | `PRESENT_REVERSE_APPLIES` |
| `src/hooks/team-chat/__tests__/useTeamMessages.canal-e-reconexao.test.tsx` | — | `PRESENT_REVERSE_APPLIES` |

### Obsoletas — o alvo mudou de propósito na main
| Arquivo | Lacuna | Por que não vale portar |
|---|---|---|
| `src/hooks/inbox/useInboxBulkActions.ts` | trocava o `update ... .in('id', ids)` agrupado por um laço `.eq('id', id)` por contato | main **reescreveu** o `undoAction` inteiro: UPDATE direto em `conversation_status` é recusado no banco; agora vai pela RPC `moveConversationsStatus` com grupos direct/two-step e restore FSM-aware (`ab657aa34`, 2026-11-14, `useInboxBulkActions.ts:242-305`). Portar o laço seria regressão. |
| `src/components/team-chat/__tests__/useTeamChatPanel.search-antigas.test.tsx` | branch **removia 100 linhas** de teste real e deixava 8 `it.todo` ("SL-016: feature não implementada") | a main implementou a busca e mantém os 8 testes de verdade, verdes. Portar **apagaria cobertura**. |
| `src/lib/__tests__/filesPeriod.adversarial.test.ts` | `it.skipIf(offset !== 180)` para pular fora de UTC-3 | main atacou a raiz: `vitest.config.ts:8` e `src/test/global-setup-tz.ts:7` fixam `TZ=America/Sao_Paulo`, então a asserção continua viva em vez de ser pulada |
| `src/components/ui/__tests__/command-palette.busca-antiga.test.tsx` | trocava `getByRole('option')` por `('button')` e `act` por `waitFor` | a versão da main (`option`/`act`) passa; a troca refletia um DOM de 24/10 |
| `src/components/admin/__tests__/AdminView.a11y.test.tsx` | título "3 abas" | a main tem 4 abas (users/audit/crm/cron) e o teste da main está alinhado e verde |
| `AdminView.{avatarRevogaUrl,limiteChats,ramalAdmin,tarefas-agendadas,estados-tabelas}.test.tsx` | mocks extras (`auditTotal`, `error`, `MIN_PASSWORD_LENGTH`, `AUDIT_PAGE_SIZE`) e cliques por `getByRole('tab')` | os 6 arquivos passam na main sem esses mocks (saída acima) |
| `AgentsView.{capacidade,conexoes,pendencias}.test.tsx` | mocks de `channel/removeChannel/useUserRole` | passam na main sem eles |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` | mock de `getBoundingClientRect` | passa na main sem ele |
| `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` | mock de `useAuth` | passa na main sem ele |
| `src/hooks/chat/__tests__/useTeamChatNotifications.canal-estavel.test.tsx` | `notifSpy` + `vi.stubGlobal('Notification')` | main usa o spy de `showBrowserNotification` (`h.show`), coerente com o hook atual; verde |
| `src/hooks/contacts/__tests__/useContainerColumns.test.ts` | `vi.spyOn(..., 'getBoundingClientRect')` | main usa stub próprio; verde |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | esperava `update` por id | acompanha o `undoAction` velho; main testa a RPC |
| `src/providers/__tests__/security-push-listener-mount.test.tsx` | mock de `useAuth` | passa na main sem ele |
| `ESTADO.md` | âncoras `useKnowledgeBase.ts:130/:201`, `useInboxBulkActions.ts:237`, `MediaMigrationTool.tsx:125` | arquivo é **gerado**; a main tem as âncoras do código atual (`:137/:208`, `:323`, `:97` em `ESTADO.md:43,58,98`). As da branch estão defasadas. |

### Idênticas à main (nada a fazer)
`AdminView.section-error-boundary.test.tsx`, `a11y-ferramentas-ia.test.tsx`, `alvos-toque-44px.test.tsx`,
`useRateLimitLogs.test.tsx`, `useTalkXSuppression.test.ts`, `workItemFormat.test.ts` — `PRESENT_BYTE`.

## Veredito
**OBSOLETA.** Todo o código de produção da branch está na main em forma igual ou superior (citações acima) e
o objetivo da branch — Unit Tests de `src/` verdes — já é fato na main por outro caminho. As lacunas que
sobram (mocks, `it.todo`, `skipIf`, laço por id, âncoras de ESTADO.md) seriam **regressão** se portadas:
duas delas removem cobertura e uma reverte a migração para RPC do arquivamento em lote.

Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Resultado: **não refutado — concordo.** main avaliada `dac285f62`
(árvore de trabalho `346c62601`, que a contém; os arquivos de teste em questão são idênticos a `origin/main`,
`git diff --stat origin/main HEAD` só toca `ChatInputArea.tsx`/`RadarPanel.tsx`).

### Delta completo da branch, sem buraco
`git diff --name-status --diff-filter=A 2d97c44cf origin/claude/...` → **vazio** (branch não cria arquivo
novo). `--diff-filter=D` → só `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts`, e
`git ls-tree origin/main -- <esse caminho>` também vem vazio: main já apagou o mesmo arquivo. Logo não há
arquivo exclusivo da branch; os 45 caminhos do JSON são o universo todo.

### Conferi um por um os 17 arquivos de produção (não só os citados pela triagem)
| Arquivo | Linha da main que cobre | Veredito |
|---|---|---|
| `useAuth.tsx` | `:26` helper `esvaziarFilaDeEnvioOffline` com try/catch, chamado em `:175` (SIGNED_OUT) **e** `:249` (signOut que falha e não emite evento) | superset (branch cobria 1 caminho, sem try/catch) |
| `chat.service.ts` | `:64` `blob.type.split(';')[0].trim()`, `:65-70` `extByMime` com webm/ogg/m4a/**mp3**, `:74` `contentType: mimeType` | superset |
| `useDashboardKpi.ts` | `:121-125` `p_from`/`p_until` + `:130-135` fallback `p_since` quando PGRST202/42883 | superset |
| `useDiagnosticsData.ts` | `:317` `classifyHealth(connectionsCountError ?? dbError, …)` — idêntico | igual |
| `useUserSettings.ts` | `:88` `isError`, usado em `:258`/`:307`, exportado em `:326` | igual |
| `useKnowledgeBase.ts` | `:61`/`:65`/`:73` `setError` agregando as 2 queries + `:75` catch; `:237` exporta `error` | superset |
| `useWarRoomAlerts.ts` | `:151` `if (settings.browserNotifications)` → `:152` `showBrowserNotification`; dep `:164` igual. O guard de permissão que a branch inlinou está **dentro** do helper: `src/utils/notificationSounds.ts:79` `if ('Notification' in window && Notification.permission === 'granted')` | equivalente, melhor fatorado |
| `useTeamChatNotifications.ts` | `:144-148` refs de preferências, `:161` `uniqueRealtimeTopic('team-chat-notifications')`, `:207-208` leitura por ref, `:240-243` `showBrowserNotification` com `onClick: navigateToView('team-chat', { cid })`, `:254` `}, [profile]` | superset (o `onclick` da branch não levava o `cid`) |
| `useAgentCelebrations.ts` | `:174` `marcoMontagem = Date.now()`, `:173` `TOLERANCIA_RELOGIO_MS = 2000`, `:190` compara com tolerância e trata `earned_at` NaN, dep `celebrarConquista` em `:205` | superset |
| `useTalkXSegments.ts` | `:80-81` `ponteOnly: true` em real_sector/real_uf, `:90` `lead_origin` comingSoon, `:209` `if (def.ponteOnly) return null`, `:280` `assertNoPonteOnlyFields` chamada em `:311` e `:333` | superset (flag genérica no lugar da lista literal) |
| `useInboxFilters.ts` | `:2` `useSearchParams`, `:65` `normalizeContactType`, `:97`, `:108`, `:151-160` `setSearchParams(…, {replace:true})`, `:168` | igual/superset |
| `AdminView.tsx` | `:27` import `CronJobsTab`, `:47` `AdminTab` com `'cron'`, `:195` item da aba só p/ admin, `:502-504` render dentro de `SectionErrorBoundary`, `:104` refetch em `users` **ou** `audit` | superset |
| `MediaMigrationTool.tsx` | `:9` `countPendingMedia`/`fetchMigrationHistory` do serviço, `:51-52` estados `PendingCount`/`HistoryState` com loading/error/ready, `:162-177` badge + refresh, `:281-309` histórico, `:311-325` AlertDialog, `:233-234` "Código do erro" | superset (branch tinha `ignored?: number` só no tipo, nunca renderizado) |
| `TalkXTemplateEditor.tsx` | `:72` prop, `:80` destructuring, `:141` chamada; consumidor em `TalkXTemplates.tsx:277` | igual (a branch nem ligava a prop em quem usa) |
| `TalkXOverview.tsx` | `:354` `rowLabel={(c) => c.name}` → `kit/table.tsx:211` `label={rowLabel ? \`Ações de ${rowLabel(row)}\` : 'Ações'}` (+ `:199` idem no checkbox) | superset |
| `useTalkXSuppression.ts` | `:11` `import { useQuery }` — a única adição da branch | já na main |
| `scripts/db-audit/…conversation-id.test.sh` | `:400-402` bloco `migration_predecessor` idêntico | já na main |

### Único candidato a "lacuna" é regressão, confirmado no código da main
- `useInboxBulkActions.ts`: a branch troca o `update … .in('id', ids)` por `.eq('id', id)` em laço. A main
  (`:242-305`) não faz UPDATE direto: usa `moveConversationsStatus` com grupos direct/two-step,
  `restore = status === 'resolved' && from === 'archived'`, conta por conversa e trata parcial. O comentário
  `:244-248` registra que o trigger `enforce_conversation_status_transition` recusa o caminho direto (23505).
  Portar = quebrar o desfazer do arquivamento.
- `useTeamChatPanel.search-antigas.test.tsx`: main tem **8 `it(` reais e 0 `it.todo`**; branch tem
  **8 `it.todo`** (contagem por `grep -c`). Portar apaga cobertura.
- `filesPeriod.adversarial.test.ts`: main fixa o fuso na raiz — `vitest.config.ts:8`
  `process.env.TZ = "America/Sao_Paulo"` e `src/test/global-setup-tz.ts:7`. O `it.skipIf` da branch é inferior.
- `ESTADO.md`: arquivo gerado; main já tem as âncoras do código de hoje (`:43` useKnowledgeBase.ts:137/:208,
  `:58` useInboxBulkActions.ts:323, `:98` MediaMigrationTool.tsx:97). As da branch (`:130/:201`, `:237`, `:125`)
  apontam para linhas que não existem mais.

### Prova de execução independente (não reaproveitei a saída da triagem)
`npx vitest run` em 10 dos arquivos tocados, incluindo todos os que a branch "consertava" com mock novo:
AdminView.limiteChats, AdminView.a11y, AgentsView.capacidade, ChatMessagesArea.pagination,
security-push-listener-mount, filesPeriod.adversarial, command-palette.busca-antiga, useInboxBulkActions,
useTeamChatPanel.search-antigas, useTeamChatNotifications.canal-estavel →
`Test Files 10 passed (10) / Tests 102 passed | 1 expected fail (103)`. Nenhum mock da branch é necessário hoje.

**Parecer: OBSOLETA confirmada, `apagar_branch_seguro = true`.** Nada de valor ≥ médio fora da main.
