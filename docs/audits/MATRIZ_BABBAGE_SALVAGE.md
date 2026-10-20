# Matriz de Salvage — branch `claude/confident-babbage-ivgmmn` (Team Chat V2)

**Tipo:** documento de auditoria (docs-only). Nenhuma migration, policy, RPC, componente ou hook é alterado por este arquivo.
**Objeto:** branch abandonada `claude/confident-babbage-ivgmmn` (tip `0e283d06`, 29/09/2026) e sua relação com a `main` de hoje (`d7af7a671c`, 20/10/2026).
**Sucede:** `docs/audits/AUDITORIA_TEAM_CHAT_REMEDIACAO_2026-09-29.md` e `docs/audits/PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` (ambos existem **somente** no branch; ver §4.2).
**Data:** 2026-10-20. **Base medida:** `main` @ `d7af7a671c`.

---

## 0. Sumário executivo

1. **O branch não tem meia-implementação a recuperar: ele tem um plano e um esqueleto. As duas metades já foram resolvidas fora dele.**
   - **Metade banco (DDL):** as 40 migrations do branch (`20260928420000 … 20260929440000`) **já existem na `main`** — porém não como os arquivos do branch, e sim como cópias com cabeçalho **"Recuperada do ledger … aplicada em producao sem arquivo no repositorio (DDL fora do Git)"**, gravadas em `main` a partir do ledger `supabase_migrations`. Ou seja: o DDL foi aplicado em produção por fora do Git e depois **reconciliado para a main**. As 40 versões do branch são rascunhos autorais, superados.
   - **Metade front:** a `main` evoluiu por caminho próprio e já consome as RPCs do plano (`get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `transfer_team_conversation_department`), já tem badge Teams (PE-31), listener global (TC-007), fábrica de queryKeys (SL-081/F52), view de leitura (N-070) e presença etc.
2. **A ponta do branch NÃO compila.** `TeamChatView.tsx` importa `./TeamChatSidebar` e `./NewGroupDialog`, que não existem no branch (não estão entre os 87 arquivos do diff). Há ainda 26 erros de `tsc` e 28 testes `vitest` falhando na ponta. Nada do branch pode ser mergeado como está.
3. **Saldo de salvage: 4 etapas com artefato portável + 3 documentos.** De 100 etapas do plano, **69 já estão satisfeitas na `main`** (por caminho próprio) e **4 têm artefato isolado que vale portar** (§5). O restante é processo/histórico ou ausente nos dois lados.
4. **Os 87 arquivos se classificam em:** 0 idênticos à `main`, 77 com conteúdo diferente, 10 inexistentes na `main`. Dos 87, **40 são migrations já canônicas na `main`** e **33 são arquivos que a `main` já evoluiu por caminho próprio** — nenhum deles precisa ser portado do branch.

---

## 1. Identificação e reprodução

| Item | Valor |
|---|---|
| Repo | `adm01-debug/Zapp_Web_V2` |
| Branch alvo | `claude/confident-babbage-ivgmmn` |
| Tip do branch | `0e283d06850a67739beee9cc623530619d9b2cad` (29/09/2026) |
| Posição | 37 commits à frente / 804 atrás da `main` |
| Merge-base | `0063e2aa76954498ab9344b35f874bca6b18d1d7` |
| `main` medida | `d7af7a671c` (20/10/2026) |
| PR histórica | #1151 — **fechada sem merge** em 29/09/2026 |
| Arquivos no diff do branch (vs merge-base) | **87** |
| vs `main` | 0 idênticos · 77 diferentes · 10 inexistentes na `main` |

Comandos de reprodução (WSL, a partir de um worktree de `origin/main`):

```bash
git diff --name-status 0063e2aa76954498ab9344b35f874bca6b18d1d7 origin/claude/confident-babbage-ivgmmn   # 87 arquivos
# status de cada um contra a main:
while IFS=$'\t' read -r st p; do
  git cat-file -e origin/main:"$p" 2>/dev/null || { echo "AUSENTE_NA_MAIN $p"; continue; }
  [ "$(git rev-parse origin/main:"$p")" = "$(git rev-parse origin/claude/confident-babbage-ivgmmn:"$p")" ] \
    && echo "IDENTICO $p" || echo "DIFERENTE $p"
done < <(git diff --name-status <merge-base> origin/claude/confident-babbage-ivgmmn)
# resultado: 10 AUSENTE_NA_MAIN · 77 DIFERENTE · 0 IDENTICO
```

---

## 2. Fatos de partida (medidos nesta sessão)

| # | Fato verificado | Como foi medido |
|---|---|---|
| F1 | 40 migrations `team_chat` de versões `20260928{420000..580000}` e `20260929{160000..440000}` existem em `origin/main` **com cabeçalho "Recuperada do ledger"** (SQL idêntico ao aplicado em produção fora do Git) | `git ls-tree origin/main supabase/migrations/` + `grep "Recuperada do ledger"` nos 40 arquivos |
| F2 | As mesmas 40 versões estão aplicadas em produção (ledger) — metade banco do branch já consumida | ledger do projeto `tnnnlkbymytvtqngbbqh` (dado estabelecido; 40 versions `202609*2*` registradas) |
| F3 | RPCs do plano presentes em migrations da `main`: `current_profile_id`, `get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `transfer_team_conversation_department`, `leave_team_group`, `remove_team_member`, `accept_department_invite`, `create_department_invite` | `grep -rl "FUNCTION public.<rpc>" supabase/migrations` |
| F4 | RPCs do plano **ausentes** na `main`: `set_profile_department` (E84), `notify_team_mentions` (E89) | idem — 0 arquivos |
| F5 | `main` já consome as RPCs no front: `supabase.rpc('get_team_inbox')` em `useTeamConversations.ts`, além de uso de `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `transfer_team_conversation_department` | `grep -rn` em `src/` |
| F6 | `TeamChatNotificationsListener` existe e está **montado** em `src/App.tsx` (linhas 47-49, 100) → TC-007 resolvido na `main` | `grep -n` em `src/App.tsx` |
| F7 | Badge "Teams" na `Sidebar` (`teamsBadge`, PE-31) + `useTeamUnreadTotal` presente na `main` | `grep -n` em `Sidebar.tsx`; `grep -rl useTeamUnreadTotal src/` (5 arquivos) |
| F8 | `queryKeys.ts` da `main` é fábrica **superset** (inbox, messages, readState, reactions, members, memberProfile, performance, participantStats, departments.*) — SL-081/F52 | leitura de `src/hooks/team-chat/queryKeys.ts` |
| F9 | `useTeamReadState.ts` e `useTeamUnreadTotal.ts` **existem** na `main` (versões próprias, N-070 / PE-31) | `git cat-file -e origin/main:<path>` |
| F10 | Arquivos presentes **só** no branch (ausentes na `main`): 10 (§4.2) | F1: comparação path-a-path |
| F11 | Arquivos do branch **deletados** na ponta (0 linhas no tip) e ausentes na `main`: `src/hooks/team-chat/useTeamChatNotifications.ts`, `src/hooks/team-chat/useTeamUnreadCount.ts` | `git show <branch>:<path> | wc -l` = 0 |
| F12 | A ponta do branch não compila: `[UNRESOLVED_IMPORT] './TeamChatSidebar'` e `'./NewGroupDialog'` em `TeamChatView.tsx`; 26 erros `tsc`; 28 testes `vitest` falhando | dado estabelecido (auditoria de 29/09 + fixação do tip) |
| F13 | Artefatos de processo da Fase 0/9: `scripts/ci/team-chat-local-gates.sh` e `e2e/team-chat.spec.ts` **existem na `main`**; `docs/audits/team-chat-baseline-*`, `scripts/db-audit/team-chat-rls.sql`, `scripts/db-audit/team-chat-snapshot.mjs`, `e2e/fixtures/team-chat.ts` **não existem** na `main` | teste de existência no worktree |
| F14 | `department_invites` ainda é referenciada na `main` (`types.ts`, `useDepartmentManagement.ts`, migrations) e **não há `DROP TABLE department_invites`** em nenhuma migration → E80 não executada | `grep -rl` + `grep -rl "DROP TABLE.*department_invites"` |
| F15 | E84 `set_profile_department`, E89 `notify_team_mentions`, E90 `notificationclick` e "Entrar via Código" **ausentes nos dois lados** (main e branch) | `grep -rl` em `src/`, `public/`, `supabase/` (main) e `git grep` no branch |

---

## 3. Matriz E01–E100 (plano de 29/09 × main de hoje)

**Legenda do veredito:**
- 🟢 `OK_M` — entregável da etapa **já existe/verificado na main de hoje** (por caminho próprio, não pelo branch).
- 🔵 `PORT` — entregável **ausente na main** e existe artefato isolado no branch que vale portar (§5).
- 🟡 `DIV` — arquivo/etapa existe na main com **conteúdo próprio** (evolutivo); a versão do branch é anterior/superada. Nada a portar.
- ⚪ `DESC` — nada a salvar em nenhum dos lados (processo/histórico ou ausente nos dois).
- `A:` = aplicado ao vivo em produção (todas as etapas DDL: **sim**, via reconcilição fora do Git).

### Fase 0 — Limpeza, identidade e baseline (E01–E08)
| Etapa | Veredito | Evidência |
|---|---|---|
| E01 sanear PR #1151 (docs-only) | ⚪ DESC | PR #1151 **fechada sem merge**; a limpeza já foi consumada pela reconciliação das 40 migrations na `main` |
| E02 `current_profile_id()` | 🟢 OK_M | migration `20260928420000` "Recuperada do ledger" na `main`; RPC presente (F3) |
| E03 snapshot baseline + `team-chat-snapshot.mjs` | ⚪ DESC | `docs/audits/team-chat-baseline-*` e `team-chat-snapshot.mjs` **não existem** na `main` nem no branch (F13) |
| E04 decisões registradas (seção 10) | ⚪ DESC | seção 10 do plano segue como "(preencher na E04)" — nunca preenchida nos dois lados |
| E05 teste de contrato RLS (`team-chat-rls.sql` + job) | ⚪ DESC | `scripts/db-audit/team-chat-rls.sql` inexistente na `main`; branch não trouxe |
| E06 fixtures E2E (`e2e/fixtures/team-chat.ts`) | ⚪ DESC | inexistente na `main`; branch não trouxe |
| E07 `scripts/ci/team-chat-local-gates.sh` | 🟢 OK_M | arquivo **existe na `main`** (F13) |
| E08 mapa de PRs (seção 11) | ⚪ DESC | seção 11 do plano toda em `—`; nunca preenchida |

### Fase 1 — Segurança do banco (E09–E24) — 1 PR de DDL, 15 migrations
| Etapa | Veredito | Evidência |
|---|---|---|
| E09 revoke TRUNCATE/TRIGGER/REFERENCES | 🟢 OK_M | `20260928450000` "Recuperada do ledger" na `main` + aplicada (F1) |
| E10 revoke ALL de anon | 🟢 OK_M | `20260928460000` idem |
| E11 privilégios por coluna em `team_messages` | 🟢 OK_M | `20260928470000` idem |
| E12 policy UPDATE `team_messages` | 🟢 OK_M | `20260928480000` idem |
| E13 hardening de receipts | 🟢 OK_M | `20260928490000` idem |
| E14 schema de `department_invitations` | 🟢 OK_M | `20260928500000` idem |
| E15 `accept_department_invite` sobre invitations | 🟢 OK_M | `20260928510000` idem |
| E16 `create_department_invite` | 🟢 OK_M | `20260928520000` idem |
| E17 hardening de `department_audit_logs` | 🟢 OK_M | `20260928530000` idem |
| E18 `departments.whatsapp_config` | 🟢 OK_M | `20260928540000` idem (+ `20261006213734_f10_...whatsapp_safe_config`) |
| E19 RPC de credenciais WhatsApp | 🟢 OK_M | `20260928550000` idem |
| E20 storage `team-chat-files` | 🟢 OK_M | `20260928560000` idem (+ `20261011010002_...bucket_limits_e_team_chat_files_identidade`) |
| E21 policy UPDATE `team_conversations` | 🟢 OK_M | `20260928570000` idem |
| E22 policies `team_conversation_members` | 🟢 OK_M | `20260928580000` idem |
| E23 6 policies `roles={public}` → authenticated | 🟢 OK_M | objeto conferido ao vivo (anon_grants=0, roles={public}=0) + migrations de scope |
| E24 fechamento A′ | 🟢 OK_M | DDL aplicada e reconciliada (F1/F2) |

### Fase 2 — Integridade (E25–E36) — 1 PR de DDL, 11 migrations
| Etapa | Veredito | Evidência |
|---|---|---|
| E25 CHECK `media_type`/`content` | 🟢 OK_M | `20260928600000` "Recuperada do ledger" |
| E26 CHECK coerência de mídia | 🟢 OK_M | `20260929160000` idem |
| E27 reply mesma conversa | 🟢 OK_M | `20260929170000` idem |
| E28 trigger de edição / 48h | 🟢 OK_M | `20260929180000` idem |
| E29 CHECK de `team_conversations` | 🟢 OK_M | `20260929190000` idem |
| E30 unique de depto + CASCADE | 🟢 OK_M | `20260929200000` idem |
| E31 CHECK/índice de members | 🟢 OK_M | `20260929210000` idem |
| E32 hardening de reactions | 🟢 OK_M | `20260929220000` idem (+ `20261006222024_...conversation_id_forced`) |
| E33 CHECKs de receipts | 🟢 OK_M | `20260929230000` idem |
| E34 espelho metadata/publication | 🟢 OK_M | `20260929240000` idem |
| E35 `COMMENT ON` | 🟢 OK_M | `20260929250000` idem |
| E36 fechamento B′ | ⚪ DESC | artefato de processo (diff-bloco-B.md); nada a salvar |

### Fase 3 — RPCs e performance (E37–E50) — 1 PR de DDL
| Etapa | Veredito | Evidência |
|---|---|---|
| E37 `get_team_inbox` | 🟢 OK_M | migration + `src/` consome (F3/F5) |
| E38 índice keyset `(conversation_id, created_at DESC, id DESC)` | 🟢 OK_M | `20260929270000` + `20261010064729_...cursor_tiebreak_and_min_limit` |
| E39 `get_team_messages_page` | 🟢 OK_M | migration + consumo (F3/F5) |
| E40 `mark_team_conversation_read` | 🟢 OK_M | `20260929280000` + consumo (F3/F5) |
| E41 view `team_message_read_state` | 🟢 OK_M | `20261009214931_team_message_read_state_view` |
| E42 `search_team_messages` | 🟢 OK_M | migration + consumo (F3/F5) |
| E43 `toggle_team_reaction` | 🟢 OK_M | migration + consumo (F3/F5) |
| E44 `set_team_member_pref` | 🟢 OK_M | migration + consumo (F3/F5) |
| E45 `transfer_team_conversation_department` | 🟢 OK_M | migration + consumo (F3/F5) |
| E46 `leave_team_group`/`remove_team_member` c/ promoção do último owner | 🟢 OK_M | `20260929430000` (+ `20261006170426_fix_member_role_leave_remove_rpcs`) |
| E47 `REPLICA IDENTITY` | 🟢 OK_M | `20260929410000` (agrupada e47/e48/e49) |
| E48 comentar RPCs deprecadas | 🟢 OK_M | `20260929410000` |
| E49 limpeza de índices duplicados | 🟢 OK_M | `20260929410000` |
| E50 fechamento C′ | ⚪ DESC | artefato de processo; nada a salvar |

### Fase 4 — Realtime + apply (E51–E54)
| Etapa | Veredito | Evidência |
|---|---|---|
| E51 `team_message_receipts.conversation_id` | 🟢 OK_M | `20260929440000` "Recuperada do ledger" + `20261006222024_...conversation_id_forced`; coluna existe ao vivo |
| E52 decisão de publication registrada | 🔵 PORT | `docs/team-chat/realtime-publication-decision.md` existe **só no branch**; decisão ausente na `main` |
| E53 README dos hooks reescrito | 🟢 OK_M | `main` tem `src/hooks/team-chat/README.md` próprio (conteúdo divergente, evolutivo) |
| E54 `types.ts` com as 6 RPCs | 🟢 OK_M | `main` consome as RPCs (F5); `types.ts` regenerado por `types-sync` |

### Fase 5 — Camada de dados do front (E55–E66)
| Etapa | Veredito | Evidência |
|---|---|---|
| E55 `queryKeys.ts` | 🟢 OK_M | `main` tem fábrica superset (F8, SL-081/F52) |
| E56 `teamChatTypes.ts` derivado de `types.ts` | 🟢 OK_M | arquivo existe na `main` (DIFERENTE) |
| E57 `useTeamConversations` via `get_team_inbox` | 🟢 OK_M | `main` chama `rpc('get_team_inbox')` (F5, SL-016/F53) |
| E58 `useTeamMessages` com `useInfiniteQuery` | 🟢 OK_M | `main` usa `get_team_messages_page` |
| E59 `useMarkConversationRead` | 🟢 OK_M | `main` chama `mark_team_conversation_read` (5 refs). *Arquivo `useMarkConversationRead.ts` em si é ausente na main → ver §5 (portável).* |
| E60 `uploadTeamMedia` em `<uid>/<cid>/` | 🟢 OK_M | `main` usa `media_path` (18 refs) + `uploadTeamMedia` (11 refs) |
| E61 `useResolvedStorageUrl` | 🔵 PORT | ausente na `main`; branch tem helper limpo via `useQuery` + `createSignedUrl` |
| E62 `useTeamChatMutations` | 🟢 OK_M | arquivo existe na `main` (DIFERENTE) |
| E63 `useTeamMessageReactions` (só realtime) | 🟢 OK_M | arquivo existe na `main` |
| E64 `useTeamReadState` sobre a view | 🟢 OK_M | `main` tem `useTeamReadState.ts` próprio (F9, N-070) |
| E65 tipos de `member_role` | 🟢 OK_M | `teamChatTypes.ts` na `main` |
| E66 rascunhos (apagar órfão) | 🟢 OK_M | `main` não tem `useTeamDraft` órfão (0 refs) |

### Fase 6 — Componentes e UX (E67–E78)
| Etapa | Veredito | Evidência |
|---|---|---|
| E67 `TeamChatPanel` < 200 linhas | 🟢 OK_M | `TeamChatPanel.tsx` na `main` = 194 linhas |
| E68 `TeamMessageItem` tokens de bolha | 🟡 DIV | arquivo existe na `main` (conteúdo próprio); branch **não tocou** `src/components/team-chat` |
| E69 header ligado (6 ações) | 🟡 DIV | idem — main tem versão própria |
| E70 tokens no módulo (zerar cores fixas) | 🟡 DIV | ainda 9 arquivos com `bg-black|bg-card|bg-background` na `main` → **não concluído nos dois lados** |
| E71 scroll/paginação | 🟢 OK_M | `onNearTop`/`fetchNextPage` presentes em `src/components/team-chat` |
| E72 busca server-side | 🟢 OK_M | `search_team_messages` usada em 4 componentes |
| E73 `TeamConversationList` | 🟡 DIV | arquivo existe na `main`; branch não trouxe |
| E74 `GroupManagementDialog` ligado | 🟡 DIV | arquivo existe na `main`; branch não trouxe |
| E75 `TransferConversationDialog` reescrito | 🟡 DIV | arquivo existe na `main`; branch não trouxe |
| E76 presença real (`useAgentPresenceMap`) | 🔵 PORT | `useAgentPresenceMap.ts` existe **só no branch**; `main` não tem o arquivo |
| E77 TTS persistido | 🟡 DIV | arquivo existe na `main`; branch não trouxe |
| E78 estatísticas ligadas | 🟢 OK_M | `ParticipantStatsGraph` tem consumidor na `main` |

### Fase 7 — Departamentos (E79–E85)
| Etapa | Veredito | Evidência |
|---|---|---|
| E79 `useDepartmentManagement` via `create/accept_department_invite` | 🟢 OK_M | fluxo de convite existe na `main`; RPCs vivas (F3) |
| E80 `DROP TABLE department_invites` | ⚪ DESC | **não feito** na `main` (F14) nem no branch → tarefa pendente |
| E81 WhatsApp de depto via RPC | 🟢 OK_M | `set_department_whatsapp_config` + f10 na `main` |
| E82 `DepartmentAuditView`/`DepartmentInvitesView` | 🟢 OK_M | views existem na `main` |
| E83 "Entrar via Código" | ⚪ DESC | ausentes nos dois lados (F15): sem `useRedeemDepartmentInvite`, sem "Entrar via Código" |
| E84 `set_profile_department` | ⚪ DESC | 0 arquivos nos dois lados (F4/F15) |
| E85 `isChannelMember` para admin | 🟢 OK_M | `isChannelMember` presente na `main` |

### Fase 8 — Notificações, presença e digitação (E86–E91)
| Etapa | Veredito | Evidência |
|---|---|---|
| E86 badge "Teams" via `useTeamUnreadTotal` | 🟢 OK_M | `main` tem `useTeamUnreadTotal` + `teamsBadge` na Sidebar (F7, PE-31) |
| E87 listener global em AppShell | 🟢 OK_M | `TeamChatNotificationsListener` montado em `App.tsx` (F6, TC-007) |
| E88 "Digitando…" | 🟢 OK_M | `useTeamTyping` presente na `main` (3 refs) |
| E89 menções (`notify_team_mentions`) | ⚪ DESC | RPC ausente nos dois lados (F4/F15); só a UI `MentionAutocomplete` existe na `main` |
| E90 push → conversa (`notificationclick`) | 🔵 PORT | `notificationclick` ausente na `main`; o branch traz a lógica **click → `?view=team-chat&cid=`** dentro de `useTeamGlobalNotifications.ts` |
| E91 realtime hardening (`removeChannel`) | 🟢 OK_M | `removeChannel` em 19 arquivos de `src/hooks/team-chat` |

### Fase 9 — Testes, faxina e fechamento (E92–E100)
| Etapa | Veredito | Evidência |
|---|---|---|
| E92 testes de hooks | 🟡 DIV | `main` tem `src/hooks/team-chat/__tests__/` próprios; branch não executou E92 |
| E93 RTL de componentes | 🟡 DIV | não verificável de forma conclusiva; branch não executou |
| E94 faxina de órfãos | 🟡 DIV | parcial — `main` tem `team-chat-tokens.css` ainda |
| E95 zerar `eslint-baseline` do módulo | 🟡 DIV | `scripts/ci/eslint-baseline.json` ainda tem entradas `team-chat` na `main` → não concluído |
| E96 E2E `e2e/team-chat.spec.ts` | 🟢 OK_M | arquivo **existe na `main`** (F13) |
| E97 `pg_stat_statements` doc | ⚪ DESC | doc ausente nos dois lados; processo |
| E98 `DROP FUNCTION` das 2 RPCs antigas | 🟡 DIV | `get_team_unread_counts` e `get_team_conversation_previews` **ainda existem** na `main` → não feito |
| E99 teste funcional em produção | ⚪ DESC | processo; ausente nos dois lados |
| E100 encerramento / `CLAUDE.md` | 🟡 DIV | `CLAUDE.md` da `main` tem 1 menção a "Team Chat"; seção plena não montada |

**Contagem:** 🟢 `OK_M` = **69** · 🔵 `PORT` = **4** (E52, E61, E76, E90) · restante (27) = 🟡 `DIV` / ⚪ `DESC`.

---

## 4. Triagem arquivo-a-arquivo (87 arquivos)

Status contra a `main` (coluna 2): `AUS` = inexistente na `main`; `DIF` = existe com conteúdo diferente. Nenhum arquivo é `IDENTICO`.

### 4.1 — Migrations (40 arquivos) — veredito: **NÃO PORTAR (já canônico na `main`)**

Todas as 40 existem em `origin/main` com cabeçalho **"Recuperada do ledger (supabase_migrations) … DDL fora do Git; o SQL abaixo é idêntico ao registrado no ledger"**, e estão aplicadas em produção. As versões do branch são rascunhos autorais (cabeçalhos `-- E##`, sem bloco "estado antes/rollback") — **superados**. Aplicar as versões do branch seria reescrever objeto já reconciliado.

| Arquivo (versão do branch) | Status | Veredito |
|---|---|---|
| `supabase/migrations/20260928420000_team_chat_current_profile_id_helper.sql` | DIF | não portar — canônico na `main` (RECUP) |
| `...20260928430000_team_chat_fix_policies_to_authenticated.sql` | DIF | não portar — idem |
| `...20260928440000_team_chat_receipts_conversation_id.sql` | DIF | idem |
| `...20260928450000_team_chat_e09_revoke_ddl_privs.sql` | DIF | idem |
| `...20260928460000_team_chat_e10_revoke_all_anon.sql` | DIF | idem |
| `...20260928470000_team_chat_e11_column_privs_team_messages.sql` | DIF | idem |
| `...20260928480000_team_chat_e12_fix_update_policy_team_messages.sql` | DIF | idem |
| `...20260928490000_team_chat_e13_receipts_hardening.sql` | DIF | idem |
| `...20260928500000_team_chat_e14_department_invitations_schema.sql` | DIF | idem |
| `...20260928510000_team_chat_e15_accept_department_invite_rpc.sql` | DIF | idem |
| `...20260928520000_team_chat_e16_create_department_invite_rpc.sql` | DIF | idem |
| `...20260928530000_team_chat_e17_department_audit_logs_hardening.sql` | DIF | idem |
| `...20260928540000_team_chat_e18_departments_whatsapp_config.sql` | DIF | idem |
| `...20260928550000_team_chat_e19_department_whatsapp_cred_rpc.sql` | DIF | idem |
| `...20260928560000_team_chat_e20_storage_team_chat_files.sql` | DIF | idem |
| `...20260928570000_team_chat_e21_team_conversations_update_policy.sql` | DIF | idem |
| `...20260928580000_team_chat_e22_team_conversation_members_policies.sql` | DIF | idem |
| `...20260928600000_team_chat_e25_team_messages_integrity.sql` | DIF | idem |
| `...20260929160000_team_chat_e26_message_type_media_constraint.sql` | DIF | idem |
| `...20260929170000_team_chat_e27_reply_to_self_ref_check.sql` | DIF | idem |
| `...20260929180000_team_chat_e28_edit_guard_trigger.sql` | DIF | idem |
| `...20260929190000_team_chat_e29_conversations_constraints.sql` | DIF | idem |
| `...20260929200000_team_chat_e30_dept_conversation_constraints.sql` | DIF | idem |
| `...20260929210000_team_chat_e31_conversation_members_constraints.sql` | DIF | idem |
| `...20260929220000_team_chat_e32_reactions_hardening.sql` | DIF | idem |
| `...20260929230000_team_chat_e33_receipts_consistency_check.sql` | DIF | idem |
| `...20260929240000_team_chat_e34_drift_mirror_metadata_realtime.sql` | DIF | idem |
| `...20260929250000_team_chat_e35_comment_on_tables.sql` | DIF | idem |
| `...20260929260000_team_chat_e37_get_team_inbox_rpc.sql` | DIF | idem |
| `...20260929270000_team_chat_e38_get_team_messages_page_rpc.sql` | DIF | idem |
| `...20260929280000_team_chat_e39_mark_team_conversation_read_rpc.sql` | DIF | idem |
| `...20260929290000_team_chat_e40_search_team_messages_rpc.sql` | DIF | idem |
| `...20260929300000_team_chat_e41_toggle_team_reaction_rpc.sql` | DIF | idem |
| `...20260929310000_team_chat_e42_set_team_member_pref_rpc.sql` | DIF | idem |
| `...20260929320000_team_chat_e43_leave_team_group_rpc.sql` | DIF | idem |
| `...20260929330000_team_chat_e44_remove_team_member_rpc.sql` | DIF | idem |
| `...20260929400000_team_chat_e45_transfer_conversation_department_rpc.sql` | DIF | idem |
| `...20260929410000_team_chat_e47_e48_e49_replica_identity_deprecated_comments_drop_dup_indexes.sql` | DIF | idem |
| `...20260929430000_team_chat_e46_leave_remove_last_owner_promotion.sql` | DIF | idem |
| `...20260929440000_team_chat_e51_receipts_conversation_id_not_null_trigger.sql` | DIF | idem |

### 4.2 — Arquivos que existem **só** no branch (10) — a triagem decisiva

| Arquivo | Status | Veredito | Motivo |
|---|---|---|---|
| `docs/audits/AUDITORIA_TEAM_CHAT_REMEDIACAO_2026-09-29.md` | AUS | **PORTAR (doc)** | registro histórico da auditoria que fundamenta o plano; ausente na `main` |
| `docs/audits/PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` | AUS | **PORTAR (doc)** | o próprio plano de 100 etapas; ausente na `main` |
| `docs/team-chat/realtime-publication-decision.md` | AUS | **PORTAR (doc / E52)** | decisão de publication + nomenclatura de canais (E52) |
| `src/hooks/team-chat/useMarkConversationRead.ts` | AUS | **PORTAR (E59)** | hook limpo: `rpc('mark_team_conversation_read')` + invalida inbox; a `main` chama a RPC mas não tem este hook |
| `src/hooks/team-chat/useResolvedStorageUrl.ts` | AUS | **PORTAR (E61)** | helper limpo (`useQuery` + `createSignedUrl`, `staleTime` 50 min); versão já corrigida do erro de lint |
| `src/hooks/team-chat/useAgentPresenceMap.ts` | AUS | **PORTAR (E76)** | presença real via canal `presence`; `main` ainda usa `is_active` |
| `src/hooks/team-chat/useTeamGlobalNotifications.ts` | AUS | **PORTAR (avaliar / E87+E90)** | contém o único código de **click → conversa** (`?view=team-chat&cid=`) do repo; a `main` já tem TC-007 por outro arquivo, então portar só a parte de clique, se ainda fizer falta |
| `src/components/team-chat/department-management/DepartmentManagementDialog.tsx` | AUS | **PORTAR (avaliar)** | wrapper de 4 abas (Membros/Convites/WhatsApp/Auditoria) sobre views que já existem na `main`; a `main` não tem este arquivo — checar se já há outro wrapper antes de portar |
| `src/hooks/team-chat/useTeamChatNotifications.ts` | AUS | **NÃO PORTAR** | **deletado** na ponta do branch (0 linhas); a `main` resolve por `src/hooks/chat/useTeamChatNotifications.ts` + `TeamChatNotificationsListener` (TC-007) |
| `src/hooks/team-chat/useTeamUnreadCount.ts` | AUS | **NÃO PORTAR** | **deletado** na ponta do branch; a `main` usa `useTeamUnreadTotal` (PE-31) |

### 4.3 — Demais arquivos divergentes (37) — veredito: **NÃO PORTAR**

Todos existem na `main` com conteúdo próprio, evoluído por caminho próprio (SL-016/F53, SL-081/F52, N-070, PE-31, TC-007, HZ-28…). A versão do branch é anterior (base `0063e2a`, 29/09) e a ponta do branch **não compila**. Portar qualquer um destes regride a `main`.

| Arquivo | Status | Veredito |
|---|---|---|
| `docs/audits/PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` | DIF | manter versão da `main` (doc) |
| `scripts/db-audit/realtime-publication-baseline.json` | DIF | manter `main` |
| `scripts/db-audit/runtime-config.test.sh` | DIF | manter `main` |
| `src/components/layout/AppShell.tsx` | DIF | manter `main` (já monta `TeamChatNotificationsListener`) |
| `src/components/layout/Sidebar.tsx` | DIF | manter `main` (já tem `teamsBadge`) |
| `src/components/team-chat/GroupManagementDialog.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamChatHeader.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamChatInputArea.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamChatPanel.tsx` | DIF | manter `main` (194 linhas) |
| `src/components/team-chat/TeamChatView.tsx` | DIF | manter `main` (o do branch **não compila**: imports fantasma) |
| `src/components/team-chat/TeamConversationList.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamMemberDetails.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamMemberProfileHeader.tsx` | DIF | manter `main` |
| `src/components/team-chat/TeamMessageItem.tsx` | DIF | manter `main` |
| `src/components/team-chat/TransferConversationDialog.tsx` | DIF | manter `main` |
| `src/components/team-chat/department-management/DepartmentAuditView.tsx` | DIF | manter `main` |
| `src/components/team-chat/department-management/DepartmentInvitesView.tsx` | DIF | manter `main` |
| `src/components/team-chat/department-management/DepartmentMembersView.tsx` | DIF | manter `main` |
| `src/components/team-chat/department-management/DepartmentWhatsAppView.tsx` | DIF | manter `main` |
| `src/components/team-chat/useTeamChatPanel.ts` | DIF | manter `main` |
| `src/hooks/chat/useTeamChat.ts` | DIF | manter `main` |
| `src/hooks/chat/useTeamChatDraft.ts` | DIF | manter `main` |
| `src/hooks/team-chat/README.md` | DIF | manter `main` (README próprio) |
| `src/hooks/team-chat/index.ts` | DIF | manter `main` |
| `src/hooks/team-chat/queryKeys.ts` | DIF | manter `main` (fábrica superset, SL-081/F52) |
| `src/hooks/team-chat/teamChatTypes.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useDepartmentManagement.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useTeamChatMutations.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useTeamConversations.ts` | DIF | manter `main` (já usa `get_team_inbox`) |
| `src/hooks/team-chat/useTeamMessageReactions.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useTeamMessages.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useTeamPresence.ts` | DIF | **o branch DELETA** este arquivo (E76 → `useAgentPresenceMap`); a `main` ainda o tem — só agir se E76 for portada |
| `src/hooks/team-chat/useTeamReadState.ts` | DIF | manter `main` (versão própria N-070) |
| `src/hooks/team-chat/useTeamTyping.ts` | DIF | manter `main` |
| `src/hooks/team-chat/useTeamUnreadTotal.ts` | DIF | manter `main` (versão própria PE-31) |
| `src/integrations/supabase/types.ts` | DIF | manter `main` (regenerado por `types-sync`) |
| `src/styles/team-chat-tokens.css` | DIF | **o branch DELETA** este arquivo (E70/E94); a `main` ainda o tem — só agir se E70 for executada |

---

## 5. Saldo de salvage

**Portar (4 etapas / 8 arquivos):**

1. **E52** — `docs/team-chat/realtime-publication-decision.md` (doc; ausente na `main`).
2. **E59** — `src/hooks/team-chat/useMarkConversationRead.ts` (hook limpo; a RPC já existe).
3. **E61** — `src/hooks/team-chat/useResolvedStorageUrl.ts` (helper limpo).
4. **E76** — `src/hooks/team-chat/useAgentPresenceMap.ts` (+ deletar `useTeamPresence.ts` ao portar).
5. **E90 (parcial)** — a lógica de click de notificação dentro de `useTeamGlobalNotifications.ts`.
6. **Docs de referência** — `AUDITORIA_TEAM_CHAT_REMEDIACAO_2026-09-29.md` e `PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md`.
7. **Avaliar** — `DepartmentManagementDialog.tsx` (wrapper de abas; só portar se a `main` não tiver wrapper equivalente).

**Não portar:** as 40 migrations (canônicas na `main` + aplicadas), os 33 arquivos divergentes (a `main` evoluiu) e os 2 arquivos deletados no branch (`useTeamChatNotifications.ts`, `useTeamUnreadCount.ts` — superados por `TeamChatNotificationsListener`/`useTeamUnreadTotal`).

**Etapas pendentes que não têm artefato em lugar nenhum** (trabalho novo, não salvage): E80 (`DROP department_invites`), E83 ("Entrar via Código"), E84 (`set_profile_department`), E89 (`notify_team_mentions`), E95 (zerar `eslint-baseline`), E98 (`DROP` das 2 RPCs antigas), E70 (tokens), E100 (encerramento).

---

## 6. Evidências (comandos executados nesta sessão)

```text
git diff --name-status 0063e2aa76954498ab9344b35f874bca6b18d1d7 origin/claude/confident-babbage-ivgmmn
  → 87 arquivos (40 migrations + 47 não-migrations)

# classificação vs main (path-a-path): 10 AUSENTE_NA_MAIN · 77 DIFERENTE · 0 IDENTICO

git ls-tree origin/main supabase/migrations/ | grep -E "202609(28|29).*team_chat"
  → 40 arquivos; todos com grep "Recuperada do ledger" (RECUP)

git ls-tree origin/main supabase/migrations/ | grep -c team_chat  → 71
grep -rl "FUNCTION public.get_team_inbox" supabase/migrations        → 2
grep -rl "FUNCTION public.set_profile_department" supabase/migrations→ 0
grep -rl "FUNCTION public.notify_team_mentions" supabase/migrations  → 0
grep -rl "get_team_inbox" src/                                       → 6   (main)
grep -n "TeamChatNotificationsListener" src/App.tsx                  → linhas 47-49,100 (montado)
grep -n "teamsBadge" src/components/layout/Sidebar.tsx               → linha 151
grep -rl "useTeamUnreadTotal" src/                                   → 5
grep -rl "useTeamDraft" src/                                         → 0
wc -l src/components/team-chat/TeamChatPanel.tsx                     → 194
grep -rl "bg-black|bg-card|bg-background" src/components/team-chat   → 9
grep -rl "removeChannel" src/hooks/team-chat                         → 19
grep -rl "notificationclick" src/ public/                            → 0   (main)
grep -rl "DROP TABLE.*department_invites" supabase/migrations        → 0   (E80 não feita)
# branch: git grep -l "Entrar via C|notify_team_mentions|set_profile_department|notificationclick"
  → 0 em cada (ausentes também no branch)
git show origin/claude/confident-babbage-ivgmmn:src/hooks/team-chat/useTeamChatNotifications.ts | wc -l → 0
git show origin/claude/confident-babbage-ivgmmn:src/hooks/team-chat/useTeamUnreadCount.ts         | wc -l → 0
```

*Documento gerado em 2026-10-20 a partir de worktree próprio de `origin/main` (`d7af7a671c`), sem tocar a working tree de outro agente. Somente leitura sobre o branch; nenhum push/merge alterou `main`.*