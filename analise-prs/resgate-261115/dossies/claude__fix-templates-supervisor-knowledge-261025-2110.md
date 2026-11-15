# claude__fix-templates-supervisor-knowledge-261025-2110 — INCORPORADA

- Ref: `origin/claude/fix-templates-supervisor-knowledge-261025-2110` · tip `101da096` · merge_base `2d97c44c` (24/10/2026)
- PR: #2268 · triagem anterior: JA_NA_MAIN (confirmada)
- 101 commits, 173 arquivos. Main hoje: `dac285f62` (15/11/2026) — 5.087 linhas que a branch não tem: a main avançou 3 semanas sobre o mesmo código.

## Propósito
Lote gigante de correções acumuladas: templates WhatsApp só graváveis por quem a RLS permite, Base de
Conhecimento sem travar em loading, erro visível em vários painéis (sentimento, auditoria, NPS, metas,
diagnóstico), Talk X (Segmentos lista/grade + painel, tela de campanha pausada, ponte Singu falha fechada),
fila de envio offline por usuário, reação única por autor na Inbox, PhoneInput E.164, dezenas de testes.

## Arquivo × achado × evidência (só os 26 com lacuna mecânica)

| Arquivo | Achado | Evidência na main |
|---|---|---|
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | **Na main** (o fix que dá nome à branch) | `origin/main:…:39 const { isSupervisor: canWrite } = useUserRole();` + gates nas linhas 58, 60, 101, 139-141 |
| `src/components/talkx/TalkXSegments.tsx` (161 linhas) | **Na main**, reescrito | `viewMode` lista/grade `…:57`, botões `segments-view-list/grid` `…:467-468`, grade `…:505`, foco por `selectedRowRef` `…:58,96`, abas da tela 03 `…:389-392` |
| `src/hooks/integrations/useTalkXSegments.ts` (15) | **Na main**, outra forma | falha fechada virou flag `ponteOnly` `…:78-80` + `throw` `…:285`; `lead_origin` com `comingSoon` `…:90` |
| `src/components/admin/MediaMigrationTool.tsx` (49) | **Na main**, extraído para serviço | `src/services/mediaMigration.service.ts:3-5` (`CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`), `:20 countPendingMedia`, `:33 fetchMigrationHistory`; consumido em `MediaMigrationTool.tsx:9,57,66` |
| `src/components/talkx/TalkXView.tsx` (4) | **Na main** e ampliado | `TalkXCampaignPaused` lazy `…:54`; `TalkXTopView` já inclui `'paused'` **e** `'report'` `…:66`; `openPaused` `…:310`; render `…:422-428` |
| `src/components/dashboard/useSentimentData.ts` (1) | **Na main** | `…:92 fetchError`, retorno `…:234` com `error/isError` (e `incomplete` real, não `false` fixo) |
| `src/components/security/AuditLogDashboard.tsx` (1) | **Na main** | hook `useAuditLogDashboard` `…:11,70`; `stat.hint` `…:113-114,124-125` (`text-2xs` em vez de `text-[11px]`) |
| `src/components/settings/SettingsView.tsx` (1) | **Na main**, evoluído | botão "Salvar Alterações" global não existe mais (grep vazio); destructuring agora `…:74 saveAppearanceSettings` |
| `src/components/inbox/InboxEmptyChat.tsx` (2) | **Na main** | `inbox-empty-shortcuts` `…:109`, "Atalhos do teclado" `…:112`, `<kbd>` `…:120` (classe `text-2xs`) |
| `src/components/inbox/MessageReactions.tsx` (5) | **Na main**, mais forte | reação única por autor com overlay otimista e rollback: `…:72-100` (`antigas`, `removeReaction` em laço, devolução no catch) |
| `src/hooks/inbox/useInboxFilters.ts` (1+6) | **Na main** | `normalizeContactType` `…:65`, uso `…:89,107-109,168` |
| `src/hooks/chat/useTeamChatNotifications.ts` (1+1) | **Na main** e ampliado | `tag: team-msg-…` `…:243`, agora com `{ cid }` no `navigateToView` |
| `src/hooks/gamification/useAgentCelebrations.ts` (2) | **Na main** e ampliado | `marcoMontagem` `…:174`, `Date.parse(...) > marcoMontagem + TOLERANCIA_RELOGIO_MS` `…:190` |
| `src/lib/authenticatedUserId.ts` (4) | **Na main** | arquivo existe; `readAuthenticatedUserId` `…:33`, varredura `storage.key(index)` `…:40` |
| `src/services/outbound-message.service.ts` (4) | **Na main** e **endurecido** | `pertenceAoUsuarioAtual` `…:379`; main usa `if (!message.userId) return false` (item sem dono **nunca** drena) contra o `return true` da branch — mudança deliberada em `831d6cefc fix(fila): impede envio offline sem dono e ressurreição após logout (#2333)`. A versão da branch está **obsoleta**, não perdida. |
| `src/components/ui/phone-input.tsx` (4) | **Na main**, reescrito | `isExplicitInternationalRef` `…:39,48`, passthrough de colagem `+` `…:77`, guardas `!digits.startsWith('55')` `…:91,103` |
| `supabase/schema-manifest.json` (3) | Artefato gerado | as 3 policies de `message_reactions` existem na main `…:4625-4628` com hash novo |
| `ESTADO.md` (7) | Doc gerado, regenerado depois | mesmas linhas com números atualizados: `origin/main:ESTADO.md:43` (`ai-kb-ingest`), `:119` (`talkx-send`) |
| `docs/talkx/ARQUITETURA.md` (1) | **Na main** | texto idêntico em `origin/main:docs/talkx/ARQUITETURA.md:7` + `:92` |
| `src/__tests__/a11y/icon-buttons-baseline.json` | Baseline gerado | existe na main (`git ls-tree`), regerado pelo `icon-button-names.test.ts:24` |
| `…/useAdminDataCreateUser.test.ts` (1) | **Obsoleta** | a branch esperava 4 papéis (`special_agent`); a main tem 3 — `…:148 "Expected 'admin' \| 'supervisor' \| 'agent'"` e `special_agent` não aparece em nenhum arquivo de `src/` |
| `…/ContactDetails.quickActions.test.tsx` (6) | **Obsoleta** | main mede a RPC em lote `set_conversations_status` com `p_contact_ids` `…:166,171,180`; a branch media a singular `set_conversation_status` |
| `…/ChatMessagesArea.pagination.test.tsx` (7) | **Na main** | mesma medida de layout: `clientHeight` `…:60`, `offsetHeight` `…:68` |
| `…/team-chat-notifications-mount.test.ts` (6) | **Na main** | mocks `useAuth` `…:55-56` e comentário `…:52-54` |
| `…/useInboxBulkActions.test.ts` (1) | **Na main** | `conversation_status: 'pending'` `…:575` |
| `…/N8nIntegrationView.a11y.test.tsx`, `…/TalkXView.route.test.tsx` | **Na main** | `...actual` do framer-motion `…:18-20`; `findByTestId('running')` `…:684,728` |

## Banco
`supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql` é IDENTICO ao da main e está
**aplicado em produção**: `select version,name from supabase_migrations.schema_migrations where
version='20261026210000'` → `20261026210000 | dashboard_kpi_periodo_aditivo`.

## Veredito
**INCORPORADA.** Todas as 26 lacunas se explicam por: (a) mesmo comportamento já na main com outro texto
(classe `text-2xs`, extração para serviço, `ponteOnly` em vez de `BRIDGE_FIELDS`, `selectedRowRef` em vez
de mapa de refs), (b) main foi além (report view no Talk X, tolerância de relógio, `cid` na notificação,
RPC em lote), ou (c) artefato gerado (manifest, baselines, ESTADO.md). Dois pontos são ativamente
**obsoletos**: o `return true` da fila offline (contrariado por #2333) e a expectativa de 4 papéis.

Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Refutação tentada contra `origin/main` = `dac285f62`. Reconferi, um a um, **os 23 arquivos com
`missing_in_main > 0`** (o JSON tem 173 entradas = os 173 arquivos de `git diff 2d97c44c..101da096`,
nada fora da lista). Nenhum hunk de valor ≥ médio ficou de fora da main.

| Lacuna | Conferência independente | Resultado |
|---|---|---|
| `WhatsAppTemplatesManager.tsx` (4) — o fix que nomeia a branch | branch `:38 const { isSupervisor: canWrite } = useUserRole();` **=** `origin/main:…:39` (idêntico); gates em `:58,60,101,138-141`; main tem a mais `MetaTemplatesDialog` `:66` e botão Enviar `:138`. As 4 linhas "faltantes" são só o **comentário** da branch (que diz "admin-only", divergindo do próprio código dela) | na main, com sobra |
| `TalkXSegments.tsx` (161) | `viewMode` `…:57`, `LayoutList/LayoutGrid` `…:4`, botões `segments-view-list/grid` `…:467-468`, grade `…:505,512`, foco por `selectedRowRef` `…:58,96,536`, aba "Regras Avançadas" `…:389`. O X116 (painel lê a cópia mais nova por id) existe como `selectedSegment` com comparação `updated_at` em `…:88-94`, consumido em `…:587-588` | na main (outra forma, equivalente) |
| `useTalkXSegments.ts` (15) | falha fechada da ponte Singu = flag `ponteOnly` `…:66,78-81`, `return null` no filtro `…:207-209`, `throw` de pré-resolução `…:275-285`; `lead_origin` com `comingSoon` `…:90` | na main |
| `MediaMigrationTool.tsx` (49) | bloco inteiro extraído para `origin/main:src/services/mediaMigration.service.ts` — `CDN_TEMP_PREFIXES` `:3`, `MIGRATION_ACTION` `:4`, `HISTORY_LIMIT` `:5`, `asCount` `:16`, `countPendingMedia` `:20`, `fetchMigrationHistory` `:33` | na main (extraído) |
| `TalkXView.tsx` (4) | `TalkXTopView` com `'paused'` **e** `'report'` `…:66`; `openPaused` `…:310`; roteamento `…:187,191`; render `…:422` | na main, ampliado |
| `useSentimentData.ts` (1) | `fetchError` `…:92`, retorno `…:234` com `error/isError` e `incomplete` **real** (`useState` `:93`), não `false` fixo | na main, melhor |
| `AuditLogDashboard.tsx` (1) | hook `useAuditLogDashboard` `…:11,70`; `stat.hint` `…:124-125` (`text-2xs`) | na main |
| `SettingsView.tsx` (1) | `useUserSettings` `…:32,74` com `isSaving`/`saveAppearanceSettings`; salvar agora é por seção (`AppearanceSettings … onSave` `…:225`) | na main, evoluído |
| `InboxEmptyChat.tsx` (2) | `inbox-empty-shortcuts` `…:109`, "Atalhos do teclado" `…:112`, `<kbd …text-2xs>` `…:120` | na main (só a classe mudou) |
| `MessageReactions.tsx` (0 faltantes, 5 "removidas ainda presentes") | reação única por autor com overlay otimista, laço de `removeReaction` e **rollback devolvendo** as antigas no catch: `origin/main:…:71-105` | na main, mais forte |
| `useInboxFilters.ts` (1) | `normalizeContactType` `…:65`, usos `…:89,107-109,168` | na main |
| `useTeamChatNotifications.ts` (1) | `tag: team-msg-${msg.conversation_id}` `…:243`, com `{ cid }` no `navigateToView` | na main, ampliado |
| `useAgentCelebrations.ts` (2) | `marcoMontagem` `…:174` + `Date.parse(...) > marcoMontagem + TOLERANCIA_RELOGIO_MS` `…:173,190` | na main, ampliado |
| `authenticatedUserId.ts` (4) | `readAuthenticatedUserId` `…:33`, varredura `storage.key(index)` `…:40` | na main |
| `outbound-message.service.ts` (4) | main: `pertenceAoUsuarioAtual` `…:378-380` com `if (!message.userId) return false` — o **oposto** do `return true` da branch, por decisão de `831d6cefc fix(fila): impede envio offline sem dono e ressurreição após logout (#2333)`. Restaurar a branch **regrediria** segurança | obsoleta de propósito |
| `phone-input.tsx` (4) | `isExplicitInternationalRef` `…:38-39,48`, passthrough de `+` colado `…:76-80`, guardas `!digits.startsWith('55')` `…:91,103-104` | na main, reescrito maior |
| `schema-manifest.json` (3) | as 3 policies `message_reactions_{delete,insert,update}_policy` existem em `origin/main:…:4625-4628` (hash novo) | artefato gerado |
| `ESTADO.md` (7) | mesmas linhas regeneradas: `ai-kb-ingest` `:43`, `create-user` `:67`, `migrate-media-storage` `:98`, `talkx-send` `:119`, `connection-health-check` `:65`, `message-delivery` `:96` | artefato gerado |
| `docs/talkx/ARQUITETURA.md` (1) | "`TalkXCampaignPaused.tsx` (TL-075) **passou a existir**" em `origin/main:…:7` | na main |
| `useAdminDataCreateUser.test.ts` (1) | main `…:148` espera 3 papéis; `special_agent` não existe em `src/` da main (`git grep` vazio) | obsoleta |
| `ContactDetails.quickActions.test.tsx` (6) | main mede a RPC **em lote** `set_conversations_status` com `p_contact_ids` `…:54,166,171,180`; a singular da branch não é mais a API | obsoleta |
| `ChatMessagesArea.pagination.test.tsx` (7) | mesma medida de layout jsdom: `clientHeight` `…:60`, `offsetHeight` `…:67-68` | na main |
| `team-chat-notifications-mount.test.ts` (6) | mocks e comentário equivalentes em `…:52-56` (main usa `profile: null`); a diferença é andaime de teste, valor baixo | na main |
| `useInboxBulkActions.test.ts` (1) | `conversation_status: 'pending'` `…:575` | na main |
| `icon-buttons-baseline.json` | existe na main (`git ls-tree` → blob `3203e5f3`), regerado por teste | artefato gerado |

Também confirmei que o único arquivo de banco (`supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql`)
está `IDENTICAL_TO_MAIN` — nada de DDL pendente vindo desta branch.

**Concordo com a triagem: INCORPORADA.** Não achei um único hunk de valor ≥ médio fora da main; os dois
pontos divergentes (fila offline sem dono e os 4 papéis) estão **contra** a main atual e restaurá-los seria
regressão. `apagar_branch_seguro = true`.
