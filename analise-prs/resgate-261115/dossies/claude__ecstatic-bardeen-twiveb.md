# Dossiê — `claude/ecstatic-bardeen-twiveb`

- **ref**: `origin/claude/ecstatic-bardeen-twiveb` · **tip** `7305ed4f358976b26723b1dcea507297f0aaff48` (2026-11-07)
- **merge_base**: `437a0013b65a8926bc95b8e2708782dd7fcac9d3` (2026-10-23) · 69 commits à frente · 96 arquivos, +4084/−1412
- **PRs**: nenhuma · **pré-classificação mecânica**: MISTO_CONFLITO (83 arquivos com lacuna, 3813 linhas)
- **Veredito**: **OBSOLETA** · confiança **alta** · `apagar_branch_seguro = true`

## Propósito
Sessão de agente de 2026-10-23 cujo único objetivo era **deixar a CI da `main` verde** (ver
`git log --format='%h %s' 437a001..origin/claude/ecstatic-bardeen-twiveb`: 60+ commits do tipo
"fix(tests): corrige N falhas de unit test", "fix(typecheck)", "fix(ci)"). Dois subprodutos:
(a) os artefatos de processo em `analise-prs/`; (b) uma migration do TalkX N-131.

O último commit (`7305ed4f3`, 2026-11-07) é reparo da **própria divergência** da branch, não trabalho novo
("useAdminData: … reescreve handleCreateUser", "WarRoomDashboard: corrige import", "SentinelAlertPanel: cria
componente novo", "SentimentAlertsDashboard: remove incomplete").

Nas 3 semanas seguintes a `main` resolveu **toda** a mesma pauta de forma independente e mais completa, e a
branch, por ter reescrito arquivos em vez de corrigi-los, hoje é na prática um **retrocesso**.

## Tabela arquivo × achado × evidência

### Banco / migrations
| arquivo | achado | evidência |
|---|---|---|
| `supabase/migrations/20261023100000_talkx_campaign_recipients_page_add_segment.sql` | **OBSOLETA — a `main` recebeu este mesmo arquivo e o aposentou de propósito** | byte-idêntico a `origin/main:supabase/migrations/_superseded/20261023100000_…sql` (`diff` vazio). README do `_superseded` (linhas 118-133): "Nunca aplicada — movida para evitar `missing_count=2` no `db-migrate.yml` (2026-11-02)". A intenção vive hoje em `origin/main:supabase/migrations/20261107180000_talkx_campaign_recipients_page_add_segment.sql`, **aplicada em produção**: `select version,name from supabase_migrations.schema_migrations where version='20261107180000'` → 1 linha. Assinatura real em produção: `p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text, p_segment_id uuid` — **ordem diferente** da da branch (`…, p_segment_id uuid, p_search text`), logo o arquivo da branch nem é portável. |

### Scripts de auditoria de banco
| arquivo | achado | evidência |
|---|---|---|
| `scripts/db-audit/replay-known-failures.json` | **INCORPORADA** (4 entradas novas + remoção da obsoleta) | as 4 estão na `main`: `replay-known-failures.json:87` (`20261011003008`), `:91` (`20261012192938`), `:95` (`20261013210002`), `:99` (`20261013230007`); `20260927570000` também já saiu da `main` (grep sem resultado). |
| `scripts/db-audit/dashboard-rls-authorization.test.sh` | **INCORPORADA/superada** | a `main` extrai o `dashboard_kpi` final da mesma migration (`:444` `20261007013217_conversation_closures_reopen_same_day.sql`) **e** mantém a intermediária (`:431` `20261003272707`) — mais completo que a troca feita na branch. A guarda do `is_admin_or_supervisor` na `main` é por regex de vigência (`:134-136 assert_last_definer`), não pelo `ALTER FUNCTION … SET search_path` colado no `helpers.sql`. A branch também introduziu um espaço duplo gratuito em `[[  "$output"`. |
| `scripts/db-audit/known-violations.json` | **OBSOLETA** | as 2 entradas (`rpc:admin_list_cron_jobs:src/components/admin/AdminView.tsx`, `rpc:set_voip_profile_credentials:src/components/admin/useAdminData.ts`) existiam só para liberar o código divergente da branch. Não estão na `main` e não são necessárias: a `main` chama a RPC de cron via `useTarefasAgendadas.ts` (já no baseline) e o VoIP via cast em `useAdminData.ts:420`. |
| `scripts/db-audit/talkx-campaign-recipients-page.test.sh` | **lacuna residual real, mas não portável** | a `main` ainda afirma 5 parâmetros (`:120 fn='public.talkx_campaign_recipients_page(uuid,integer,text,text,text)'`) enquanto produção já roda 6. A versão da branch usa a ordem **errada** (`…,uuid,text`), então não serve; o ajuste precisa ser reescrito contra `20261107180000`. Valor baixo (cobertura de teste), não bloqueia nada. |

### Front / hooks — intenção já na `main` (quase sempre melhor)
| arquivo | achado | evidência na `main` |
|---|---|---|
| `src/components/admin/useAdminData.ts` (255 linhas "ausentes") | INCORPORADA | `createUserError` `:194`, `mapCreateUserError` `:135`, `CreateUserFieldError` `:123`, retry do 401 com duas chamadas `invokeEdge('create-user', { body })` `:496`/`:503`, `describeAccessError(error)` de 1 arg `:82`, cast do `set_voip_profile_credentials` `:420`, export `createUserError` `:530`. A branch usava `invokeEdge('create-user', body)` (assinatura divergente) + `@ts-expect-error`. |
| `src/components/dashboard/WarRoomDashboard.tsx` | **REGRESSÃO** | a branch troca o painel real por um esqueleto (`<h1>War Room</h1>`, classe `p4` quebrada, `interface Agent/Queue` locais) e apaga `WarRoomMetricCard`, `WarRoomQueueRow`, `WarRoomAlertRow`, `WarRoomAgentCard`, `AgentReassignmentPanel`, `useWarRoomMetrics`, `useWarRoomAlerts` com som e Tooltips — todos vivos na `main` (`WarRoomDashboard.tsx:6,20,24,45,58,137-139`). |
| `src/components/dashboard/SentinelAlertPanel.tsx` (arquivo novo) | **OBSOLETA e quebrada contra produção** | não existe na `main` e lá o descarte de alerta já existe via `useWarRoomAlerts.dismissAlert` (`useWarRoomAlerts.ts:175,237`, consumido em `WarRoomDashboard.tsx:86`). O componente grava `dismissed_at` em `warroom_alerts`, coluna que **não existe**: produção tem `id, alert_type, title, message, source, is_read, dismissed_by, created_at, dedupe_key` (`information_schema.columns`). |
| `src/components/dashboard/SentimentAlertsDashboard.tsx` | **REGRESSÃO** | a branch remove o aviso de leitura incompleta; a `main` mantém (`SentimentAlertsDashboard.tsx:14,51-52` + `useSentimentData.ts:93,234 incomplete`). |
| `src/components/admin/MediaMigrationTool.tsx` | **REGRESSÃO** | a branch reduz a ferramenta a dois `<div>`; a `main` tem Card/Progress com `aria-label` e contagem de pendentes com estado de erro (`:3,6,132,149,165-168,199`). |
| `src/components/admin/AdminView.tsx` | **OBSOLETA** | a `main` tem a aba `cron` com gate de admin (`:47,195,502`) servida pelo hook dedicado; as outras 4 abas inventadas pela branch (training/migration/webhooks/analytics) duplicariam telas que a `main` já roteia (`src/pages/ViewRouter.tsx`, `src/pages/lazyViews.ts` importam `MediaMigrationTool` e `GmailWebhookMonitor`). |
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | **CONTRADIZ a regra vigente** | a branch libera só `isAdmin`; a `main` libera admin **e** supervisor, alinhada à RLS (`:37-39` "A RLS permite escrita a admin e supervisor; agentes podem apenas consultar" → `const { isSupervisor: canWrite } = useUserRole()`, aviso em `:58`). A regra da `main` é a correta; nada a resgatar. |
| `src/components/settings/AvatarUpload.tsx` | INCORPORADA | a `main` já usa nome estável + `upsert: true` (`:16,71,74,95`), igual à branch. |
| `src/components/connections/ConnectionsView.tsx` | INCORPORADA/superada | `addConnectionError`/`clearAddConnectionError` em `:42,165-167`; a máscara da branch (função `maskPhone` inline) foi substituída pelo componente `PhoneInput` + `telefoneValido` + `phoneError` (`:11,164`). |
| `src/hooks/inbox/useInboxFilters.ts` | INCORPORADA | `useSearchParams` em `:2,97` (a branch propôs exatamente isso em lugar de `window.history.replaceState`). |
| `src/services/chat.service.ts` | INCORPORADA/superada | MIME real do blob + extensão por mapa em `:61-74` (a `main` cobre também `audio/webm`). |
| `src/services/outbound-message.service.ts` + `src/lib/offlineQueue.ts` | INCORPORADA/superada | `readAuthenticatedUserId` extraído para `@/lib/authenticatedUserId` (`outbound-message.service.ts:13`), filtro de dono da mensagem em `:379-380`, gravação do `userId` em `:405-412`, campo `userId` na fila em `offlineQueue.ts:37`. A branch duplicava a leitura do token (`readCurrentUserId` local) e filtrava no `drain`. |
| `src/lib/mediaVolumeStore.ts` | INCORPORADA/superada | a `main` extraiu para `./authenticatedUserId` (`:30,160,174`) em vez de exportar a função do store. |
| `src/hooks/auth/useAuth.tsx` | INCORPORADA | `offlineSendQueue.clear()` no logout (`:12,28`). |
| `src/components/ui/command-palette.tsx` | INCORPORADA/superada | `role="option"` **+ `id` + `aria-selected`** em `:296,310,338`. |
| `src/hooks/chat/useTeamChatNotifications.ts` | INCORPORADA/superada | canal único por instância via helper compartilhado `uniqueRealtimeTopic('team-chat-notifications')` (`:161`), em vez do `channelIdRef` ad-hoc da branch. |
| `src/components/team-chat/useTeamChatPanel.ts` | INCORPORADA | `olderError` `:74`, `SEARCH_LIMIT = 100` `:19`, mínimo de busca em constante `MIN_SEARCH_CHARS = 2` `:18,282,344` (a `main` decidiu 2; a branch cravou 3). |
| `src/hooks/analytics/useGoalsDashboard.ts` | INCORPORADA | `hasData` `:18`, taxa por `contacts.conversation_status='resolved'` `:128`, exclusão da média `:177,183`. |
| `src/components/dashboard/DashboardView.tsx` + `src/hooks/dashboard/useDashboardKpi.ts` | INCORPORADA/superada | título por período em `DashboardView.tsx:217`; a `main` **mantém** o aviso `dash-kpis-period-notice` `:225` de propósito e já chama `p_from`/`p_until` com queda para `p_since` (`useDashboardKpi.ts:122-123,131`). Produção tem as duas assinaturas (`pg_proc`: `p_since,p_queue,p_agent` e `p_from,p_until,p_queue,p_agent`), então a `main` está à frente da branch. |
| `src/hooks/system/useUserSettings.ts` | INCORPORADA | `isError` em `:88,258,307,326`. |
| `src/hooks/system/useDiagnosticsData.ts` | INCORPORADA/superada | a `main` leva o erro para a classificação de saúde (`:317 classifyHealth(connectionsCountError ?? dbError, …)`). |
| `src/hooks/integrations/useTalkXSuppression.ts` | INCORPORADA | o hook morto saiu da `main` também (`main` tem 293 linhas, a branch 305; a `main` exporta só `useTalkXSuppressionActivity` `:218` e `useTalkXSuppressionStats` `:283`). |
| `src/hooks/business/useQueueGoals.ts` | **REGRESSÃO de 1 linha** | a branch estraga o comentário ("fila estoura"); a `main` está correta (`:32` "esconde fila estourada"). |
| `src/components/admin/AdminUsersTable.tsx` | OBSOLETA | cast `as keyof typeof` que só servia aos tipos divergentes da branch; a `main` não precisa (`:66`). |

### Testes e harness (≈35 arquivos) — nenhum traz comportamento ausente
| arquivo | achado | evidência |
|---|---|---|
| `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts` (novo) | **OBSOLETA/superada** | 1 asserção ("hook foi removido do módulo"). A `main` tem `useTalkXSuppression.hook-morto.test.ts` com 6 asserções, incluindo varredura anti-reintrodução (`:83,87,93,133,141,150`) e `useTalkXSuppression.test.tsx` com 5 casos da trilha. |
| `src/test/setup.ts` | OBSOLETA | o `clientHeight/clientWidth` global de 600/800 não está na `main`: a `main` resolve por teste (18 arquivos com `clientHeight`, entre eles `ExternalProductCatalog.virtualizacao.test.tsx`, os 5 de `ChatMessagesArea` e `ChatPopup.pagination`). A própria branch teve de neutralizá-lo depois (commit `b3fd84c1f` "neutraliza clientHeight=600 global no ChatPopup.pagination"). |
| demais `__tests__/**` (AdminView.*, MediaMigrationTool.*, AgentsView.*, ChatMessagesArea.*, ChatPopup.*, useRateLimitLogs, useTeamChatNotifications.*, FilesTab.fase6, n066-a11y, EmailChatInbox, GamificationSection, WorkItemSheet.fuso, useFilesContainerColumns, filesPeriod.adversarial, …) | OBSOLETAS | varredura do diff inteiro de `__tests__` filtrando plumbing: tudo que sobra é `vi.mock`/`stubGlobal`/`Object.defineProperty`, constantes de mock (`AUDIT_PAGE_SIZE: 50`, `MIN_PASSWORD_LENGTH: 8`) e asserções **coladas aos componentes divergentes da branch** — ex.: `useUserRole: () => ({ isAdmin: true, isSupervisor: false })` (o gate errado de templates) e asserções de abas do `AdminView` reescrito. Todos esses arquivos existem na `main`, adaptados ao código da `main`. |

### Artefatos de processo
| arquivo | achado |
|---|---|
| `analise-prs/MISSAO.md`, `analise-prs/progresso.json`, `analise-prs/prs.csv`, `analise-prs/prs.json` (≈2.180 linhas) | OBSOLETOS — inventário de PRs da sessão de 2026-10-23 (`"sessao": "2026-10-23"`, `"total_prs_inicio": 137`, `main_sha_inicial 5a4632c8`). A `main` tem versões próprias e posteriores dos três arquivos de dados. Valor nenhum. |
| `ESTADO.md` | OBSOLETO — só âncoras de linha (`useKnowledgeBase.ts:126→133`, `useAdminData.ts:448→197`, `MediaMigrationTool.tsx:28→97`, `outbound-message.service.ts:456→460`) do código de 2026-10-23. Documento gerado/validado contra o HEAD; as âncoras de hoje são outras. |
| `.github/workflows/db-guard.yml` | INCORPORADA (`SKIP_DOCKER_SHIM: "1"` — `missing_in_main = 0`). |

## O que fazer
Nada a resgatar. Único resíduo registrado, de valor baixo e **não portável como está**:
`scripts/db-audit/talkx-campaign-recipients-page.test.sh` na `main` ainda testa 5 parâmetros enquanto
produção roda 6 (`20261107180000` aplicada). Se alguém quiser fechar isso, reescrever contra a ordem real
(`uuid, integer, text, text, text, uuid`) — a ordem usada na branch está errada.

Branch segura para apagar: nenhum arquivo tem intenção útil fora da `main`, e o que é exclusivo dela é
retrocesso (painéis reduzidos a esqueleto, aviso de leitura incompleta removido, gate de templates mais
restrito que a RLS) ou quebrado contra produção (`dismissed_at` inexistente em `warroom_alerts`).

## Verificação adversarial

Parecer: **CONCORDO com OBSOLETA** · `apagar_branch_seguro = true`. Tentei refutar e não achei nenhum hunk
de valor ≥ médio fora da `main`. O que é exclusivo da branch é regressão, duplicata ou código morto.

### Confirmações independentes (checadas por mim, não copiadas da triagem)
- **Migration**: `diff` entre `branch:supabase/migrations/20261023100000_…sql` e
  `origin/main:supabase/migrations/_superseded/20261023100000_…sql` → **vazio**. Produção
  (`db_query`): `schema_migrations` **não** tem `20261023100000`; tem `20261107180000` e
  `20261112171000`. `pg_get_function_identity_arguments` da `public.talkx_campaign_recipients_page`
  em produção = `p_campaign_id uuid, p_page_size integer, p_cursor text, p_status text, p_search text,
  p_segment_id uuid`; o arquivo da branch declara `…, p_segment_id uuid, p_search text` (br_mig.sql:13-20)
  — ordem trocada, não portável.
- **`SentinelAlertPanel.tsx`**: `information_schema.columns` de `public.warroom_alerts` em produção =
  `id, alert_type, title, message, source, is_read, dismissed_by, created_at, dedupe_key`. **Não existe
  `dismissed_at`** — o componente novo gravaria coluna inexistente. A `main` dispensa alerta com
  `update({ is_read: true })` (`useWarRoomAlerts.ts:175-176`, consumido em `WarRoomDashboard.tsx:86`).
- **`WarRoomDashboard.tsx`**: `main` 201 linhas × branch 120. A `main` tem **tudo** o que a branch tem
  (loading `role="status"` `:114`, erro `role="alert"` + "Tentar de novo" `:126,132`, `role="log"` +
  `aria-live` `:166-168`) **mais** `WarRoomMetricCard` `:20,137-142`, `AgentReassignmentPanel` `:24,194`,
  `useWarRoomMetrics` `:6,58`, Tooltips `:107-109`. Nada a resgatar.
- **`WhatsAppTemplatesManager.tsx`**: `main:37-39` comenta a RLS (admin **e** supervisor) e usa
  `const { isSupervisor: canWrite }`, com aviso em `:58`. O gate `isAdmin` da branch é mais restrito que
  a regra vigente — rejeitado.
- **`SentimentAlertsDashboard`/`useSentimentData`**: `main` mantém `incomplete` (`:14,51-52` e
  `useSentimentData.ts:93,234`) **e já tem** `error`/`isError` (`:234`) — ou seja, o único ganho da branch
  já está na `main` sem a remoção do aviso.
- **`MediaMigrationTool.tsx`**: `main` 328 linhas × branch 174 (esqueleto). As abas extras do `AdminView`
  da branch são duplicata: a `main` roteia essas telas por `ViewRouter.tsx:91-92` + `lazyViews.ts:50-51` +
  entradas de menu admin-only em `navigation.service.ts:161-162`. A aba `cron` existe na `main`
  (`AdminView.tsx:47,195,502`).
- **db-audit**: as 4 entradas novas de `replay-known-failures.json` estão na `main` (`:87,91,95,99`); as 3
  de `known-violations.json` **não** estão e não são necessárias; `dashboard-rls-authorization.test.sh` da
  `main` extrai `dashboard_kpi` das **duas** migrations (`:428-448`) e guarda `is_admin_or_supervisor` por
  `assert_last_definer` com regex de vigência (`:130-136`) — superior à troca da branch.
- **Incorporadas confirmadas uma a uma**: `useAdminData.ts` (`mapCreateUserError` `:135`,
  `CreateUserFieldError` `:124`, `createUserError` `:194`, `invokeEdge('create-user', { body })` `:496`,
  `describeAccessError` `:82`, `avatarObjectPath`/`createSignedUrl` `:25,238-242`, `AUDIT_PAGE_SIZE` `:121`),
  `ConnectionsView.tsx:11,42,72,81,164` (PhoneInput + `telefoneValido` + `phoneError`, superior ao
  `maskPhone` inline), `outbound-message.service.ts:13,379-380,405-412` + `offlineQueue.ts:37`,
  `useGoalsDashboard.ts:18,128,177`, `AvatarUpload.tsx:71-74`, `command-palette.tsx:296,310,338`,
  `useInboxFilters.ts:2,97`, `useTeamChatPanel.ts:18,19,74`, `chat.service.ts` (MIME real + mapa de
  extensão, inclui `audio/ogg`/`audio/mp4`/`audio/mpeg`), `useAudioMemes.ts:205,210` (caminho por
  `user.id`), `useKnowledgeBase.ts:61,65,73,75` (erro com try/catch), `useTeamReadState.ts:102,118`
  (`hasOwnMessages` + `isError`), `useAgentCelebrations.ts:190` (`marcoMontagem` +
  `TOLERANCIA_RELOGIO_MS`, mais robusto que a comparação de string da branch),
  `useWarRoomAlerts.ts:151,164` (`settings.browserNotifications`),
  `useTeamChatNotifications.ts:9,161` (`uniqueRealtimeTopic`), `useTalkXSuppression.ts` (293 linhas,
  só `useTalkXSuppressionActivity` `:218` e `useTalkXSuppressionStats` `:283`).

### Regressões/defeitos que a triagem não listou (reforçam o veredito)
1. **`src/hooks/inbox/useInboxBulkActions.ts`** — a branch troca o arquivamento de
   `conversation_status: 'archived'` por `assigned_to: null` (e o desfazer passa a restaurar
   `assigned_to`): **muda regra de negócio** e faz todo mundo perder o responsável. A `main` arquiva pela
   RPC `moveConversationsStatus(targetIds, 'archived')` com FSM, restauração em 1-2 passos e a decisão do
   dono de 2026-11-13 ("conversa `waiting` não é arquivada", `:208-213`).
2. **`src/hooks/integrations/useTalkXSegments.ts`** — a branch remove a flag `g` do escape:
   `v.replace(/[\\"]/, …)` (só o 1º caractere é escapado) e marca `lead_origin` como `comingSoon`. Bug
   introduzido sobre o achado da PR #896 que a `main` preserva com `/[\\"]/g`.
3. **`src/hooks/business/useWarRoomAlerts.ts`** — a branch chama `usePushNotifications()` sem usar o
   retorno e dispara `new Notification(...)` direto (ignora o Service Worker), além de alterar o base64 do
   som. A `main` resolve o mesmo caso por `settings.browserNotifications` (`:151`).
4. **`src/hooks/chat/useTeamChatNotifications.ts`** — a branch apaga o payload `data` da notificação
   (`type`/`conversationId`/`messageId`), que é o que o SW usa para levar o clique à conversa, e troca o
   tópico único por `Math.random()` em ref. A `main` mantém o payload e usa
   `uniqueRealtimeTopic('team-chat-notifications')`.
5. **`src/components/admin/useAdminData.ts`** — a branch expõe `deleteUser` chamando
   `invokeEdge('delete-user', …)` (`br_uad.ts:510-530`): **código morto e quebrado** — nada no `src/` da
   própria branch consome `deleteUser`, e a edge `delete-user` não existe nem na branch nem na `main`
   (`git ls-tree … supabase/functions/` só tem `create-user`). A branch também duplica a superfície do
   hook (`createUser`+`handleCreateUser`, `updateUserRole`+`handleRoleChange`,
   `toggleUserActive`+`handleToggleActive`), sintoma da sessão "CI verde".

### Lacuna residual (igual à da triagem, confirmada)
`scripts/db-audit/talkx-campaign-recipients-page.test.sh`: a `main` aplica só
`20261010062941_talkx_campaign_recipients_page.sql` (`:19,118`) e afirma 5 parâmetros (`:120`), enquanto
produção roda 6 (`20261107180000` aplicada). É lacuna real de cobertura da `main`, de valor **baixo**, e a
versão da branch **não** é portável: usa a ordem errada (`…,uuid,text`) e referencia
`supabase/migrations/20261023100000_…sql`, caminho que na `main` só existe em `_superseded/` — o
`[[ -f ]] || fail` falharia. Se alguém quiser fechar, reescrever contra `20261107180000`.
