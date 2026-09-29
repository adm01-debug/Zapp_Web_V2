# Auditoria exaustiva — Módulo Team Chat — 2026-09-29 (13:00–13:40 UTC)

**Objeto:** os três planos do módulo e o que existe de verdade em `main`, no branch da PR #1151 e no
banco de produção `tnnnlkbymytvtqngbbqh`.

| Plano | Onde está | Alegação | Resultado desta auditoria |
|---|---|---|---|
| `PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md` | `main` | "✅ CONCLUÍDO" (falso, já corrigido em 28/09) | superado; só a Fase 1 (banco) valeu |
| `PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` | `main` (#1141) | "nada executado" | superado pelo plano de 29/09 (mesmas etapas, renumeradas) |
| `PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` | **só no branch** `claude/confident-babbage-ivgmmn` (PR #1151, draft) | "nada executado" | **11 DONE · 33 PARCIAL · 56 AUSENTE** — e o que foi feito, foi aplicado em produção **antes do merge**, gerando drift |

**Base auditada:** `main` @ `ac5d629`; branch `claude/confident-babbage-ivgmmn` @ `0f9a280`; ledger
`max(version) = 20260929330000` às 13:34 UTC (era `20260929200000` às 13:05 — **outra sessão está aplicando
DDL neste minuto**, ver §1).
**Método:** leitura dos 3 planos + auditoria de 28/09 + auditoria de 29/09 do branch; `pg_policies`, `pg_constraint`,
`pg_indexes`, `pg_proc` (`proacl`, `prosecdef`, `pg_get_function_result`, `prosrc`), `role_table_grants`,
`column_privileges`, `pg_publication_tables`, `pg_trigger`, `relreplident`, ledger e `version_reservations` ao
vivo; grep de importadores para cada arquivo do módulo; `git diff --stat` de `main` contra o branch da PR.

---

## 1. O fato que muda tudo: drift em andamento

Entre 12:57 e 13:34 UTC de 29/09 a sessão `confident-babbage` (PR #1151) **aplicou 36 migrations em produção
a partir de um branch aberto**, sem merge em `main` — exatamente o padrão dos drifts de 02/09, 04/09 e 26/09
que a regra 6 da seção 1 do CLAUDE.md proíbe.

| Faixa do ledger | Conteúdo | Arquivo no branch? | Arquivo em `main`? |
|---|---|---|---|
| `20260928420000`–`20260928600000` (18) | `current_profile_id()`, policies `TO authenticated`, `receipts.conversation_id`, bloco A′ E09–E22, E25 | sim (18) | **não** |
| `20260929160000`–`20260929250000` (10) | bloco B′ E26–E35 | sim (10) | **não** |
| `20260929260000`–`20260929330000` (8) | bloco C′ E37–E44 (`get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `leave_team_group`, `remove_team_member`) | **não** (branch parou em E35) | **não** |

Consequências já visíveis:

- Issue [adm01-debug/Zapp_Web_V2#1166](https://github.com/adm01-debug/Zapp_Web_V2/issues/1166) (`db-live-guard`)
  aberta às 11:57 por manifesto divergente; com 36 versions sem arquivo em `main` o guarda vai falhar em
  todos os passos (ledger, catálogo, manifesto, paridade).
- `types.ts`/`schema-catalog.json` de `main` não conhecem 9 das 10 RPCs novas (só `current_profile_id` aparece).
  O `types-sync` (#1168) também não as traz — ele roda a partir do que está em `main`. Nenhum front pode chamá-las.
- 8 versions existem **apenas no ledger**: se a sessão parar agora, o SQL real dessas RPCs só é recuperável
  por `pg_get_functiondef` + `statements` do ledger.
- A PR #1151 está com título "[NÃO MERGEAR — auditada 29/09]", mas o branch é hoje a **única** cópia dos
  28 arquivos aplicados. Fechar essa PR sem mergear apaga a origem do que está em produção.

**Tudo o que se lê abaixo sobre "banco" deve ser relido no dia da execução**, porque o estado muda a cada
minuto. Os números aqui são das 13:34 UTC.

---

## 2. Resultado por plano

### 2.1 Plano de 29/09 (vigente, 100 etapas) — 11 ✅ · 33 ◐ · 56 ✗

| Fase | Etapas | ✅ | ◐ | ✗ |
|---|---|---|---|---|
| 0 Limpeza/identidade/baseline | E01–E08 | 1 | 1 | 6 |
| 1 Segurança (A′) | E09–E24 | 6 | 8 | 2 |
| 2 Integridade (B′) | E25–E36 | 3 | 7 | 2 |
| 3 RPCs/perf (C′) | E37–E50 | 0 | 7 | 7 |
| 4 Realtime (D′) | E51–E54 | 1 | 0 | 3 |
| 5 Hooks | E55–E66 | 0 | 3 | 9 |
| 6 Componentes | E67–E78 | 0 | 5 | 7 |
| 7 Departamentos | E79–E85 | 0 | 1 | 6 |
| 8 Notificações | E86–E91 | 0 | 1 | 5 |
| 9 Testes/fechamento | E92–E100 | 0 | 0 | 9 |

### 2.2 Plano de 28/09 (em `main`) — mesmo conteúdo renumerado; herda o resultado acima
### 2.3 Plano de 27/09 — 21/38/41 (auditoria de 28/09), sem mudança desde então no front

---

## 3. Estado real do banco (13:34 UTC) — o que está bom, o que regrediu

### 3.1 Feito e correto (confirmado ao vivo)

| Item | Prova |
|---|---|
| `current_profile_id()` SECDEF, `search_path=public`, sem `anon` | `pg_proc` |
| Zero grants `TRUNCATE/TRIGGER/REFERENCES` para `anon`/`authenticated` no escopo; zero grants de `anon` | `role_table_grants` |
| `team_messages` UPDATE só em `content, is_edited, updated_at` | `column_privileges` |
| Zero policies `roles={public}` em `team_*`/`department*` | `pg_policies` |
| `team_messages_update_own` com `WITH CHECK` real, `TO authenticated` | `pg_policies` |
| Receipts: `DELETE` revogado; UPDATE own com `WITH CHECK (status='read')`; triggers `update_guard` e `no_own_sender`; CHECKs `delivered_at`/`read_at` | `pg_constraint`, `pg_trigger` |
| `department_invitations` com `used_at/used_by/max_uses/use_count`, índice parcial `(code) WHERE status='pending'` | `information_schema.columns`, `pg_indexes` |
| `accept_department_invite(p_code)` sobre `department_invitations` com `FOR UPDATE` | `prosrc` |
| `create_department_invite` sobre `department_invitations` | `prosrc` |
| `department_audit_logs`: `authenticated` só SELECT; trigger `fill_profile_name`; CHECK de `action` | grants, `pg_trigger` |
| `get_department_whatsapp_api_key` só `service_role` | `proacl` |
| `team_messages`: `no_self_reply` + trigger `validate_reply_to`; trigger `edit_guard` | `pg_constraint`, `pg_trigger` |
| `team_conversations`: unique parcial por departamento + FK `department_id ON DELETE CASCADE`; CHECKs `dept_required`, `group_name_required` | `pg_indexes`, `pg_constraint` |
| `team_message_receipts.conversation_id` desnormalizado | colunas |
| `COMMENT ON` nas 8 tabelas do escopo | `obj_description` |
| 10 RPCs novas existem (lista na §1) com `search_path=public`, sem `anon` | `pg_proc` |
| Publication: `team_conversation_members, team_messages, team_message_reactions, team_message_receipts` | `pg_publication_tables` |

### 3.2 Regressões e defeitos INTRODUZIDOS pelo apply de 29/09 (novos, não estavam em nenhum plano)

| # | Defeito | Prova | Efeito |
|---|---|---|---|
| R1 | **Reações sem checagem de membership.** Coexistem 2 policies INSERT em `team_message_reactions`: a antiga `team_message_reactions_insert` (exige membership) e a nova `reactions_insert` (`profile_id = current_profile_id()` e só). Policies permissivas são OR. | `pg_policies` | qualquer autenticado reage a qualquer mensagem cujo id conheça. Mesma duplicidade em SELECT e DELETE (redundante, não perigosa). |
| R2 | **Storage `team-chat-files` incoerente entre as 4 policies.** INSERT exige pasta `= current_profile_id()`; DELETE own e SELECT exigem pasta `= auth.uid()`; SELECT mantém o `EXISTS` inerte (`tm.media_path = p.name`) e segue `roles={public}`. | `pg_policies` em `storage.objects` | quem envia (pasta `profiles.id`) **não consegue ler nem apagar o próprio arquivo**; outros membros também não; só admin vê mídia. Áudio (`useTeamChatPanel.ts:248`, pasta `conversation.id`) continua 403 no upload. |
| R3 | **`get_department_whatsapp_credentials` revogada de `authenticated`** (`proacl` só `postgres`/`service_role`) e passou a devolver `jsonb`. `useDepartmentManagement.ts:213` chama a RPC como usuário logado. | `proacl` | aba WhatsApp do departamento falha com 42501 para todo mundo, inclusive admin. |
| R4 | **Fluxo de convite partido ao meio.** RPCs leem/gravam `department_invitations`; o hook grava e lista `department_invites` (`useDepartmentManagement.ts:86,122,144`), que ainda existe com 3 policies `USING (true)`. | ao vivo + código | convite criado na tela nunca é aceitável; a tabela aberta continua listável por qualquer autenticado. |
| R5 | **2 pares de índices duplicados criados** — `idx_team_conv_members_profile_id` ≡ `idx_team_members_profile`; `idx_team_messages_conv_created` ≡ `idx_team_messages_conversation`. O plano mandava criar o parcial `WHERE NOT is_archived` e o composto `(conversation_id, created_at DESC, id DESC)` e **dropar** os antigos. | consulta de definição idêntica | write amplification à toa; o keyset da E38/E39 não tem índice. |
| R6 | **`team_conv_members_last_read_at_check` é `last_read_at <= now() + 5s`**, não `>= joined_at`. `now()` em CHECK é aceito pelo PG mas é semanticamente errado (uma linha válida hoje pode ser "inválida" num restore). | `pg_constraint` | não protege o invariante pedido. |
| R7 | **`accept_department_invite` não faz `UPDATE profiles SET department_id`** (`prosrc` sem `UPDATE profiles`). | `prosrc` | aceitar convite não coloca a pessoa no departamento — a RPC só consome o código. |
| R8 | **Contratos das RPCs C′ divergem do que o front vai precisar** (e do plano): `get_team_inbox()` sem `p_include_archived`, sem `is_pinned/is_archived/member_role/last_read_at/avatar/other_profile_*`, sem `ORDER BY is_pinned DESC`, SECDEF; `get_team_messages_page(cid, p_before_id, limit)` com cursor só por `id` (pula empates de `created_at`), sem `reactions`, sem `status`; `set_team_member_pref` só aceita `p_is_muted` (Fixar/Arquivar continuam impossíveis); `search_team_messages` devolve `content` inteiro, sem `snippet`; `mark_team_conversation_read` devolve `void`. | `pg_get_function_result`, `prosrc` | a Fase 5 do plano não pode ser escrita contra esses contratos sem reabrir o bloco C′. |
| R9 | **8 versions só no ledger** (`20260929260000`–`330000`): nenhum arquivo em branch algum. | `git log --all` × ledger | irrecuperável por Git; só por `pg_get_functiondef`. |
| R10 | **Policy de auditoria mais restrita que o plano**: `dept_audit_select_own_dept` exige `role IN ('admin','supervisor')` **e** mesmo departamento — admin de outro departamento não vê; `is_admin_or_supervisor()` não é usada. | `pg_policies` | `DepartmentAuditView` vazia para admin global. |

### 3.3 Pendências do banco que continuam abertas (do plano de 29/09)

- `team_conversations` UPDATE: grant ainda cobre as 11 colunas (`type`, `created_by`, `direct_member_*` editáveis via PostgREST); policy só `created_by = me` (owner/admin de grupo não renomeia; admin global não edita).
- `departments.whatsapp_api_key`/`whatsapp_instance_id` continuam com INSERT/UPDATE para `authenticated` (a RPC `set_department_whatsapp_config` existe mas nada impede a escrita direta).
- `team_conversation_members`: sem regra do último owner; INSERT não restringe `member_role` (membro comum insere `owner`).
- `team_messages`: sem CHECK de `media_type`, sem `char_length(content) <= 10000`, sem coerência `media_bucket/media_path` (a `type_media_check` olha `media_url`, coluna legada).
- `team_conversations`: sem CHECK do predicado completo de `direct` (`a < b`, `name IS NULL`), sem limite de `name`, sem CHECK `jsonb_typeof(metadata)`.
- `team_message_reactions`: sem trigger que force `conversation_id` a partir da mensagem.
- Sem view `team_message_read_state`; sem `transfer_team_conversation_department`; `REPLICA IDENTITY` ainda `FULL`; RPCs antigas sem `COMMENT` de deprecação; sem baseline de `pg_stat_statements` (extensão está instalada).
- Apenas 4 colunas com `COMMENT`.
- `department_invitations_code_format` é `length 6..64`, não `^[A-Z0-9]{8}$`; `use_count <= max_uses` não é CHECK.

---

## 4. Estado real do front (`main` @ `ac5d629`) — nada mudou desde 28/09

Nenhum commit tocou `src/components/team-chat` ou `src/hooks/team-chat` desde 28/09 (só `hooks/chat` por
causa de Tarefas). Logo, **toda a auditoria de front de 28/09 continua válida**. Resumo verificado hoje por grep:

| Área | Estado | Evidência |
|---|---|---|
| Órfãos (0 importadores) | 10 arquivos | `GroupManagementDialog`, `ParticipantStatsGraph`, `TeamChatA11y`, `TeamMessageItem`, `TeamPerformancePanel`, `TransferConversationDialog`, `useTeamPresence`, `useTeamTyping`, `useTeamUnreadCount`, `team-chat-tokens.css` (+ `i18n/team-chat.ts`, `scripts/team-chat-db-validate.mjs` fora de `src/`) |
| Lista de conversas | 2 RPCs antigas + 3 queries encadeadas | `useTeamConversations.ts:36-37`, 3× `.from(` |
| Mensagens | `useQuery` + `limit(200)` + `reverse()`; realtime `event:'*'` + invalidate; canal sem sufixo | `useTeamMessages.ts:12-38` |
| Marcar lida | upsert client-side de **todas** as carregadas + UPDATE `last_read_at`, erro ignorado | `useTeamMessages.ts:40-72` |
| Paginação | `fetchOlderMessages` existe, Panel nunca chama | `useTeamChatPanel.ts:136-164` |
| Uploads | pasta `profile.id` (2×), `conversation.id` (áudio); `getPublicUrl` em 2 arquivos; sem helper | `TeamFileUploader.tsx:66`, `useTeamChatDraft.ts:68`, `useTeamChatPanel.ts:248` |
| Chaves de query | 40 literais `['team-…']` no módulo; `src/services/api/` não existe | grep |
| Mutations | só `find_or_create_direct_conversation` por RPC; `updated_at` tocado à mão (`:32`, `:63`); `useToggleMuteConversation` faz `update({is_muted})` direto; `useTransferConversation` troca `created_by` | `useTeamChatMutations.ts` |
| Silenciar | grava `is_muted` na membership, mas o rótulo lê `settings.muted_conversations` | `useTeamChatPanel.ts:62` |
| Tipos | `teamChatTypes.ts` sem `metadata/member_role/is_pinned/is_archived/TeamMessageReaction/MessageUIStatus` | grep vazio |
| Panel | 273 linhas, 0 `TeamMessageItem`, 0 `ErrorBoundary`, reply duplicado (`:194-217`), helpers locais (`:24-64`) | leitura |
| Header | Fixar/Arquivar `disabled` (`:266-273`); Performance "em breve" (`:150-156`); recebe só `onToggleMute` do Panel; TTS via `s.tts.set*` (não persiste) | leitura |
| Tema | 16 ocorrências de `bg-black|bg-card|bg-background`; `team-chat-tokens.css` não carregado; `@container` ausente | grep |
| Busca | client-side, debounce 400ms, sem ⌘K, sem `search_team_messages` | `useTeamChatPanel.ts:167-173` |
| Lista | sem debounce, sem `aria-setsize`, sem chip Arquivadas, sem skeleton; `canManageDepartments` esperado mas `TeamChatView` não passa | grep |
| Presença | `is_active` em 2 componentes; `useAgentPresenceMap` 0 usos | grep |
| Canal protegido | admin bloqueado (`TeamChatPanel.tsx:75`); sem "Entrar via Código"/"Solicitar acesso" | leitura |
| Departamentos | `department_invites` (3×), `department_whatsapp_configs` inexistente (`:226`, `@ts-expect-error`), `profile_id: user?.id` (auth uid) em 5 pontos, sem `enabled` por aba | grep |
| Sidebar | badge só para `inbox` (`Sidebar.tsx:124`) | grep |
| Notificações | listener em `TeamChatView.tsx:20`; canal fixo; `AppShell` sem hook | grep |
| Digitando / menções / push | `useTeamTyping` 0 consumidores; `MentionAutocomplete` via `get_team_profiles`; nenhum `notificationclick` | grep |
| Testes | 219 + 52 `expect(true).toBe(true)`; `rls-contract.test.ts` não lê migrations; `team-chat-exhaustive-audit.test.ts` (regex sobre texto) intacto; 0 E2E; 7 arquivos do módulo no `eslint-baseline.json` (88 entradas) | grep |
| Docs | CLAUDE.md sem "Team Chat"; sem `hooks/team-chat/README.md`; sem `docs/audits/team-chat-baseline-*` | ls |

---

## 5. Por etapa (plano de 29/09)

Legenda: ✅ DONE · ◐ PARCIAL · ✗ AUSENTE. "A:" = aplicado ao vivo.

### Fase 0 (E01–E08)
| E | St | Evidência |
|---|---|---|
| E01 sanear #1151 | ◐ | 44 migrations quebradas e 11 hooks removidos; mas o branch **não** virou docs-only — carrega 28 migrations novas (as aplicadas) |
| E02 `current_profile_id()` | ✅ | A: `20260928420000` |
| E03 snapshot | ✗ | `docs/audits/team-chat-baseline-*` não existe em branch algum |
| E04 decisões (seção 10) | ✗ | "(preencher na E04)" continua vazio |
| E05 teste de contrato RLS no `db-guard` | ✗ | — |
| E06 fixtures E2E/RLS | ✗ | — |
| E07 `team-chat-local-gates.sh` | ✗ | — |
| E08 mapa de PRs | ✗ | tabela com `—` |

### Fase 1 (E09–E24)
| E | St | Evidência |
|---|---|---|
| E09 revoke TRUNCATE/TRIGGER/REFERENCES | ✅ | A: `450000`; 0 grants |
| E10 revoke ALL de anon | ✅ | A: `460000`; 0 grants |
| E11 UPDATE por coluna | ✅ | A: `470000`; 3 colunas |
| E12 policy edit `WITH CHECK` | ✅ | A: `480000` |
| E13 receipts hardening | ✅ | A: `490000` (DELETE revogado, trigger, WITH CHECK) |
| E14 `department_invitations` schema | ◐ | A: `500000`; CHECK de código `6..64` (plano: `^[A-Z0-9]{8}$`); sem `use_count <= max_uses` |
| E15 `accept_department_invite` | ◐ | A: `510000`; `FOR UPDATE` ✓; **não atualiza `profiles.department_id`** (R7) |
| E16 `create_department_invite` | ◐ | A: `520000`; assinatura `(p_department_id, p_max_uses, p_expires_hours)` — sem `role`/`email`; ver E79 |
| E17 audit_logs hardening | ◐ | A: `530000`; INSERT/UPDATE/DELETE revogados ✓, trigger ✓; SELECT mais restrita que o plano (R10); CHECK com 12 ações ≠ 8 do plano |
| E18 departments whatsapp | ◐ | A: `540000` cria a RPC; **colunas continuam graváveis** por `authenticated` |
| E19 credentials sem chave | ◐ | A: `550000`; `get_department_whatsapp_api_key` ✓; `get_department_whatsapp_credentials` **revogada de `authenticated`** e devolve `jsonb` (R3) |
| E20 storage | ✗ | A: `560000` só trocou o INSERT para `current_profile_id()`; policy inerte segue `{public}`; SELECT/DELETE por `auth.uid()` (R2) |
| E21 `team_conversations` UPDATE | ◐ | A: `570000`; policy `created_by = me` apenas; grant nas 11 colunas |
| E22 members policies | ◐ | A: `580000`; DELETE own/admin, INSERT membro-ou-admin; sem último-owner, sem restrição de `member_role` |
| E23 roles public → authenticated | ✅ | A: `430000`; 0 policies `{public}` |
| E24 fechamento A′ | ✗ | sem types-sync, sem snapshot, `db-live-guard` vermelho (#1166), PR não mergeada |

### Fase 2 (E25–E36)
| E | St | Evidência |
|---|---|---|
| E25 CHECK media_type/content | ✗ | A: `600000` não os contém |
| E26 coerência de mídia | ◐ | A: `160000` = `type_media_check` sobre `media_url` (legada), não sobre `media_bucket/path` |
| E27 reply mesma conversa | ✅ | A: `170000` |
| E28 trigger edição | ✅ | A: `180000` (`team_messages_edit_guard`) |
| E29 CHECK type/direct | ◐ | A: `190000` só `dept_required` + `group_name_required` |
| E30 unique depto + CASCADE | ✅ | A: `200000` |
| E31 members CHECK + parcial | ◐ | A: `210000`; CHECK errado (R6); índice duplicado em vez de parcial (R5) |
| E32 reactions | ◐ | A: `220000`; CHECK emoji 1..8 ✓, `dedup_trig` ✓; sem trigger de `conversation_id`; policy INSERT **abriu** membership (R1) |
| E33 receipts CHECKs | ◐ | A: `230000`; `delivered_at/read_at required` + `no_own_sender` ✓; sem exclusividade `delivered → read_at NULL` nem `read_at >= delivered_at` |
| E34 espelhos de drift | ◐ | A: `240000` registrado; sem CHECK `jsonb_typeof(metadata)` |
| E35 COMMENT ON | ◐ | A: `250000`; 8 tabelas ✓, 4 colunas (plano: ~10) |
| E36 fechamento B′ | ✗ | — |

### Fase 3 (E37–E50)
| E | St | Evidência |
|---|---|---|
| E37 `get_team_inbox` | ◐ | A: `260000`; contrato reduzido (R8) |
| E38 índice keyset | ✗ | criado duplicado sem `id DESC` (R5) |
| E39 `get_team_messages_page` | ◐ | A: `270000`; cursor só `id`, sem reações/status (R8) |
| E40 `mark_team_conversation_read` | ◐ | A: `280000`; grava receipts ✓; devolve `void` |
| E41 view read_state | ✗ | `pg_views` vazio |
| E42 `search_team_messages` | ◐ | A: `290000`; sem snippet |
| E43 `toggle_team_reaction` | ◐ | A: `300000`; devolve `jsonb` (plano: boolean) — aceitável se o front seguir |
| E44 `set_team_member_pref` | ◐ | A: `310000`; só `p_is_muted` |
| E45 transfer departamento | ✗ | — |
| E46 leave/remove | ◐ | A: `320000`/`330000`; semântica de último owner/promoção **não verificada** (sem arquivo para ler) |
| E47 REPLICA IDENTITY | ✗ | `f` |
| E48 deprecação | ✗ | sem `COMMENT` |
| E49 índices duplicados | ✗ | 2 pares novos (R5) |
| E50 fechamento C′ | ✗ | — |

### Fase 4 (E51–E54)
| E | St | Evidência |
|---|---|---|
| E51 `receipts.conversation_id` | ✅ | A: `440000` |
| E52 decisão publication | ✗ | não registrada (estado ao vivo já é o desejado) |
| E53 README de canais | ✗ | arquivo não existe |
| E54 `types-sync` com as RPCs | ✗ | `types.ts` só tem `current_profile_id`; #1168 idem |

### Fases 5–9 (E55–E100)
Estado idêntico ao de 28/09 (§4). ◐ apenas onde já havia algo: E61 (`useResolvedStorageUrl` por `media_url`),
E62 (`sonner` em 4 arquivos, 1 `use-toast`), E65 (`useTeamChatDraft` em uso), E68 (`TeamMessageItem` órfão),
E72 (busca client-side), E73 (chips/listbox), E77 (handlers de voz existem), E78 (hooks/painéis órfãos),
E82 (views de auditoria/convites pré-existentes), E91 (`removeChannel` nos cleanups). Todo o resto ✗.

---

## 6. Achados transversais

1. **Três planos, três numerações, zero rastreabilidade.** Os arquivos de migration têm `e09…e44` no nome
   seguindo o plano de 29/09; o plano de 28/09 usa outra numeração; a auditoria de 28/09 outra. Quem ler o ledger
   não sabe a qual plano "E37" pertence. O plano novo (§7) usa prefixo `TC-` único e o nome do arquivo carrega o
   objeto, não o número.
2. **O `supabase-usage-guard` não acusa RPC inexistente no banco** — projeta funções a partir dos arquivos de
   migration. Com arquivos só no branch, um front que chame `get_team_inbox` passa no guard e quebra em runtime.
3. **`types.ts` é a barreira real**: enquanto as 36 migrations não estiverem em `main` e o `types-sync` não
   rodar, nenhuma etapa de front das fases 5–8 é compilável.
4. **Sessões paralelas de novo**: o branch #1151 tem 3 commits novos hoje (77cb72f, 1f2c016, 0f9a280) enquanto
   esta auditoria rodava; `version_reservations` mostra reservas `confident-babbage-e26…e30` às 13:27–13:28 e
   o ledger avançou até E44 às 13:34. **Nenhuma outra sessão deve aplicar DDL no escopo `team_*`/`department*`
   até a reconciliação (§7, Fase 0) estar mergeada.**
5. `PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` (o plano vigente) **não está em `main`**: só existe
   no branch. Se a PR #1151 for fechada, o plano some junto.

---

## 7. O que falta (consolidado) → vira o plano novo

`docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md` (100 etapas, prefixo `TC-`). Ordem de ataque:

1. **Estancar o drift** (Fase 0): congelar DDL de terceiros no escopo; materializar as 8 versions só-ledger em
   arquivos; mergear #1151 como **reconciliação** (36 migrations + docs); `types-sync`; `db-live-guard` verde.
2. **Corrigir as 10 regressões R1–R10** (Fase 1) antes de qualquer front — R1 e R2 são segurança/funcionalidade
   ao vivo agora.
3. **Fechar as pendências de integridade** (Fase 2) enquanto as tabelas seguem vazias (2 conversas, 2 mensagens,
   0 recibos, 0 reações, 0 departamentos).
4. **Realinhar contratos das RPCs** ao que o front precisa (Fase 3) — uma versão 2 de `get_team_inbox`,
   `get_team_messages_page`, `set_team_member_pref`, `search_team_messages`; criar view, transfer, deprecações.
5. Só então front (Fases 4–7), testes e fechamento (8–9).

---

## 8. Evidências (comandos executados nesta sessão)

```
git log --oneline --since=2026-09-28 -- src/components/team-chat src/hooks/team-chat     → 0 commits
git diff --stat origin/main...origin/claude/confident-babbage-ivgmmn                      → 31 arquivos (28 .sql + 3 docs)
git log --all --diff-filter=A -- 'supabase/migrations/20260929260000*'                   → vazio (só-ledger)
SELECT max(version) FROM supabase_migrations.schema_migrations  (13:05 UTC) → 20260929200000
SELECT max(version) FROM supabase_migrations.schema_migrations  (13:34 UTC) → 20260929330000
SELECT count(*) FROM team_conversations / team_messages / team_message_receipts / team_message_reactions / departments → 2 / 2 / 0 / 0 / 0
role_table_grants TRUNCATE/TRIGGER/REFERENCES p/ anon+authenticated no escopo → 0 ; grants de anon → 0
column_privileges UPDATE team_messages p/ authenticated → content,is_edited,updated_at
column_privileges UPDATE team_conversations p/ authenticated → 11 colunas
column_privileges INSERT/UPDATE departments.whatsapp_* p/ authenticated → 4 linhas
pg_policies roles={public} no escopo público → 0 ; em storage.objects (team-chat-files) → 1 (SELECT)
pg_policies team_message_reactions cmd=INSERT → 2 (reactions_insert, team_message_reactions_insert)
to_regclass('public.department_invites') → não nulo ; policies USING(true) → 3
proacl get_department_whatsapp_credentials → {postgres,service_role}
prosrc accept_department_invite ILIKE '%UPDATE profiles%' → false
índices de definição idêntica no escopo → 2 pares
relreplident team_messages → f ; pg_views team% → 0
grep -c "expect(true).toBe(true)" team-chat-comprehensive / security-gaps → 219 / 52
grep -o '"src/[^"]*team-chat[^"]*"' scripts/ci/eslint-baseline.json | sort -u | wc -l → 7 (88 entradas)
```
