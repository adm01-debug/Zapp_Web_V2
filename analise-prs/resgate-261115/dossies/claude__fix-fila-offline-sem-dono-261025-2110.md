# Dossiê — `claude/fix-fila-offline-sem-dono-261025-2110` (PR #2267)

- `merge_base` 2d97c44 (24/10) · `tip` e84afb8 (25/10) · 101 commits · 175 arquivos
- Pré-classificação mecânica: MISTO_CONFLITO · 25 arquivos com lacuna · 335 linhas em lacuna
- **Veredito: INCORPORADA** · `apagar_branch_seguro: true` · confiança **alta**

## Propósito
Branch-coletora: além do fix que dá nome a ela (fila de envio offline não drena item sem dono
nem ressuscita após logout), carrega ~100 commits de correções de inbox, Talk X, admin,
segurança, a11y e testes acumulados entre 24 e 25/10.

## Núcleo da branch: byte-a-byte na main
| Arquivo | Prova |
|---|---|
| `src/lib/offlineQueue.ts` | blob `16ad12a1def30757824f7d57d6b837cdb6a3e729` em `origin/main` **e** no tip |
| `src/lib/authenticatedUserId.ts` | blob `3026c4effe9740a75d5e7ec3655071a4b51ddcd6` nos dois |
| `src/hooks/system/__tests__/useOfflineSendQueueDrain.test.tsx` | blob `9e87095b145cb88204f6299178bb5adbc026a26b` nos dois |
| `supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql` | idêntico à main **e aplicado**: `supabase_migrations.schema_migrations` tem `20261026210000 / dashboard_kpi_periodo_aditivo` (produção, leitura) |

143 dos 175 arquivos já estão na main por prova mecânica (`PRESENT_BYTE` / `PRESENT_REVERSE_APPLIES`).

## As 25 lacunas, arquivo × achado × evidência

### Código de produto — mesma intenção, reescrita/renomeada na main
| Arquivo | Lacuna | Achado na main (evidência) |
|---|---|---|
| `src/hooks/integrations/useTalkXSegments.ts` | 15 linhas: `BRIDGE_FIELDS` / `isBridgeField` / `assertNoBridgeFields` (falha fechada em `real_sector`/`real_uf`) + `lead_origin comingSoon` | Mesma lógica com outro nome: `ponteOnly: true` em `origin/main:src/hooks/integrations/useTalkXSegments.ts:80-81`, `assertNoPonteOnlyFields` em `:280-287`, chamada em `countAudience:311` e `resolveAudience:333`, curto-circuito em `ruleToFilter:209`. `lead_origin ... comingSoon: true` em `:90`. Testes correspondentes em `__tests__/useTalkXSegments.test.ts:338-398` |
| `src/components/talkx/TalkXSegments.tsx` | 161 linhas: lista/grade (X112), painel Detalhes derivado por `updated_at` (X116), abas superiores da tela 03, Esc devolvendo foco | Tudo presente e **ampliado**: `viewMode` em `:57` + botões `segments-view-list/grid` em `:467-468`, grade em `:505`, `selectedSegment` por `updated_at` em `:86-94`, `closePanel` com `row?.focus()` em `:95-99`, Esc em `:100-106`, abas "Regras Avançadas/Audiências/Modelos/Insights com IA" em `:389-392`, "Detalhes do segmento" em `:767`. A main foi além: rota `?segment=&mode=`, gaveta TL-134, paginação por usuário (`useTalkXSegments.ts:725,822`) |
| `src/components/admin/MediaMigrationTool.tsx` | 49 linhas: `CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`, `countPendingMedia`, `fetchMigrationHistory` | Extraídas para `origin/main:src/services/mediaMigration.service.ts:3-5,20-39` e consumidas em `MediaMigrationTool.tsx:9,57,66,77,81`. O resto da branch está igual: `invokeEdge` em `:8,97`, `AlertDialog` em `:12-19,311`, `code` do erro em `:29,107,233-234` |
| `src/components/talkx/TalkXView.tsx` | 4 linhas: `'paused'` em `TalkXTopView`, `openPaused`, reset em `backToList` | Presentes e estendidas com `'report'`: `:66` (`... \| 'paused' \| 'report'`), `:112`, `:187`, `:191`, `:310`, `:314`, `:386-397`, `:422-428` |
| `src/components/inbox/MessageReactions.tsx` | 5 linhas que a branch removia ainda na main | Falso positivo de deps: a main implementa a troca "uma reação por autor" num hook próprio `useReacaoUnica` (`:17-20,40`) com remoção da antiga e **rollback** (`:79-101`) — superior ao `if (hasReacted) remove else add` da branch |
| `src/components/inbox/InboxEmptyChat.tsx` | 2 linhas de `<kbd>` | Presentes em `:109-122`; só o token mudou (`text-[11px]` → `text-2xs`). Ação "Nova conversa" em `:92` |
| `src/hooks/inbox/useInboxFilters.ts` | 1 linha: `normalizeContactType(searchParams.get('type'))` | `origin/main:src/hooks/inbox/useInboxFilters.ts:106-114` e `:168-177` (a main também sincroniza URL→prefs, que a branch não fazia). As 6 linhas "ainda na main" são de `readStoredPrefs`, não da função removida |
| `src/hooks/chat/useTeamChatNotifications.ts` | 1 linha: `{ tag: 'team-msg-...', onClick: navigateToView('team-chat') }` | `origin/main:src/hooks/chat/useTeamChatNotifications.ts:243`, com `{ cid: msg.conversation_id }` a mais |
| `src/hooks/gamification/useAgentCelebrations.ts` | 2 linhas: `marcoMontagem` + `Date.parse(earned_at) > marco` | `:169-174` e `:190`, com `TOLERANCIA_RELOGIO_MS` a mais |
| `src/components/security/AuditLogDashboard.tsx` | 1 linha: `<p>{stat.hint}</p>` | `:124-125` (token `text-2xs`); hook `useAuditLogDashboard` em `:11,70`; hints em `:113-114` |
| `src/components/dashboard/useSentimentData.ts` | 1 linha do `return` com `incomplete: false` | `:234` tem o mesmo `return`, com `incomplete` como estado real (`:93`) em vez do literal `false` da branch |
| `src/components/ui/phone-input.tsx` | 4 linhas: fixo sem '9' inicial, passthrough E.164, guarda do '+' | Fixo `rest.length === 8 && !rest.startsWith('9')` em `:19`; passthrough `return \`+${digits}\`` em `:27`. A guarda do '+' foi substituída por `isExplicitInternationalRef`/`wasExplicitPlusRef` (`:39-52,63-80`) — mais robusta |
| `src/components/settings/SettingsView.tsx` | 1 linha do destructuring | A remoção do botão global "Salvar Alterações" entrou: não há `actions=` no `PageShell` da main (`:105`); salvar migrou para Aparência (`saveAppearanceSettings` em `:74,225`) |

### Obsoletas — a main corrigiu de propósito, com prova em produção
| Arquivo | Lacuna | Prova de que a branch está errada |
|---|---|---|
| `src/components/catalog/WhatsAppTemplatesManager.tsx` | 10 linhas que restringiam criar/editar/duplicar/excluir a **admin** | A RLS real permite **supervisor**: `pg_policies` de `whatsapp_templates` em produção dá `ALL` / `INSERT` com `is_admin_or_supervisor(auth.uid())`. A main corrigiu deliberadamente — `2420d0a28 fix(templates): libera gestão a supervisores conforme RLS (#2334)` — e usa `isSupervisor: canWrite` em `:39,58,101`. Aplicar a branch **reintroduziria** o bloqueio indevido do supervisor |
| `src/components/admin/__tests__/useAdminDataCreateUser.test.ts` | 1 linha esperando `'special_agent'` no enum da mensagem | A edge não aceita esse valor: `origin/main:supabase/functions/create-user/index.ts:116` → `z.enum(["admin","supervisor","agent"])`. O texto da main (`:148`, sem `special_agent`) é o correto |
| `src/components/catalog/__tests__/WhatsAppTemplatesManager.confirmacaoExclusao.test.tsx` | 1 linha: mock `useUserRole: () => ({ isAdmin: true })` | A main mocka `{ isAdmin: true, isSupervisor: true }` (`:13`), coerente com o gate vigente |

### Testes — equivalentes já na main
| Arquivo | Achado |
|---|---|
| `src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx` | A main mede pela RPC evoluída `set_conversations_status` (plural, `p_contact_ids`) em `:171,180`; a branch usava a singular `set_conversation_status` |
| `src/components/inbox/chat/__tests__/ChatMessagesArea.pagination.test.tsx` | `clientHeight` em `:60` e `offsetHeight` em `:67-68` |
| `src/components/team-chat/__tests__/team-chat-notifications-mount.test.ts` | Mocks de `useAuth` (`:52-56`) e `ConversationEmptyState` (`:76`) |
| `src/hooks/inbox/__tests__/useInboxBulkActions.test.ts` | Restauração por `conversation_status` em `:179-190,571-575` |
| `src/components/integrations/__tests__/N8nIntegrationView.a11y.test.tsx` | A branch removia 79 linhas; a main já está com 56 linhas (enxuta) |
| `src/components/talkx/__tests__/TalkXView.route.test.tsx` | `running` (`:72`) e `paused` (`:73`) mockados; cenários em `:680-750` |

### Artefatos gerados — sem valor de recuperação
| Arquivo | Achado |
|---|---|
| `supabase/schema-manifest.json` | 3 hashes de policies de `message_reactions`. A main tem as 4 entradas com hashes mais novos (`:4625-4628`) e as policies existem em produção (`pg_policies`: `message_reactions_{select,insert,update,delete}_policy`). Arquivo regenerado por automação |
| `ESTADO.md` | 7 linhas do inventário de edges. A main tem as mesmas entradas com números de linha atualizados (`:43,65,67,81,96,98,119`) |
| `docs/talkx/ARQUITETURA.md` | 1 linha sobre `TalkXCampaignPaused` (TL-075). Presente e atualizada na main (`:7`, que já cita `?screen=report`; `:92`) |
| `src/__tests__/a11y/icon-buttons-baseline.json` | `missing_in_main: 0` e `removed_still_in_main: 0` — sem lacuna real |

## Conclusão
Nada de útil foi perdido. O fix que nomeia a branch e a migration estão na main e em produção;
as 25 lacunas se resolvem em três grupos — reescrita equivalente ou superior na main (13 arquivos
de produto + 6 de teste), correção deliberada contra a qual a branch regrediria (3 arquivos,
com prova na RLS de produção e no enum da edge) e artefatos gerados (4). A triagem anterior
(`JA_NA_MAIN`, 08/11) se confirma. **Nada a portar.**

## Verificação adversarial

Parecer: **CONCORDO** com a triagem. `INCORPORADA` · `apagar_branch_seguro: true`.
Postura adotada: refutar. Não trustei o `line_check` do JSON — refiz a varredura por conta própria.

### Varredura independente (não derivada do JSON)
Corpus de `origin/main` materializado (`git archive origin/main`, 8679 arquivos) e todas as linhas
adicionadas pela branch (`git diff -U0 2d97c44 e84afb8`, 3171 linhas únicas trimmed) comparadas contra
ele. Resultado: **221 linhas únicas ausentes de QUALQUER lugar da main**, em **21 arquivos** — todos
dentro das 25 lacunas já mapeadas. **Nenhum arquivo com lacuna fora da lista da triagem.** Distribuição:
140 `TalkXSegments.tsx` · 14 `useTalkXSegments.ts` · 9 `WhatsAppTemplatesManager.tsx` ·
9 `MediaMigrationTool.tsx` · 7 `ChatMessagesArea.pagination.test.tsx` · 7 `ESTADO.md` ·
6 `team-chat-notifications-mount.test.ts` · 6 `ContactDetails.quickActions.test.tsx` ·
4 `phone-input.tsx` · 4 `TalkXView.tsx` · 3 `schema-manifest.json` · 2 `useAgentCelebrations.ts` ·
2 `InboxEmptyChat.tsx` · 1 cada em `useInboxFilters.ts`, `useInboxBulkActions.test.ts`,
`useTeamChatNotifications.ts`, `SettingsView.tsx`, `AuditLogDashboard.tsx`, `useSentimentData.ts`,
`useAdminDataCreateUser.test.ts`, `docs/talkx/ARQUITETURA.md`.

### Lacuna maior (140 linhas) auditada linha a linha — não é perda
`TalkXSegments.tsx`: as 140 linhas são a **reescrita**, não função ausente. Cada comportamento tem par
na main, com outro nome/estrutura:
- `ViewModeToggle`/`SegmentGridCard` (nomes inexistentes na main) → `viewMode` em `origin/main:src/components/talkx/TalkXSegments.tsx:57`, botões `segments-view-list`/`segments-view-grid` em `:467-468`, grade em `:505`, `data-testid="segments-grid"` e `segment-card` presentes, com teste próprio `__tests__/TalkXSegments.viewMode.test.tsx`
- `ruleText()` (critério por extenso) → `:748` `nos últimos ${rule.value} dias` e `:749` `há mais de ${rule.value} dias`
- `ORIGIN_LONG` → `:763` `'Dados do CRM 360°, sincronizado' / 'Dados do ZAPP, em tempo real'`; pills de origem em `:509,543`
- painel X116 (frescor por `updated_at`, Esc devolvendo foco) → `:86-94`, `closePanel` + `row?.focus()` em `:95-99`, Esc em `:103`; testes `TalkXSegments.detailFresh.test.tsx` e `.detailPanel.test.tsx`
- `refreshLibrary`/↻ recontagem → `refreshEstimates` e `"Recontar público"` presentes; `"Principais critérios"`, `"Usar em campanha"`, `"Toda a base"` todos na main
- abas superiores → `:389-392`

### Alegações "OBSOLETA" conferidas na fonte da verdade (não no código)
- **`WhatsAppTemplatesManager.tsx`** — `pg_policies` em produção (`tnnnlkbymytvtqngbbqh`, leitura): `whatsapp_templates` tem `ALL` com `qual = is_admin_or_supervisor(auth.uid())` e `INSERT` com `with_check = is_admin_or_supervisor(auth.uid())`; `SELECT` = `true`. A main usa `const { isSupervisor: canWrite } = useUserRole()` (`:39`) e `useUserRole.ts:116` define `isSupervisor = roles.includes('supervisor') || roles.includes('admin')` — o gate da main é **exatamente** a RLS. Correção deliberada: `2420d0a28 fix(templates): libera gestão a supervisores conforme RLS (#2334)`. Portar as 9/10 linhas da branch **reintroduziria** o bloqueio indevido do supervisor. Confirmado OBSOLETA.
- **`useAdminDataCreateUser.test.ts`** — `origin/main:supabase/functions/create-user/index.ts:116` → `z.enum(["admin","supervisor","agent"])`. Nenhum `special_agent`. Confirmado OBSOLETA.
- **`useInboxBulkActions.test.ts`** — a main mudou de propósito: `:608-612` "'pending' é legado (fora de regras.md §4.1): o desfazer devolve a 'open'", e filtra por `conversation_status: 'archived'`. A asserção da branch (restaurar para `'pending'`) está contra a regra vigente. OBSOLETA, não perda.
- **`ContactDetails.quickActions.test.tsx`** — a main mede a RPC de lote `set_conversations_status` com `p_contact_ids` (`:171,180`) e o Desfazer devolve o **status anterior**, não um `'open'` fixo; a singular `set_conversation_status` da branch sobrevive só no `CloseConversationDialog.tsx:286`. A main é superior. OBSOLETA.

### Reescritas/extrações conferidas byte a byte
- `MediaMigrationTool.tsx`: `CDN_TEMP_PREFIXES`, `MIGRATION_ACTION`, `HISTORY_LIMIT`, `asCount`, `countPendingMedia`, `fetchMigrationHistory`, `MigrationHistoryEntry` estão em `origin/main:src/services/mediaMigration.service.ts:3-5,16-39` com corpo idêntico, importados em `MediaMigrationTool.tsx:9-10` e usados em `:57,66,77,81`. As 9 linhas "ausentes" são as assinaturas + 5 comentários.
- `useTalkXSegments.ts`: `BRIDGE_FIELDS`/`isBridgeField`/`assertNoBridgeFields` ↔ `ponteOnly: true` (`:80-81`), `assertNoPonteOnlyFields` (`:280-287`), chamadas em `countAudience:311` e `resolveAudience:333`, curto-circuito em `ruleToFilter:209`. Mesma falha fechada, mesmos call sites. `lead_origin ... comingSoon: true` em `:90`.
- `phone-input.tsx`: a única linha de código (não comentário) é a guarda `!e.target.value.startsWith('+')`. A main a substituiu por `isExplicitInternationalRef`/`wasExplicitPlusRef` (`:38-52,63-110`), que cobre o `'+'` **e** paste/drop/deleção/`historyUndo` — estritamente mais abrangente. O arquivo de teste `src/components/ui/__tests__/phone-input.test.tsx` é **byte-idêntico** entre branch e main, isto é: a main passa nas mesmas asserções que a branch escreveu.
- `ChatMessagesArea.pagination.test.tsx`: `clientHeight` em `:60` (em `Element.prototype`, mais amplo que o `HTMLElement.prototype` da branch) e `offsetHeight` em `:68`.
- `team-chat-notifications-mount.test.ts`: main mocka `useAuth` (`:55-56`), `useGlobalIncomingMessageAlerts` (`:58-59`) e `ConversationEmptyState` (`:76`); as asserções (`h.listener` chamado 1×) não dependem do `profile.id` que a branch usava. Equivalente.
- Demais 1–2 linhas (`TalkXView` `'paused'` em `:66,187,191,310,314,386,422` + `'report'` a mais; `useInboxFilters` `normalizeContactType` em `:108,168`; `useTeamChatNotifications` tag+onClick em `:243` com `cid` a mais; `useAgentCelebrations` `marcoMontagem` em `:174` + `TOLERANCIA_RELOGIO_MS`; `AuditLogDashboard` `stat.hint` em `:124-125`; `useSentimentData` `incomplete` como estado real em `:93,234`; `SettingsView` destructuring em `:74` com `isSaving`/`saveAppearanceSettings`; `InboxEmptyChat` `<kbd>` em `:120-122`): **todas presentes, nenhuma inferior**.

### Artefatos gerados
- `ESTADO.md`: as 7 entradas de edge existem na main com números de linha atualizados (`:43,65,67,81,96,98,119`). Regenerado por automação.
- `supabase/schema-manifest.json`: main tem as 4 policies de `message_reactions` com hashes mais novos (`:4625-4628`); produção tem `message_reactions_{select,insert,update,delete}_policy` (`pg_policies`, 5 linhas com a legada de SELECT). Artefato.
- `docs/talkx/ARQUITETURA.md`: a linha do TL-075 está na main em `:7` (já citando `?screen=report`) e `:92`.

### Núcleo e produção reconferidos por conta própria
Blobs idênticos em `origin/main` e no tip `e84afb8`: `src/lib/offlineQueue.ts` `16ad12a1…`,
`src/lib/authenticatedUserId.ts` `3026c4ef…`, `src/hooks/system/__tests__/useOfflineSendQueueDrain.test.tsx`
`9e87095b…`, `supabase/migrations/20261026210000_dashboard_kpi_periodo_aditivo.sql` `b394f5f8…`.
Migration aplicada: `select version, name from supabase_migrations.schema_migrations where version='20261026210000'`
→ `20261026210000 / dashboard_kpi_periodo_aditivo`.

### Correção ao JSON do item (não altera o veredito)
O `line_check` marcou como `IDENTICAL_TO_MAIN` / `PRESENT_BYTE` dois arquivos que **não existem** em
`origin/main` (varredura `git cat-file -e origin/main:<path>` sobre os 175 arquivos do diff):
- `src/hooks/gamification/__tests__/mutations.test.tsx`
- `src/hooks/integrations/__tests__/useTalkXSuppression.test.ts`

Não é trabalho perdido: foram **removidos de propósito** da main —
`4c54c4563 test: remove teste obsoleto de mutations e o hook morto useTalkXSuppression`,
`d1e81f9ae fix: remove teste obsoleto de mutations.ts — gamificação é só leitura no cliente (lote F1a)`,
`e1f2ee4dd fix(test): destrava o CI Gate da main (136 → 0 arquivos vermelhos)`.
A main tem o substituto renomeado `src/hooks/integrations/__tests__/useTalkXSuppression.test.tsx` mais
`useTalkXSuppression.hook-morto.test.ts`. Restaurá-los re-quebraria o CI Gate. A classificação mecânica
estava errada; o veredito ("não portar") está certo.

### Veredito
Nenhum hunk de valor ≥ médio fora da main. **INCORPORADA · branch pode ser apagada.**
