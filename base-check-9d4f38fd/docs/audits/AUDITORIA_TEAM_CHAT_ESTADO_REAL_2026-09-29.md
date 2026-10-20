# Auditoria exaustiva — Team Chat: estado real em 2026-09-29 13:30 UTC

**Objeto:** os três planos do módulo Team Chat e o que de fato existe em `main`, na PR #1151 e no banco de produção.

| Plano | Arquivo | Status declarado | Status real (esta auditoria) |
|---|---|---|---|
| Paridade V3 (27/09) | `docs/audits/PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md` | "✅ CONCLUÍDO" (falso; já corrigido em 28/09) | 21 DONE · 38 PARCIAL · 41 AUSENTE (auditoria de 28/09, confirmada) |
| Remediação (28/09) | `docs/audits/PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` | "nada executado" | superado pelo plano de 29/09 |
| Conclusão (29/09) | `docs/audits/PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` (só na branch `claude/confident-babbage-ivgmmn`, PR #1151) | "nada executado" | **7 DONE · 16 PARCIAL · 3 DIVERGENTE/REGRESSÃO · 74 AUSENTE** |

**Base auditada:** `main` @ `e433589` · branch `claude/confident-babbage-ivgmmn` @ `77cb72f` (PR #1151, draft, título "NÃO MERGEAR") · banco `tnnnlkbymytvtqngbbqh` ao vivo às 13:29 UTC.
**Método:** leitura integral dos 3 planos e das 2 auditorias anteriores; `pg_policies`, `pg_constraint`, `pg_indexes`, `pg_proc`, `role_table_grants`, `column_privileges`, `pg_publication_tables`, `relreplident`, ledger `supabase_migrations.schema_migrations` e `version_reservations`; grep de importadores por arquivo do módulo; PRs abertas/fechadas; issue `db-live-guard` #1166.

> **Nota sobre o pedido.** O link enviado aponta para `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` (módulo Telefonia), mas o texto pede o módulo **Team Chat**. Esta auditoria cobre o Team Chat. O plano de Telefonia tem ledger próprio em `docs/design/TELEFONIA_STATUS.md` e não foi revisado aqui.

> **Alvo em movimento.** A sessão `confident-babbage` está **ativa em paralelo**: reservou as versões `20260929160000`–`200000` (E26–E30 do plano de 29/09) às 13:27–13:28 UTC, um minuto antes desta leitura. Tudo abaixo é o estado às 13:30 UTC; qualquer apply posterior não está refletido.

---

## 1. Resumo executivo

1. **O banco avançou; o repositório não.** Entre 12:57 e ~13:10 UTC de hoje, 18 migrations do Team Chat (`20260928420000`–`600000`) foram **aplicadas em produção diretamente da branch da PR #1151**, cujo título diz "NÃO MERGEAR". Nenhum desses 18 arquivos está em `main`. É o mesmo padrão do incidente E40 (CLAUDE.md, 26/09) e dos drifts de setembro: `db-live-guard` abriu a issue #1166 (2 comentários, 11:58 e 13:26) — `types.ts` desatualizado, manifesto e catálogo divergentes, paridade migrations↔ledger quebrada.
2. **As 18 migrations implementam ~60 % do Bloco A′ do plano de 29/09, com 3 regressões e 8 divergências de contrato** (seção 4). A mais grave: a policy de leitura correta do bucket `team-chat-files` foi **dropada** e a inerte ficou — hoje um agente comum não consegue nem ler os próprios anexos.
3. **Colisão de versões em curso.** As versões `20260928450000`–`600000` usadas pelo Team Chat estavam **reservadas por outra sessão** (`hermes-multiplix-bloco-a`, 33 versões `450000`–`20260929080000`, reservadas 13:01–13:03). O Team Chat registrou 15 migrations em cima dessa faixa. Quando o Multiplix aplicar, o `INSERT … ON CONFLICT DO NOTHING` do ledger vai mascarar a colisão (já aconteceu 2× em 16/09).
4. **Do front, nada mudou desde 28/09.** `main` tem exatamente o estado da auditoria de 28/09: 11 arquivos órfãos, `TeamChatPanel` com markup inline (273 linhas), upload quebrado por RLS nos 3 pontos, Fixar/Arquivar `disabled`, presença por `is_active`, 219 + 52 testes tautológicos, 88 entradas no `eslint-baseline.json`, nenhum E2E. A branch da PR #1151 **reverteu** os 11 hooks quebrados (diff em `src/` contra `main` = vazio) — correto.
5. **Duas partes do front pioraram com o DDL de hoje** (sem o código acompanhar): a aba WhatsApp do departamento agora recebe `access_denied` (RPC virou `service_role`-only com outro nome de parâmetro) e os 4 `INSERT` de auditoria do hook de departamentos falham (INSERT revogado + `CHECK` de ações que não inclui `delete_invite`/`add_member`/`save_whatsapp`).
6. **Fases 2–9 do plano de 29/09 (E25–E100): 0 etapas concluídas.** Nenhuma RPC nova existe (`get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `transfer_team_conversation_department`, `leave_team_group`, `remove_team_member` — todas ausentes de `pg_proc` e de `types.ts`).

---

## 2. Linha do tempo (o que aconteceu com cada plano)

| Quando | Evento | Evidência |
|---|---|---|
| 27/09 | Plano V3-parity (100 etapas) escrito e, na mesma sessão, declarado "concluído" (PR #969). 16 arquivos criados sem importador. | `git show a5fb09c:…PARITY…` (checklist íntegro) vs `28e5825` (resumo de 66 linhas) |
| 28/09 | Auditoria: 21/38/41. Plano de remediação (100 etapas) escrito. PR #1141 mergeada (docs). | `AUDITORIA_TEAM_CHAT_V3_PARITY_2026-09-28.md` |
| 28/09 21:30 | Sessão `confident-babbage` reserva `300000`–`360000`, escreve 44 migrations + 11 hooks contra um schema errado (`auth.uid()` como `profiles.id`, `profiles.is_admin`, `actor_id`…). PR #1151 aberta. | `version_reservations`; PR #1151 descrição original |
| 29/09 manhã | Auditoria da PR #1151: 1/24/21/54, "se aplicada, derruba o módulo". Plano de conclusão (100 etapas). Commit `2b87032` remove as 45 migrations e os 11 hooks. PR retitulada "NÃO MERGEAR". | `AUDITORIA_TEAM_CHAT_REMEDIACAO_2026-09-29.md`; `git log origin/claude/confident-babbage-ivgmmn` |
| 29/09 12:57–13:00 | Mesma sessão reserva `420000`–`440000` (E02, "E09", "E10") e **aplica em produção** o helper `current_profile_id()`, policies `TO authenticated` e `receipts.conversation_id`. | ledger + reservas `session-confident-babbage` |
| 29/09 13:01–13:03 | Sessão `hermes-multiplix-bloco-a` reserva `450000`–`20260929080000` (33 versões). | `version_reservations` |
| 29/09 ~13:03–13:10 | Team Chat registra `450000`–`600000` (`e09`…`e22`, `e25`) **sobre a faixa do Multiplix**, sem reserva própria. Commit `77cb72f` adiciona os 15 espelhos à branch. | ledger; `git show --stat 77cb72f` |
| 29/09 13:11 | Team Chat reserva `20260929090000`/`100000` ("E09", "E11") — já aplicadas em `450000`/`470000`; reservas ficaram órfãs. | `version_reservations` |
| 29/09 13:26 | `db-live-guard` falha de novo em `main` @ `ac5d629` (6 passos vermelhos). | issue #1166, 2º comentário |
| 29/09 13:27–13:28 | Team Chat reserva `20260929160000`–`200000` (E26–E30). **Bloco B′ começando com A′ ainda fora de `main`** — viola a regra 9 do próprio plano ("uma sessão, um bloco"). | `version_reservations` |

---

## 3. Estado ao vivo do banco (medido às 13:29 UTC)

### 3.1 Volume
`team_conversations` 2 · `team_conversation_members` 4 · `team_messages` 2 · `team_message_reactions` 0 · `team_message_receipts` 0 · `departments` 0 · `department_invitations` 0 · `department_invites` 0 (tabela **ainda existe**) · `department_audit_logs` 0. O módulo continua sem uso real — DDL corretiva segue barata.

### 3.2 Grants (escopo das 9 tabelas)
- `TRUNCATE`/`TRIGGER`/`REFERENCES` para `anon`+`authenticated`: **0** (era 54). ✅
- Grants de `anon`: **0** (era 62). ✅
- `team_messages` UPDATE: só `content`, `is_edited`, `updated_at`. ✅
- `team_conversations` UPDATE: tabela inteira **menos** `type`, `created_by`, `department_id` (`created_at`, `avatar_url`, `name`, `metadata`, `updated_at`, `direct_member_a/b` continuam editáveis). ◐ — o plano pedia `GRANT UPDATE (name, avatar_url, metadata, updated_at)` apenas; `direct_member_a/b` editáveis pelo criador é brecha.
- `team_conversation_members` UPDATE: tabela inteira menos `conversation_id`, `profile_id`, `joined_at` (`member_role` **editável** pelo próprio membro via `tcm_update_own_prefs`). ⚠ — um membro pode se promover a `owner` com `PATCH {member_role:'owner'}`.
- `departments`: UPDATE menos `whatsapp_api_key`/`whatsapp_instance_id`; INSERT das 2 colunas **não** revogado.
- `department_audit_logs`: só SELECT. ✅
- `team_message_receipts`: sem DELETE. ✅
- `storage.objects`: `authenticated` **mantém** UPDATE (o `REVOKE UPDATE ON storage.objects FROM authenticated` da `560000` não teve efeito visível — e é global, fora do escopo).

### 3.3 Policies (todas `{authenticated}`; `roles={public}` no escopo = 0 ✅)
- `team_messages`: SELECT membro · INSERT membro+`sender_id`=eu · UPDATE `team_messages_update_own` (USING/WITH CHECK `sender_id = current_profile_id()`) · DELETE remetente.
- `team_conversations`: SELECT membro ou criador · INSERT `created_by`=eu · UPDATE **só criador** (`team_conversations_update_own`) · DELETE criador ou admin.
- `team_conversation_members`: `tcm_select_own` (eu ou co-membro) · `tcm_insert_member` (co-membro **ou** `profiles.role` admin/supervisor; **sem** restrição de `member_role`) · `tcm_delete_own_or_admin` (**sem** regra do último owner) · `tcm_update_own_prefs`. As policies antigas "Admins can update any member row" e "Members and admins can view conversation members" foram dropadas **sem substituta** → admin não-membro não lista nem edita membros (só via `set_team_member_role`).
- `team_message_receipts`: SELECT (admin ou membro) · INSERT (eu + membro) · UPDATE own com `WITH CHECK (status='read')` + trigger anti-regressão. ✅
- `team_message_reactions`: 3 policies pré-existentes por `profiles.user_id = auth.uid()` (ok).
- `department_invitations`: `admin_all` por `is_admin_or_supervisor()`. ✅
- `department_invites`: 3 policies `USING (true)` — **continua aberta** (dropar só depois do front migrar, decisão E04b do plano).
- `department_audit_logs`: SELECT só admin/supervisor **do mesmo departamento** (`profiles.role`); o plano pedia admin global **ou** membro do depto.
- `departments`: `departments_select` (`true`) + `departments_admin_write`.
- **Storage `team-chat-files`** (4 policies): SELECT `"Conversation members can read team chat files"` `{public}` — a **inerte** (`tm.media_path = p.name`); a correta `"Team chat files readable by owner admin or conversation member"` foi **dropada** pela `560000`. INSERT `team_chat_files_insert` exige pasta `= current_profile_id()`; DELETE own exige pasta `= auth.uid()`; DELETE admin. Ver regressão R1.

### 3.4 Funções (todas `SECURITY DEFINER`, `search_path=public`, sem `anon` no `proacl`) ✅
`current_profile_id()` · `accept_department_invite(p_code)` · `create_department_invite(p_department_id, p_max_uses, p_expires_hours)` · `set_department_whatsapp_config(p_department_id, p_whatsapp_mode, p_api_key, p_instance_id)` · `get_department_whatsapp_credentials(p_department_id)` **service_role only** · `get_department_whatsapp_api_key(p_department_id)` service_role only · `department_audit_logs_fill_profile_name()` · `team_message_receipts_update_guard()` · pré-existentes: `get_team_conversation_previews()`, `get_team_unread_counts()`, `get_team_profiles()`, `is_team_conversation_member()`, `set_team_member_role()`, `find_or_create_direct_conversation()`.
**Ausentes (Fase 3 inteira):** `get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, `search_team_messages`, `toggle_team_reaction`, `set_team_member_pref`, `transfer_team_conversation_department`, `leave_team_group`, `remove_team_member`, view `team_message_read_state`.

### 3.5 Constraints, índices, triggers, realtime
- CHECKs novos: `department_invitations` (`code` 6–64 chars, `expires_at > created_at`, `max_uses >= 1`, `use_count >= 0`), `departments_whatsapp_mode_check`, `department_audit_logs_action_check` (12 ações), `team_messages_content_not_empty`, `team_messages_media_consistency` (`(media_url IS NULL) = (media_type IS NULL)`).
- **Ainda ausentes:** `media_type IN (...)`, `char_length(content) <= 10000`, coerência `media_bucket/media_path`, `reply_to_id <> id` + mesma conversa, CHECK de tipo em `team_conversations`, unique de canal por departamento, `last_read_at >= joined_at`, coerência `status/read_at` em receipts, `use_count <= max_uses`, formato `^[A-Z0-9]{8}$` do código, `char_length(emoji)`, `jsonb_typeof(metadata)`.
- **Índices duplicados criados hoje:** `idx_team_messages_conv_created` ≡ `idx_team_messages_conversation` (definição idêntica); `idx_team_messages_reply_to` (parcial) redundante com `idx_team_messages_reply_to_id`. `db_duplicate_indexes` no escopo saiu de 0 para 1 (+1 redundante).
- Triggers: `department_audit_logs_fill_profile_name_trig` ✅, `team_message_receipts_update_guard_trig` ✅, `after_team_message_insert_bump_conversation` (pré), `update_*_updated_at` (pré). Sem trigger de reply, de edição/48 h, de reação, de receipt do remetente, de consistência de `receipts.conversation_id`.
- Publication: `team_conversation_members`, `team_messages`, `team_message_reactions`, `team_message_receipts` — igual ao baseline. ✅ `team_messages` segue `REPLICA IDENTITY FULL`.
- `team_message_receipts.conversation_id` existe, FK CASCADE, índice parcial, **nullable**, sem trigger que force o valor (plano E51 pedia NOT NULL + trigger).

### 3.6 Ledger e artefatos derivados
- `max(version) = 20260928600000`; 18 versions `team_chat_*` de hoje registradas com SQL completo (regra 7 ✅).
- Arquivos em `main` para essas 18: **0**. Na branch da PR #1151: 18 (3 no commit `a2401d1`, 15 no `77cb72f`); só 15 têm cabeçalho "Rollback".
- `types.ts` em `main` (via #1154): tem `current_profile_id`, `accept_department_invite`, `get_department_whatsapp_credentials`; **não** tem `create_department_invite`, `set_department_whatsapp_config`, `get_department_whatsapp_api_key`. `schema-catalog.json`: parcialmente sincronizado (11 menções a `used_at/use_count/profile_name`).
- PR #1168 (`automation/types-sync`) é de **antes** dos applies (base `a935415`, só `schema-manifest.json`) — obsoleta.
- `version_reservations`: 2 reservas órfãs do Team Chat (`20260929090000`, `100000`), 5 reservas pendentes (`160000`–`200000`), 33 do Multiplix das quais **15 já consumidas pelo Team Chat**.

---

## 4. Regressões e divergências introduzidas hoje (29/09) — corrigir antes de qualquer etapa nova

| # | Sev. | Achado | Prova | Efeito |
|---|---|---|---|---|
| R1 | **P0** | `560000` dropou a policy SELECT **correta** do bucket e manteve a **inerte**; INSERT usa pasta `current_profile_id()`, SELECT/DELETE own usam `auth.uid()` (ids diferentes: 0 de 6 perfis têm `id = user_id`) | `pg_policies` em `storage.objects` (seção 3.3) | Agente comum não lê nem apaga os próprios anexos; só admin lê. Pior que 28/09 (então a policy boa existia). |
| R2 | **P0** | 15 migrations registradas em versões **reservadas por outra sessão** (`hermes-multiplix-bloco-a`, `450000`–`20260929080000`) | `version_reservations` × ledger | Multiplix vai colidir; `ON CONFLICT DO NOTHING` esconde. Precisa aviso + regra. |
| R3 | **P0** | 18 migrations em produção sem arquivo em `main`; PR que as carrega diz "NÃO MERGEAR"; `db-live-guard` vermelho (#1166) | `ls supabase/migrations` vs ledger | Drift idêntico ao incidente E40; catálogo/types/manifesto inválidos até mergear os espelhos. |
| R4 | P1 | `get_department_whatsapp_credentials` virou `service_role`-only, `jsonb` com a chave em claro, parâmetro `p_department_id`; o hook chama com `_department_id` como `authenticated` | `pg_proc` + `useDepartmentManagement.ts:106` | Aba WhatsApp do departamento: `access_denied`. O plano E19 pedia versão admin `(mode, instance_id, has_api_key)`. |
| R5 | P1 | `department_audit_logs`: INSERT revogado + `CHECK` com 12 ações que **não** incluem `delete_invite`, `add_member`, `save_whatsapp`; o hook insere direto com esses nomes (`:125-232`); `DepartmentAuditView` só rotula `create_invite`/`delete_invite` | ledger `530000`; grep no hook | 4 inserts do front falham em silêncio (erros ignorados). Três vocabulários de ação coexistem (hook, CHECK, plano E17). |
| R6 | P1 | `600000` cimenta `media_url` como fonte de verdade (`media_consistency` e `content_not_empty` olham `media_url`), contradizendo E26/E60 (`media_bucket/media_path`, `media_url` NULL) | `pg_constraint` | Quando o Bloco E parar de gravar `media_url`, todo envio de mídia falha no CHECK. |
| R7 | P1 | `create_department_invite`: código de 12 chars base64 (`+` possível — só `/` é trocado), grava o **código** em `details` da auditoria, sem `p_role`/`p_email`; `accept_department_invite` grava `status='used'` (front/plano: `pending|accepted|expired|revoked`), sem validação de e-mail, sem `already_member` | ledger `510000`/`520000` | Contrato diferente do que o front da Fase 7 vai consumir; `department_invitations.role` NOT NULL sem default explícito na RPC (conferir). |
| R8 | P1 | `tcm_insert_member` sem restrição de `member_role`; `member_role` continua editável pelo próprio membro (grant UPDATE não o exclui); DELETE sem regra do último owner | seção 3.2/3.3 | Membro se promove a `owner`; grupo pode ficar sem owner. |
| R9 | P2 | 6 policies novas usam `profiles.role IN ('admin','supervisor')` em vez de `is_admin_or_supervisor(auth.uid())` (`user_roles`) — hoje consistentes (0 divergentes de 6), mas são duas fontes de verdade | `pg_policies` | Divergência futura silenciosa entre módulos. |
| R10 | P2 | Policies "Admins can update any member row" e "Members and admins can view conversation members" dropadas sem substituta | ledger `580000` | Admin não-membro não vê nem edita membros de uma conversa. |
| R11 | P2 | `560000`: `REVOKE UPDATE ON storage.objects FROM authenticated` — global, fora do escopo congelado (E01), sem efeito visível ao vivo | ledger + `role_table_grants` | Statement enganoso no ledger; se um dia "pegar", quebra `AvatarUpload` (`upsert: true`). |
| R12 | P2 | 2 índices duplicados/redundantes criados (`idx_team_messages_conv_created`, `idx_team_messages_reply_to`) | `pg_indexes` | Custo de escrita; E49 pedia zero duplicados. |
| R13 | P2 | `team_conversations` UPDATE: `direct_member_a/b`, `created_at` editáveis pelo criador; sem policy para owner/admin de grupo | seção 3.2 | Criador pode "trocar" o par de uma direta; owner de grupo não renomeia. |
| R14 | P3 | `receipts.conversation_id` nullable sem trigger de consistência | seção 3.5 | Filtro realtime por `conversation_id` pode perder linhas. |
| R15 | P3 | Cabeçalhos das migrations: 3 sem bloco "Rollback"; "Estado ao vivo antes" genérico ("políticas antigas conflitantes") — regra 2/5 do plano | `grep -c Rollback` = 15/18 | Rastreabilidade. |

---

## 5. Status etapa por etapa — plano de conclusão de 29/09 (E01–E100)

Legenda: ✅ DONE (conferido ao vivo) · ◐ PARCIAL · ⚠ DIVERGENTE/REGRESSÃO · ✗ AUSENTE. "A:" = aplicado em produção.

### Fase 0 — Limpeza, identidade e baseline (E01–E08) — 1 ✅ · 1 ◐ · 6 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E01 sanear PR #1151 | ◐ | 45 migrations e 11 hooks removidos (`2b87032`; `git diff origin/main...branch -- src` vazio ✅). Mas a PR voltou a carregar 18 migrations (já aplicadas), continua draft com título "NÃO MERGEAR" e **não mergeou** — não é docs-only, e é justamente o que precisa entrar em `main` agora (R3). |
| E02 `current_profile_id()` | ✅ | A: `420000`; `prosecdef`, `search_path=public`, `proacl` sem `anon`; `types.ts` em `main` já tipa. |
| E03 snapshot baseline | ✗ | `docs/audits/team-chat-baseline-2026-09-29/` e `scripts/db-audit/team-chat-snapshot.mjs` não existem em `main` nem na branch. |
| E04 decisões (seção 10) | ✗ | Seção 10 do plano: "(preencher na E04)". |
| E05 teste de contrato RLS no `db-guard.yml` | ✗ | `scripts/db-audit/team-chat-rls.sql` inexistente; `db-guard.yml` sem job. **Policies foram aplicadas sem o teste que o plano exigia "antes de qualquer policy nova".** |
| E06 fixtures E2E/RLS | ✗ | `e2e/fixtures/` só tem `e2e-contact.ts`, `e2e-talkx.ts`. |
| E07 `team-chat-local-gates.sh` | ✗ | inexistente. |
| E08 mapa de PRs (seção 11) | ✗ | tabela com `—`. |

### Fase 1 — Bloco A′ segurança (E09–E24) — 6 ✅ · 7 ◐ · 2 ⚠ · 1 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E09 revoke TRUNCATE/TRIGGER/REFERENCES 9 tabelas | ✅ | A: `450000`; grants = 0. (Versão colide com reserva do Multiplix — R2.) |
| E10 revoke ALL de anon | ✅ | A: `460000`; anon = 0. |
| E11 UPDATE por coluna em `team_messages` | ✅ | A: `470000`; 3 colunas. |
| E12 policy UPDATE `team_messages` | ✅ | A: `480000`; 1 policy, `with_check` não nulo. (Os `DROP POLICY` citam 3 nomes, nenhum é o "Senders can edit own messages" do plano — o resultado ao vivo está certo, o arquivo não documenta o que dropou.) |
| E13 receipts: REVOKE DELETE + trigger + policy | ✅ | A: `490000`; trigger e `WITH CHECK (status='read')` ao vivo. |
| E14 `department_invitations` colunas/CHECKs | ◐ | A: `500000`; colunas ✅; CHECK de código é `length 6–64` (plano `^[A-Z0-9]{8}$`); falta `use_count <= max_uses`; índice parcial ✅. |
| E15 `accept_department_invite` | ◐ | A: `510000`; `FOR UPDATE`, `UPDATE profiles`, auditoria ✅; `status='used'`, sem checagem de e-mail, sem `already_member` (R7). |
| E16 `create_department_invite` | ◐ | A: `520000`; assinatura, tamanho do código, código na auditoria, `p_role/p_email` ausentes (R7); admin por `profiles.role` (R9). |
| E17 `department_audit_logs` hardening | ◐ | A: `530000`; REVOKE + trigger `profile_name` ✅; CHECK com vocabulário diferente do plano **e** do hook (R5); SELECT só admin do mesmo depto. |
| E18 `departments` WhatsApp | ◐ | A: `540000`; CHECK + REVOKE UPDATE 2 colunas + RPC ✅; sem REVOKE INSERT das colunas, sem auditoria `whatsapp_updated`. |
| E19 credentials sem chave | ⚠ | A: `550000`; contrato oposto ao plano (R4). |
| E20 storage `team-chat-files` | ⚠ | A: `560000`; **regressão** (R1) + REVOKE global (R11). |
| E21 `team_conversations` UPDATE | ◐ | A: `570000`; só criador; grant por exclusão de 3 colunas (R13). |
| E22 `team_conversation_members` policies | ◐ | A: `580000`; 4 policies `TO authenticated` ✅; sem último-owner, sem restrição de `member_role`, admin sem UPDATE (R8, R10). |
| E23 zero `roles={public}` | ✅ | A: `430000` + `580000`; contagem = 0. |
| E24 fechamento A′ | ✗ | Sem merge, sem `types-sync` pós-apply, `db-live-guard` vermelho, sem snapshot/diff, sem asserts. |

### Fase 2 — Bloco B′ integridade (E25–E36) — 0 ✅ · 0 ◐ · 1 ⚠ · 11 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E25 CHECK `media_type` + 10000 chars | ⚠ | A: `600000` ("e25_team_messages_integrity") faz **outra coisa**: `is_edited NOT NULL DEFAULT false`, `content_not_empty`, `media_consistency` por `media_url` (R6) e 2 índices duplicados (R12). Nem `media_type IN (...)` nem `char_length(content)` existem. |
| E26–E30 | ✗ | Versões `20260929160000`–`200000` **reservadas às 13:27–13:28** pela sessão paralela; nada aplicado às 13:29. |
| E31–E36 | ✗ | — |

### Fase 3 — Bloco C′ RPCs/perf (E37–E50) — 0 ✅ · 14 ✗
Nenhuma das 9 RPCs nem a view existem (seção 3.4). E47: `relreplident='f'`. E49: duplicados **aumentaram**. E48: `get_team_conversation_previews`/`get_team_unread_counts` sem `COMMENT` de deprecação.

### Fase 4 — Bloco D′ realtime (E51–E54) — 0 ✅ · 1 ◐ · 3 ✗
| Etapa | Status | Evidência |
|---|---|---|
| E51 `receipts.conversation_id` | ◐ | A: `440000`; coluna + backfill + FK CASCADE + índice parcial ✅; **nullable**, sem trigger (R14). |
| E52 decisão publication | ✗ | estado ao vivo = desejado, decisão não registrada. |
| E53 README de canais | ✗ | `src/hooks/team-chat/README.md` foi apagado em `2b87032` e não reescrito. |
| E54 `types.ts` com as 6 RPCs | ✗ | `grep -c` das 6 = 0. |

### Fase 5 — Camada de dados do front (E55–E66) — 0 ✅ · 2 ◐ · 10 ✗
Branch reverteu `src/` para `main`; `main` está no estado de 28/09. `queryKeys.ts`, `useMarkConversationRead.ts` não existem em lugar nenhum. `useTeamMessages.ts:21-23` `limit(200)` + `reverse()`; `useTeamConversations.ts:17-37` 3 queries + 2 RPCs; uploads com `profile.id` + `getPublicUrl` (`TeamFileUploader.tsx:66-76`, `useTeamChatDraft.ts:68-76`, `useTeamChatPanel.ts:247`); `useTeamChatMutations.ts:4` ainda `use-toast`; `:151` `update({is_muted})` direto. ◐ apenas E61 (`useResolvedStorageUrl` existe no inbox, não no módulo) e E65 (`useTeamChatDraft` funcional, sem teste).

### Fase 6 — Ligar componentes e UX (E67–E78) — 0 ✅ · 3 ◐ · 9 ✗
Idêntico a 28/09: `TeamChatPanel.tsx` 273 linhas, 0 `ErrorBoundary`, reply duplicado (`:194-217`), helpers locais (`:24-64`); órfãos com 0 importadores medidos hoje: `TeamMessageItem.tsx`, `TransferConversationDialog.tsx`, `GroupManagementDialog.tsx`, `TeamPerformancePanel.tsx`, `ParticipantStatsGraph.tsx`, `TeamChatA11y.tsx`, `useTeamPresence.ts`, `useTeamTyping.ts`, `useTeamUnreadCount.ts`, `team-chat-tokens.css`, `scripts/team-chat-db-validate.mjs`; Fixar/Arquivar `disabled` (`TeamChatHeader.tsx:266-273`); Performance "em breve" (`:150-156`); `is_active` em `TeamMemberDetails.tsx:77`, `TeamMemberProfileHeader.tsx:74,81-82`; `s.tts.set*` (`TeamChatPanel.tsx:118,140`); `bg-card|bg-primary|hover:bg-black/5` em 8 pontos. ◐: E72 (busca client-side), E73 (chips/listbox sem debounce/arquivadas/`canManageDepartments` — `TeamChatView` não passa), E77 (handlers existem, Panel não usa).

### Fase 7 — Departamentos (E79–E85) — 0 ✅ · 1 ◐ · 6 ✗
`useDepartmentManagement.ts` intacto e **agora mais quebrado** (R4, R5): grava em `department_invites` (`:86,122,144`), `department_whatsapp_configs` inexistente (`:226`), `profile_id: user?.id` (auth uid) em 5 pontos, chama RPC com `_department_id` (`:106`). Sem "Entrar via Código"; `isChannelMember` bloqueia admin (`TeamChatPanel.tsx:75`); `DepartmentManagementDialog` nunca abre. ◐: E82 (views existem, sem `use_count`/status/revogar).

### Fase 8 — Notificações, presença, digitação (E86–E91) — 0 ✅ · 1 ◐ · 5 ✗
`Sidebar.tsx` sem badge Teams; listener em `TeamChatView.tsx:20` com canal fixo; `useTeamTyping`/`useTeamPresence` órfãos; `MentionAutocomplete` via `get_team_profiles`; sem `notificationclick`. ◐: E91 (`removeChannel` nos cleanups; sem `system`/`CHANNEL_ERROR`, sem `refetchOnReconnect`).

### Fase 9 — Testes, faxina e fechamento (E92–E100) — 0 ✅ · 9 ✗
`team-chat-comprehensive.test.ts` 219 e `team-chat-security-gaps.test.ts` 52 `expect(true).toBe(true)`; `team-chat-exhaustive-audit.test.ts` e `rls-contract.test.ts` intactos; 88 entradas `team-chat` no `eslint-baseline.json` (8 arquivos, incl. 9 avisos "Cannot access refs during render" em `TeamChatPanel.tsx:102-116`); sem `e2e/team-chat.spec.ts`; CLAUDE.md sem seção Team Chat; `pg_stat_statements` não medido.

### Totais
| | E01–E08 | A′ | B′ | C′ | D′ | E | F/G | H | I | J | **Total** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ✅ | 1 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **7** |
| ◐ | 1 | 7 | 0 | 0 | 1 | 2 | 3 | 1 | 1 | 0 | **16** |
| ⚠ | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| ✗ | 6 | 1 | 11 | 14 | 3 | 10 | 9 | 6 | 5 | 9 | **74** |

---

## 6. O que falta — lista consolidada (entrada do plano de finalização)

**A. Reconciliação imediata (bloqueia tudo)**
1. Espelhos das 18 migrations em `main` (mergear a PR #1151 como está, ou PR nova só com os 18 arquivos + docs) → paridade arquivos↔ledger → `types-sync` novo → `db-live-guard` verde → fechar #1166 e a #1168 obsoleta.
2. Corrigir R1 (storage), R2 (aviso ao Multiplix + registro), R6 (CHECKs de mídia), R12 (índices), R4/R5 (contratos que quebraram o front) — **antes** do Bloco B′ continuar.
3. Congelar a sessão paralela até 1–2 estarem em `main` (regra 9 do plano de 29/09).

**B. Completar o Bloco A′ conforme contrato do plano:** último owner, `member_role` só por RPC, owner/admin de grupo no UPDATE de conversa, CHECK formato do código (8 chars `[A-Z0-9]`), `use_count <= max_uses`, status `accepted`, RPC de convite com `p_role/p_email/p_ttl`, credencial WhatsApp para admin sem chave, auditoria com vocabulário único, `is_admin_or_supervisor()` em todas as policies, teste de contrato RLS no CI, fixtures, gates locais, snapshot, decisões, mapa de PRs.

**C. Blocos B′, C′, D′ inteiros** (E25 real, E26–E36; E37–E50; E51 NOT NULL + trigger, E52–E54).

**D. Front inteiro** (E55–E91): hooks (inbox 1 RPC, paginação keyset, mark-as-read por RPC, upload com pasta e `media_bucket/path`, mutações por RPC, `sonner`), ligar os 11 órfãos ou apagá-los, tokens, header, lista, grupo, transferência, presença real, TTS, estatísticas, departamentos (convites, WhatsApp, auditoria, "Entrar via Código", admin em canal), badge sidebar, listener global, digitando, menções, push→conversa, hardening realtime.

**E. Qualidade e fechamento** (E92–E100): testes reais, RTL, faxina de órfãos, baseline ESLint zerado, E2E, `pg_stat_statements`, drop das RPCs antigas, teste com 2 usuários, CLAUDE.md.

**F. Processo (a causa raiz recorrente):** DDL aplicado de branch aberta 3× em setembro; reserva de versão ignorada; "uma sessão, um bloco" ignorado no mesmo dia em que foi escrito. O plano de finalização coloca isso como etapas com aceite verificável, não como aviso.

---

*Auditoria feita em 2026-09-29 13:30 UTC contra `main` @ `e433589`, branch `claude/confident-babbage-ivgmmn` @ `77cb72f` e banco ao vivo. Plano sucessor: `PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md`.*
