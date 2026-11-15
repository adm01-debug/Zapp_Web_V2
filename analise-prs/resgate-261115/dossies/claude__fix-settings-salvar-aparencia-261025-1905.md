# claude__fix-settings-salvar-aparencia-261025-1905 — OBSOLETA

- Branch: `origin/claude/fix-settings-salvar-aparencia-261025-1905` (tip `eded8e947`), merge-base `2d97c44cf` (24/10), 101 commits, PR #2263.
- Triagem anterior (08/11): `JA_NA_MAIN` — **confirmada** nesta releitura de código.

## Propósito
Branch-guarda-chuva de resgate: 101 commits de correções acumuladas (testes, a11y, Talk X, inbox, admin,
settings). O commit-título (`eded8e947`) corrige o `TypeError` ao salvar Aparência — a `SettingsView` não
passava `isSaving`/`onSave` ao `AppearanceSettings`. Os outros 100 commits são fixes independentes que a
`main` recebeu por outras PRs ao longo de outubro/novembro.

## Veredito
**OBSOLETA** — toda intenção das 27 lacunas está na `main`, e nos casos em que a linha literal não está é
porque a `main` tem a **versão posterior e mais forte** da mesma coisa. Portar qualquer hunk hoje seria
regressão. 135 dos 162 arquivos já são `IDENTICAL_TO_MAIN` ou `PRESENT_REVERSE_APPLIES` (prova mecânica).

## Arquivo × achado × evidência (só os 27 com lacuna)

| Arquivo | Achado | Evidência na `main` |
|---|---|---|
| `src/components/settings/SettingsView.tsx` | **Fix titular já na main, com nome melhor**: a main usa `saveAppearanceSettings` (escrita dedicada) no lugar de `saveSettings` | `origin/main:src/components/settings/SettingsView.tsx:74` e `:225` (`isSaving={isSaving} onSave={saveAppearanceSettings}`); props em `AppearanceSettings.tsx:22-23`, botão em `:159` |
| `src/components/dashboard/useSentimentData.ts` | main tem `error`/`isError` **e** `incomplete` como estado real (branch devolvia `incomplete: false` fixo) | `useSentimentData.ts:92-93` e `:234` |
| `src/components/security/AuditLogDashboard.tsx` | idêntico em comportamento; única divergência é token de fonte (`text-[11px]` → `text-2xs`) | `AuditLogDashboard.tsx:11,70,105,113-114,125,214` |
| `src/components/admin/MediaMigrationTool.tsx` | lógica **extraída** para serviço: `countPendingMedia`, `fetchMigrationHistory`, `CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`, `asCount` — byte a byte | `src/services/mediaMigration.service.ts:1-60`; consumo em `MediaMigrationTool.tsx:9-10,57,66,77,81` |
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | **premissa da branch está errada hoje**: ela fecha escrita para admin-only; a RLS de produção é `is_admin_or_supervisor` e a main acompanha (`isSupervisor` inclui admin) | `WhatsAppTemplatesManager.tsx:39,58`; produção: policy `Admins can manage templates` = `is_admin_or_supervisor(auth.uid())` (pg_policies, leitura via MCP) |
| `src/components/catalog/__tests__/WhatsAppTemplatesManager.confirmacaoExclusao.test.tsx` | mock de `useUserRole` já na main | `:13` |
| `src/components/inbox/InboxEmptyChat.tsx` | só token tipográfico (`text-[11px]`/`text-[10px]` → `text-2xs`/`text-3xs`) | `git diff origin/main <ref>` = 2 linhas de classe |
| `src/components/inbox/MessageReactions.tsx` | main é superset: expõe `isError`, `data-error` e desabilita os botões durante `isReacting` — a branch não tinha | linhas 140/196/332/364/401-418 na main |
| `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` | main mede a RPC **plural** `set_conversations_status` com `p_contact_ids`/`p_expected_current` (contrato mais novo); branch media a singular | teste da main valida `set_conversations_status` + `previous_status` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` | medida de layout no jsdom já na main | `:60,67-68` |
| `src/components/integrations/__tests__/N8nIntegrationView.a11y.test.tsx` | main preserva `importOriginal`/`useReducedMotion` reais (mock mais fiel) | diff vs main mostra a main com `importOriginal` |
| `src/components/talkx/TalkXSegments.tsx` | main é iteração **posterior** (X115): recorte no endereço, filtro de proprietário, paginação persistida por usuário, seleção-fantasma; branch tem a versão anterior (estado local) | `TalkXSegments.tsx:57-58,96,467-468,505,536`; abas da tela 03 em `:389-392`; ↻ com `refreshEstimates.mutate` em `:379` |
| `src/components/talkx/TalkXView.tsx` | main é superset: tem `report` + `TalkXCampaignReport` e guarda de rascunho local no back/forward; branch não tinha | `TalkXTopView` com `'report'`, `reportCampaignId`, `keepLocalDraft` |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | cobertura equivalente na main | `:72,680,684,728` |
| `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` | mocks de `useAuth` e do estado vazio já na main | `:52-56,76-77` |
| `src/components/ui/phone-input.tsx` | main é muito mais completa (paste/drop, `isExplicitInternationalRef`, `lastEmittedRawRef`); as regras que a branch documentava (fixo sem 9 → `XXXX-XXXX`, passthrough E.164) **são contexto não alterado**, logo já estão na main | `phone-input.tsx` na main: `formatPhone` com `rest.length === 8 && !rest.startsWith('9')` e `return \`+${digits}\`` |
| `src/hooks/chat/useTeamChatNotifications.ts` | main navega com `{ cid: msg.conversation_id }` (abre a conversa certa); branch navegava sem o cid | `:240,271` |
| `src/hooks/gamification/useAgentCelebrations.ts` | main tem `TOLERANCIA_RELOGIO_MS = 2000` (que a branch não tem); lacuna é só rename `CAMAS_BASE`→`CANAL_BASE` e acento em comentário | `useAgentCelebrations.ts:169-189` |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | restauração por status já coberta | `:575` |
| `src/hooks/inbox/useInboxFilters.ts` | main é superset: mantém "tipo do deep-link manda" **e** sincroniza o rascunho no back/forward (`lastUrlType`), que a branch não tinha | `useInboxFilters.ts` — bloco `lastUrlType` só existe na main |
| `src/hooks/integrations/useTalkXSegments.ts` | mesma semântica de falha fechada, com outro nome: `ponteOnly` + `assertNoPonteOnlyFields`, chamada em `countAudience`/`resolveAudience`; `lead_origin` com `comingSoon: true` | `useTalkXSegments.ts:66,80-81,90,209,280-287,311,333` |
| `src/hooks/system/useUserSettings.ts` | sem lacuna real (`missing_in_main: 0`, `removed_still_in_main: 0`) | JSON do item |
| `src/lib/authenticatedUserId.ts` | main é **mais restritiva** (só aceita a chave do projeto configurado, `configuredSessionKey`); a branch varria qualquer `sb-*-auth-token` | `authenticatedUserId.ts` na main importa `SUPABASE_URL` e prefere a chave do ref |
| `src/services/outbound-message.service.ts` | main é **mais restritiva**: item sem dono nunca drena, `enqueueOffline` exige sessão, e traduz "WhatsApp desconectado" via `surfaceDisconnected` — a branch deixava item órfão drenar | `outbound-message.service.ts:372-381,402-410,456-460,489+` |
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | diferença é 1 string de fixture de erro 400 mockado (`special_agent` na lista do enum); nenhum contrato real | `:145-150` |
| `supabase/schema-manifest.json` | artefato gerado; a main tem as 4 policies de `message_reactions` com hash mais novo e mais tabelas | `supabase/schema-manifest.json:4625-4628` na main |
| `ESTADO.md` / `docs/talkx/ARQUITETURA.md` | docs da branch estão **desatualizados** frente à main (ex.: a branch afirma que `TalkXCampaignReport.tsx` não existe; existe em `report/` e está ligado) | `origin/main:docs/talkx/ARQUITETURA.md:7,92`; `origin/main:ESTADO.md:43,98,116,119` |

## Lacunas a recuperar
Nenhuma. Nada a portar: em todos os 27 arquivos a main está igual ou à frente. Dois hunks da branch
seriam **regressão de segurança/consistência** se portados:
1. `src/services/outbound-message.service.ts` — `pertenceAoUsuarioAtual` devolvendo `true` para item sem dono
   (a fila offline de um atendente sairia pela sessão de outro).
2. `src/lib/authenticatedUserId.ts` — varredura de qualquer `sb-*-auth-token` no mesmo origin.
E um seria contra a regra vigente: `WhatsAppTemplatesManager` admin-only, contra a RLS `is_admin_or_supervisor`.

## Branch
`apagar_branch_seguro: true` — prova por arquivo acima para os 27; os outros 135 têm prova mecânica
(`PRESENT_BYTE` / `PRESENT_REVERSE_APPLIES`). A migration `20261026210000_dashboard_kpi_periodo_aditivo.sql`
é `IDENTICAL_TO_MAIN`.

## Verificação adversarial

Papel: refutar o veredito OBSOLETA. Resultado: **não refutado — concordo com OBSOLETA**. `origin/main` em `dac285f62`. Varri os 27 arquivos com lacuna do JSON; nenhum hunk de valor >= médio ficou fora da main.

Provas (leitura direta da main, não do relatório):
- Fix titular presente: `origin/main:src/components/settings/SettingsView.tsx:74` desestrutura `isSaving, updateSettings, saveAppearanceSettings` e `:225` passa `isSaving={isSaving} onSave={saveAppearanceSettings}` ao `AppearanceSettings`. A branch passava o `saveSettings` global; a main tem escrita dedicada.
- `MediaMigrationTool`: todo o bloco "faltante" (CDN_TEMP_PREFIXES, MIGRATION_ACTION, HISTORY_LIMIT, MigrationHistoryEntry, asCount, countPendingMedia, fetchMigrationHistory) existe em `origin/main:src/services/mediaMigration.service.ts:1-60`, idêntico em comportamento.
- `useTalkXSegments`: a falha fechada da ponte Singu está na main com outro nome — `ponteOnly` em `:80-81`, `if (def.ponteOnly) return null` em `ruleToFilter:209`, `assertNoPonteOnlyFields:275-290` chamada em `countAudience` e `resolveAudience`. `lead_origin` comingSoon em `:90`. Cobre `BRIDGE_FIELDS/assertNoBridgeFields` da branch.
- `TalkXSegments.tsx`: diff arquivo-a-arquivo (branch 839 linhas vs main 800) mostra a main como iteração POSTERIOR (X115): `viewMode` em state local + botões `segments-view-list`/`segments-view-grid` (:460-470), `selectedSegment` com `updated_at` mais novo (:88-95), `closePanel` + Esc (:96-106), abas da tela 03 renderizadas (:386-393), filtros no endereço (`parseSegmentLibraryFilters`, `syncSegmentLibraryUrl`), filtro de proprietário e `SEGMENT_LIBRARY_OWNER_NONE`. Os 161 "faltantes" são a versão anterior da mesma tela.
- `WhatsAppTemplatesManager`: a branch fecharia escrita para admin; a main usa `const { isSupervisor: canWrite } = useUserRole()` (:39) em todos os controles (:58,60,66,101,138-141), alinhado à RLS. Portar a branch seria regressão de permissão.
- `outbound-message.service` + `authenticatedUserId`: a main é MAIS restritiva — `pertenceAoUsuarioAtual` devolve `false` para item sem dono (branch: `true`) e `enqueueOffline` lança "Sessão expirada" sem sessão legível; `authenticatedUserId.ts` só aceita `configuredSessionKey()` derivada de `SUPABASE_URL` (a branch varria qualquer `sb-*-auth-token`). Portar = regressão de segurança.
- `phone-input`: os 3 ajustes da branch estão na main — `rest.length === 8 && !rest.startsWith('9')` (:19), `return \`+${digits}\`` (:27) e guarda de internacional explícito muito mais completa (`isExplicitInternationalRef`, paste/drop, :36-110).
- Demais lacunas pequenas, todas na main: `useAgentCelebrations` (Date.parse + `TOLERANCIA_RELOGIO_MS`, :189-190), `useSentimentData` (`incomplete` real em state, :93 e :234), `useTeamChatNotifications` (`tag`+`onClick` navegando com `cid`, :243), `useInboxFilters` (contactType da URL/prefs, :107-119), `TalkXView` (`'paused'` e também `'report'` no `TalkXTopView`, :66,187-191,422-428), `InboxEmptyChat` (`<kbd>` :120-122), `AuditLogDashboard` (`stat.hint` :113-125), `ESTADO.md` (:43,98,119), `docs/talkx/ARQUITETURA.md` (:7,92).
- `supabase/schema-manifest.json`: a main tem as MESMAS 4 chaves de policy de `message_reactions` (:4625-4628) com hash mais novo — snapshot gerado, a branch só tem hash velho.
- Testes: `ChatMessagesArea.pagination` (clientHeight 600 / offsetHeight 120 na main, :60,68), `team-chat-notifications-mount` (mocks equivalentes), `ContactDetails.quickActions` (a main usa a RPC em lote `set_conversations_status`, :171,180 — ambas as RPCs existem em produção, conferido por `pg_proc`), `useInboxBulkActions` (a main decidiu desfazer para `'open'`, com comentário em :609 — reversão deliberada, não perda), `useAdminDataCreateUser` (a branch esperava `special_agent`; `enum_range(null::app_role)` em produção devolve só `admin`, `supervisor`, `agent` — a expectativa da branch é que está errada).
- Dois arquivos da branch não existem na main (`src/hooks/gamification/__tests__/mutations.test.tsx`, `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts`): a própria branch os APAGOU (diff: -283 e -371 linhas) e a main os apagou depois em `e1f2ee4dd` ("destrava o CI Gate da main"). Mesmo resultado, nada perdido.
- PR #2263 está `closed`/`merged_at: null`, `mergeable_state: dirty`. Nenhuma PR aberta depende da ref → apagar a branch é seguro.
