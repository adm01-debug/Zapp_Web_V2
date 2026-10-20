# PLANO — Team Chat V2: finalização da implantação (100 etapas) — 2026-09-29

**Status:** PLANEJADO — nada executado.
**Origem:** `AUDITORIA_TEAM_CHAT_ESTADO_REAL_2026-09-29.md` (7 DONE · 16 PARCIAL · 3 REGRESSÃO · 74 AUSENTE sobre o plano de conclusão de 29/09; 18 migrations em produção sem arquivo em `main`; 3 regressões P0).
**Sucede** `PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` (branch da PR #1151), que sucedeu os de 28/09 e 27/09. **Não reabrir nenhum deles**; este arquivo é o único ledger vivo do módulo a partir de agora.
**Base:** `main` @ `e433589` · ledger `max(version) = 20260928600000` · reservas pendentes do Team Chat: `20260929090000`, `100000` (órfãs), `160000`–`200000` (E26–E30 do plano anterior, sessão `confident-babbage`).

> **Por que um plano novo em vez de continuar o de 29/09:** o de 29/09 diz "nada executado", mas 18 migrations dele foram aplicadas em produção **fora do fluxo** (direto da branch, em versões reservadas por outra sessão) com 3 regressões. Continuar a numeração antiga esconderia isso. Aqui, F01–F14 reconciliam o que já está no banco; o resto reaproveita o conteúdo técnico do plano de 29/09 corrigido pelo que foi medido.

---

## 0. Verdades que todas as etapas respeitam (medidas ao vivo em 29/09; herdam as 11 do plano anterior)

| Verdade | Regra derivada |
|---|---|
| `profiles.id ≠ auth.uid()` (0 de 6) | perfil só por `public.current_profile_id()` (**já existe**, `420000`) ou `is_team_conversation_member(auth.uid(), cid)` |
| Admin canônico = `is_admin_or_supervisor(auth.uid())` sobre `user_roles`; `profiles.role` é espelho | policy/RPC nova **nunca** lê `profiles.role` para autorizar |
| A pasta de upload já aplicada é `current_profile_id()` (`team_chat_files_insert`) e o front já usa `profile.id` | convenção definitiva: `<profiles.id>/<conversation_id>/<uuid>.<ext>` — as policies de SELECT/DELETE seguem a **mesma** função; nunca `auth.uid()` em storage deste bucket |
| `media_bucket/media_path` é a fonte da mídia; `media_url` é legado | nenhum CHECK novo referencia `media_url`; os dois de `600000` são substituídos (F07) |
| `department_audit_logs.action` tem **um** vocabulário (F09): `invite_created, invite_revoked, invite_accepted, member_added, member_removed, whatsapp_updated, department_transferred, access_requested` | hook, CHECK e badges usam a mesma lista; INSERT só por RPC/trigger |
| Versão de migration **sempre** por `SELECT supabase_migrations.reserve_migration_version('team-chat-final','F##')` no mesmo turno do arquivo, e a reserva é conferida contra o ledger **imediatamente antes** do apply | versão não reservada pela própria sessão não se aplica (R2) |
| Uma sessão, um bloco; bloco DDL só começa com o anterior **em `main`** e `db-live-guard` verde | reservar versão do bloco N+1 antes disso é violação, não adiantamento |
| Toda migration: cabeçalho `-- Objetivo`, `-- Estado ao vivo antes (query + resultado + data)`, `-- Rollback`, e bloco final `DO $$ … ASSERT … $$` | migration sem os 4 não entra em PR |

### Regras de execução
1. DDL: arquivo → PR → **merge em `main`** → apply por `db_query` na mesma transação do `INSERT` no ledger gerado por `register-migration.mjs` → `usage-guard` `novas: 0` → paridade → `types-sync` mergeado. **Exceção zero** (o "aditivo pode ir antes" do CLAUDE.md não vale para este módulo até o fim deste plano — três drifts em setembro vieram daqui).
2. PRs de DDL ficam abertas aguardando Joaquim (regra 8 do fluxo Git). PRs de front mergeiam com CI verde.
3. Front só chama RPC que já está em `types.ts` de `main`.
4. Tokens de tema, `sonner`, pt-BR fixo, zero re-fix de hash no `eslint-baseline.json`.
5. Cada etapa tem aceite verificável; etapa DDL fecha com o objeto conferido ao vivo.

---

## FASE 0 — Reconciliação de emergência (F01–F14)
*Bloco R — 2 PRs: (a) espelhos + docs (F02–F05), (b) DDL corretiva (F06–F11). Nada de novo entra antes de F14.*

- [ ] **F01** — Congelar a sessão paralela: comentário na PR #1151 e neste arquivo dizendo que as reservas `20260929160000`–`200000` **não** serão aplicadas até F14; as reservas órfãs `090000`/`100000` ficam registradas como consumidas por `450000`/`470000`. **Aceite:** comentário postado; nenhuma version nova `team_chat_*` no ledger entre F01 e F14.
- [ ] **F02** — Espelhos em `main`: PR **nova** a partir de `main` com os 18 arquivos `20260928420000`–`600000` copiados **byte a byte** da branch `claude/confident-babbage-ivgmmn` @ `77cb72f` (não editar conteúdo: o ledger é a verdade; o guard "Rejeitar edicao de migration ja existente" só olha `main`). Completar o cabeçalho `-- Rollback` nos 3 arquivos que não têm (só comentário, não altera statements). **Aceite:** para cada version, `parseMigrationFile()` de `register-migration.mjs` produz `statements` idênticos aos do ledger (script de comparação commitado em `scripts/db-audit/team-chat-ledger-parity.mjs`; saída `18/18 iguais`).
- [ ] **F03** — Mesma PR: esta auditoria + este plano + nota de 3 linhas no topo do `PLANO_TEAM_CHAT_CONCLUSAO…` (na branch #1151, se ela for mergeada) apontando para cá. Mergear. **Aceite:** PR mergeada; `ls supabase/migrations | grep team_chat | wc -l` = 20 (2 de 27/09 + 18).
- [ ] **F04** — `types-sync` disparado após F03; PR automática mergeada; fechar #1168 (obsoleta, base `a935415`) **depois** de confirmar que o manifesto novo entrou. **Aceite:** `grep -c "create_department_invite\|set_department_whatsapp_config\|get_department_whatsapp_api_key" src/integrations/supabase/types.ts` = 3; `schema-catalog.json` e `schema-manifest.json` regenerados.
- [ ] **F05** — `db-live-guard` via `workflow_dispatch` verde; fechar issue #1166 com link do run. Decidir a PR #1151: se F02 entrou por PR nova, fechar #1151 **depois** de confirmar que os 18 arquivos e os 2 docs estão em `main` (nunca fechar PR alheia sem essa confirmação). **Aceite:** issue fechada; run verde.
- [ ] **F06** — DDL corretiva 1/6 — storage (R1): `DROP POLICY "Conversation members can read team chat files"` (inerte); `DROP POLICY "Users can delete own team chat files"`; recriar `team_chat_files_select` `FOR SELECT TO authenticated USING (bucket_id='team-chat-files' AND ((storage.foldername(name))[1] = current_profile_id()::text OR is_admin_or_supervisor(auth.uid()) OR is_team_conversation_member(auth.uid(), ((storage.foldername(name))[2])::uuid)))` e `team_chat_files_delete_own` com o mesmo predicado de pasta; manter `Admins can delete team chat files` e `team_chat_files_insert`. **Aceite:** `pg_policies` → 1 SELECT, 1 INSERT, 2 DELETE, todas `{authenticated}`, nenhuma com `auth.uid()::text` em `foldername`.
- [ ] **F07** — DDL 2/6 — mídia (R6): `DROP CONSTRAINT team_messages_media_consistency, team_messages_content_not_empty`; criar `team_messages_media_source CHECK (message_type IN ('text','system') OR (media_bucket = 'team-chat-files' AND media_path IS NOT NULL))`, `team_messages_content_or_media CHECK (trim(content) <> '' OR media_path IS NOT NULL)`, `team_messages_media_type_check CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document','sticker','emoji','audio_meme'))`, `team_messages_content_len CHECK (char_length(content) <= 10000)`; `COMMENT ON COLUMN media_url 'deprecated'`. Conferir antes que as 2 mensagens reais passam (`SELECT count(*) WHERE NOT (<predicados>)` = 0). **Aceite:** INSERT de imagem sem `media_path` falha; `media_type='gif'` falha; texto de 10.001 chars falha.
- [ ] **F08** — DDL 3/6 — índices (R12): `DROP INDEX idx_team_messages_conv_created, idx_team_messages_reply_to`. **Aceite:** `db_duplicate_indexes` no escopo = 0.
- [ ] **F09** — DDL 4/6 — auditoria (R5): `DROP CONSTRAINT department_audit_logs_action_check` e recriar com o vocabulário único da seção 0; policy SELECT recriada `USING (is_admin_or_supervisor(auth.uid()) OR department_id = (SELECT department_id FROM profiles WHERE id = current_profile_id()))`. `accept_department_invite`/`create_department_invite` passam a gravar `invite_accepted`/`invite_created` (`CREATE OR REPLACE`, mesma assinatura — só o literal muda) e **sem** o código em `details`. **Aceite:** `SELECT` do CHECK ao vivo lista as 8 ações; RPCs gravam os nomes novos.
- [ ] **F10** — DDL 5/6 — WhatsApp de departamento (R4): `get_department_whatsapp_config(p_department_id uuid) RETURNS TABLE (mode text, instance_id text, has_api_key boolean)` STABLE SECDEF, exige `is_admin_or_supervisor(auth.uid())`, `GRANT TO authenticated`; `set_department_whatsapp_config` ganha auditoria `whatsapp_updated` (sem chave); `REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id) ON departments FROM authenticated`. `get_department_whatsapp_credentials`/`_api_key` ficam `service_role` (já estão). **Aceite:** admin recebe 1 linha/3 colunas; agente → `not_authorized`; `column_privileges` sem INSERT/UPDATE nas 2 colunas.
- [ ] **F11** — DDL 6/6 — membership (R8, R10, R13): `REVOKE UPDATE (member_role) ON team_conversation_members FROM authenticated` (papel só por `set_team_member_role`); `tcm_insert_member` recriada `WITH CHECK (member_role = 'member' AND (is_team_conversation_member(auth.uid(), conversation_id) OR is_admin_or_supervisor(auth.uid()) OR NOT EXISTS (SELECT 1 FROM team_conversation_members x WHERE x.conversation_id = conversation_id)))`; `tcm_delete_own_or_admin` recriada com a regra do último owner; policy `tcm_select_admin` (`is_admin_or_supervisor`) e `tcm_update_admin`; `REVOKE UPDATE (direct_member_a, direct_member_b, created_at) ON team_conversations FROM authenticated`; `team_conversations_update_own` recriada `USING (created_by = current_profile_id() OR is_admin_or_supervisor(auth.uid()) OR EXISTS (membro owner/admin))`. **Aceite:** `PATCH member_role` → 42501; único owner tenta sair → 0 linhas; owner de grupo renomeia.
- [ ] **F12** — Padronizar autorização (R9): as 6 policies/RPCs de hoje que usam `profiles.role IN (...)` (`tcm_insert_member`, `tcm_delete_own_or_admin`, `dept_audit_select_own_dept`, `create_department_invite`, `set_department_whatsapp_config`, e a que F11 recriar) passam a `is_admin_or_supervisor(auth.uid())`. Pode ir nas migrations F09–F11 quando o objeto já está sendo recriado. **Aceite:** `grep -c "p.role IN" <(SELECT qual||with_check FROM pg_policies WHERE tablename LIKE 'team_%' OR tablename LIKE 'department%')` = 0; `pg_get_functiondef` das 2 RPCs sem `profiles.role`.
- [ ] **F13** — Aviso e regra da colisão (R2): comentário na PR/branch do Multiplix (`hermes-multiplix-bloco-a`) listando as 15 versões consumidas (`450000`–`600000`) e pedindo reserva de faixa nova; `register-migration.mjs --apply` passa a **abortar** se a version não estiver em `version_reservations` com `holder` igual ao informado em `--holder` (flag nova, obrigatória para o escopo `team_chat_*`). **Aceite:** comentário postado; teste unitário do script cobre "version reservada por outro holder → exit 1".
- [ ] **F14** — Fechamento do Bloco R: PR (b) mergeada e aplicada (F06–F12, 6 migrations, versões reservadas por `team-chat-final`), `types-sync` mergeado, `db-live-guard` verde, snapshot `docs/audits/team-chat-baseline-2026-09-29/pos-bloco-R/` gerado por `scripts/db-audit/team-chat-snapshot.mjs` (E03 do plano anterior, agora aqui). Só então a sessão paralela pode retomar (F15+). **Aceite:** snapshot commitado; `db-live-guard` verde; seção 11 com as 2 PRs.

## FASE 1 — Bloco A″: completar a segurança e a governança (F15–F26)
*1 PR de DDL (F15–F20) + 1 PR de CI/docs (F21–F26). DDL aguarda Joaquim.*

- [ ] **F15** — `department_invitations`: `DROP CONSTRAINT department_invitations_code_format`; `CHECK (code ~ '^[A-Z0-9]{8}$')`; `CHECK (use_count <= max_uses)`; `CHECK (status IN ('pending','accepted','expired','revoked'))`. **Aceite:** código de 7 chars ou com `+` falha.
- [ ] **F16** — `DROP FUNCTION create_department_invite(uuid, integer, integer)` e criar `create_department_invite(p_department_id uuid, p_role text DEFAULT 'agent', p_email text DEFAULT '', p_max_uses int DEFAULT 1, p_ttl interval DEFAULT '7 days') RETURNS jsonb` (código `[A-Z0-9]{8}` com até 5 retries em 23505; `created_by = current_profile_id()`; auditoria `invite_created` sem código). **Aceite:** 10 chamadas → 10 códigos válidos pelo CHECK de F15.
- [ ] **F17** — `accept_department_invite(p_code)` (`CREATE OR REPLACE`): `status = 'accepted'` ao esgotar; erro `already_member` se `profiles.department_id` já é o do convite; valida `email = '' OR email = (SELECT email FROM profiles WHERE id = v_me)`; erro `invite_exhausted` mantido. **Aceite:** 2 sessões concorrentes com `max_uses=1` → 1 ok, 1 `invalid_or_expired_code`; membro → `already_member`.
- [ ] **F18** — `team_message_receipts`: `CHECK ((status='delivered' AND read_at IS NULL) OR (status='read' AND read_at IS NOT NULL))`, `CHECK (read_at IS NULL OR read_at >= delivered_at)`; trigger `BEFORE INSERT` que rejeita recibo do próprio remetente; `conversation_id` → `NOT NULL` + trigger `BEFORE INSERT OR UPDATE OF message_id` que força o valor (fecha E51/R14). **Aceite:** 3 INSERTs inválidos falham; `conversation_id` errado é corrigido.
- [ ] **F19** — `COMMENT ON FUNCTION get_team_conversation_previews(), get_team_unread_counts() IS 'deprecated: usar get_team_inbox() (F33)'`; `COMMENT ON` nas 5 tabelas `team_*`, `department_invitations`, `department_audit_logs` e colunas não óbvias (`direct_member_a/b`, `member_role`, `media_bucket/media_path`, `metadata`, `use_count/max_uses`, `receipts.conversation_id`). **Aceite:** `obj_description` não nulo para as 7 tabelas.
- [ ] **F20** — Fechamento A″ (DDL): apply F15–F19, ledger, guard, paridade, `types-sync`, `db-live-guard`, snapshot `pos-bloco-A`. **Aceite:** igual a F14.
- [ ] **F21** — Teste de contrato RLS no CI: job em `db-guard.yml` (Postgres 17 já sobe lá) aplica as migrations do escopo num banco limpo, cria 3 perfis com `profiles.id ≠ user_id` (admin/membro/estranho) + `user_roles`, roda `scripts/db-audit/team-chat-rls.sql` com `SET ROLE authenticated; SET request.jwt.claims`. Asserts iniciais: estranho não lê mensagens; membro lê; membro não move mensagem (42501 em `conversation_id`); `TRUNCATE` negado; `PATCH member_role` negado; último owner não sai; agente lê o próprio anexo e o de outro membro (F06); agente não lê anexo de conversa alheia; código de convite não reutiliza. **Aceite:** job verde em `main`; remover uma policy localmente faz o job falhar (provar no corpo da PR).
- [ ] **F22** — Fixtures E2E/RLS em produção: 2 usuários `[E2E]` (admin e agent) com `profiles` + `user_roles`, 1 departamento `[E2E]`, 1 grupo, 1 direta, documentados em `e2e/fixtures/team-chat.ts`. **Aceite:** ids no fixture; `SELECT` confirma; **não apagar** (mesma regra dos fixtures do Talk X).
- [ ] **F23** — `scripts/ci/team-chat-local-gates.sh` (`tsc -b --force`, `lint-ratchet`, `typecheck-ratchet`, `implicit-any`, `supabase-usage-guard`, `vitest run src/hooks/team-chat src/components/team-chat`). Toda PR deste plano cola a saída no corpo. **Aceite:** script commitado; PR de F21 já o usa.
- [ ] **F24** — Decisões registradas na seção 10 deste arquivo: (a) badge = `last_read_at`, receipts só por RPC; (b) convites só em `department_invitations`, `department_invites` dropada em F78; (c) `owner` = dono, ≥ 1 owner por grupo; (d) presença = `useAgentPresenceMap`; (e) pt-BR fixo; (f) tokens de `src/styles/tokens.css`; (g) pasta de storage = `profiles.id`; (h) vocabulário de auditoria da seção 0; (i) `announcement` fora; (j) sem virtualização nesta rodada. **Aceite:** seção 10 preenchida.
- [ ] **F25** — CLAUDE.md ganha seção curta "Team Chat — como aplicar DDL neste módulo" (reserva obrigatória por holder, uma sessão um bloco, pasta de storage, helper `current_profile_id()`), no mesmo PR de F21–F24. **Aceite:** seção presente; sem tocar o resto do arquivo.
- [ ] **F26** — Fechamento A″ (CI/docs): PR mergeada; seção 11 atualizada. **Aceite:** 2 PRs listadas com número e data.

## FASE 2 — Bloco B″: integridade do modelo (F27–F36)
*1 PR de DDL. Aguarda Joaquim. Reaproveita as reservas `20260929160000`–`200000` se a sessão dona for a executora; senão, reservar novas e deixar as antigas registradas como abandonadas na seção 11.*

- [ ] **F27** — `team_messages`: `CHECK (reply_to_id IS NULL OR reply_to_id <> id)` + trigger `BEFORE INSERT OR UPDATE OF reply_to_id` que valida mesma `conversation_id` (`RAISE 'reply_cross_conversation'`). **Aceite:** reply cruzado falha.
- [ ] **F28** — `team_messages`: trigger `BEFORE UPDATE OF content` → `is_edited := true, updated_at := now()`; rejeita `created_at < now() - interval '48 hours'` (`edit_window_expired`). **Aceite:** UPDATE só de `content` reflete `is_edited=true`.
- [ ] **F29** — `team_conversations`: CHECK por tipo (`direct` com par ordenado, sem nome/depto; `group` com nome, sem par/depto; `department` com depto, sem par), `CHECK (char_length(name) <= 60)`; `find_or_create_direct_conversation` comparando `uuid` nativo (`CREATE OR REPLACE`, mesma assinatura). Conferir antes que as 2 conversas reais passam. **Aceite:** direta sem membros falha; RPC idempotente.
- [ ] **F30** — `team_conversations`: `CREATE UNIQUE INDEX team_conversations_department_unique ON team_conversations (department_id) WHERE type='department'`; FK `department_id` `ON DELETE CASCADE` (hoje sem ação — conferido ao vivo: `REFERENCES departments(id)` sem cláusula). **Aceite:** 2º canal do mesmo depto → 23505.
- [ ] **F31** — `team_conversation_members`: `CHECK (last_read_at IS NULL OR last_read_at >= joined_at)`; `CREATE INDEX idx_team_members_profile_active ON team_conversation_members (profile_id) WHERE NOT is_archived`; `DROP INDEX idx_team_members_profile`. **Aceite:** `pg_indexes` sem o antigo.
- [ ] **F32** — `team_message_reactions`: trigger que força `conversation_id` a partir da mensagem; `CHECK (char_length(emoji) BETWEEN 1 AND 16)`; policy INSERT recriada `TO authenticated WITH CHECK (profile_id = current_profile_id() AND is_team_conversation_member(auth.uid(), (SELECT conversation_id FROM team_messages WHERE id = message_id)))`. **Aceite:** `conversation_id` errado corrigido; reação em conversa alheia falha.
- [ ] **F33** — Migrations-espelho dos drifts antigos: `ALTER TABLE team_conversations ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'` + `CHECK (jsonb_typeof(metadata)='object')`; `ALTER PUBLICATION supabase_realtime ADD TABLE team_message_reactions` guardado por `DO $$ IF NOT EXISTS $$`. **Aceite:** `check-migration-drift.mjs` limpo.
- [ ] **F34** — `ALTER TABLE team_messages REPLICA IDENTITY DEFAULT` (grep `payload.old` no módulo = vazio). **Aceite:** `relreplident='d'`.
- [ ] **F35** — `department_invites`: **ainda não dropar** (front usa) — só `REVOKE INSERT, UPDATE, DELETE FROM authenticated` e policy SELECT restrita a admin, para fechar a superfície aberta até F78. **Aceite:** agente não lista códigos.
- [ ] **F36** — Fechamento B″: apply, ledger, guard, `types-sync`, `db-live-guard`, asserts F21 estendidos (reply cruzado, mídia sem path, 2º canal), snapshot `pos-bloco-B`. **Aceite:** igual a F14.

## FASE 3 — Bloco C″: RPCs e performance (F37–F48)
*1 PR de DDL. Aguarda Joaquim. Contratos = os que o front (Fase 5) consome; mudar um exige mudar os dois.*

- [ ] **F37** — `get_team_inbox(p_include_archived boolean DEFAULT false) RETURNS TABLE (conversation_id, type, name, avatar_url, department_id, created_by, created_at, updated_at, member_role, is_pinned, is_muted, is_archived, last_read_at, unread_count int, last_message_id, last_message_content, last_message_type, last_message_sender_id, last_message_sender_name, last_message_created_at, other_profile_id, other_name, other_avatar_url, member_count int)` STABLE SECURITY INVOKER, `ORDER BY is_pinned DESC, updated_at DESC`, sem LIMIT/OFFSET. **Aceite:** `EXPLAIN (ANALYZE, BUFFERS)` sem Seq Scan em `team_messages`; devolve as 2 conversas reais com `other_name` na direta.
- [ ] **F38** — `CREATE INDEX idx_team_messages_conv_created_id ON team_messages (conversation_id, created_at DESC, id DESC)`; `DROP INDEX idx_team_messages_conversation`. **Aceite:** F39 usa o novo.
- [ ] **F39** — `get_team_messages_page(p_conversation_id, p_before_created_at DEFAULT NULL, p_before_id DEFAULT NULL, p_limit DEFAULT 50) RETURNS TABLE (…, sender_name, sender_avatar_url, …, reactions jsonb)` STABLE INVOKER, keyset `(created_at, id)`, `LIMIT least(p_limit,100)`. **Aceite:** 3 páginas sobre 120 msgs sintéticas (transação revertida) sem repetir/pular; Index Scan Backward.
- [ ] **F40** — `mark_team_conversation_read(p_conversation_id) RETURNS int` SECDEF: exige membership; `UPDATE last_read_at` + `INSERT … receipts … ON CONFLICT DO UPDATE` só de mensagens alheias após o `last_read_at` antigo. **Aceite:** 100 msgs não lidas → 1 chamada → 2 statements; `unread_count` = 0.
- [ ] **F41** — View `team_message_read_state (message_id, conversation_id, member_count, read_count, all_read)` `security_invoker = on`. **Aceite:** `all_read` só quando todos os outros leram.
- [ ] **F42** — `search_team_messages(p_conversation_id, p_query, p_limit DEFAULT 50) RETURNS TABLE (id, created_at, sender_id, snippet)` STABLE INVOKER; rejeita < 2 chars; escapa `%`/`_`; usa `idx_team_messages_content_trgm`. **Aceite:** Bitmap Index Scan no trgm; 1 char → erro.
- [ ] **F43** — `toggle_team_reaction(p_message_id, p_emoji) RETURNS boolean` INVOKER (`DELETE … RETURNING` → se 0, `INSERT`). **Aceite:** 2 chamadas voltam ao estado inicial.
- [ ] **F44** — `set_team_member_pref(p_conversation_id, p_is_pinned DEFAULT NULL, p_is_muted DEFAULT NULL, p_is_archived DEFAULT NULL) RETURNS void` INVOKER (`coalesce(param, col)`). **Aceite:** só `p_is_muted` não toca `is_pinned`.
- [ ] **F45** — `transfer_team_conversation_department(p_conversation_id, p_to_department_id) RETURNS jsonb` SECDEF admin-only, só `type='department'`, `metadata || {transferred_at, transferred_by, original_department_id}`, erro `department_channel_exists`, auditoria `department_transferred`. **Aceite:** agente → `not_authorized`; admin → metadata preenchido.
- [ ] **F46** — `leave_team_group(p_conversation_id)` e `remove_team_member(p_conversation_id, p_profile_id)` SECDEF: último owner + promoção do membro mais antigo; grupo com 0 membros é deletado. **Aceite:** owner sai de grupo de 3 → outro vira owner.
- [ ] **F47** — `set_profile_department(p_profile_id, p_department_id)` SECDEF admin-only com auditoria `member_added`/`member_removed`; `request_department_access(p_department_id)` SECDEF que insere `app_notifications` para admins do depto (`app_notifications` não tem policy INSERT para `authenticated` — conferido em 29/09) com auditoria `access_requested`; `notify_team_mentions(p_message_id)` SECDEF. Três migrations. **Aceite:** agente não muda depto de outro; notificação criada.
- [ ] **F48** — Fechamento C″: apply, ledger, guard, `types-sync`, `db-live-guard`; `EXPLAIN (ANALYZE, BUFFERS)` de F37/F39/F40/F42 em `diff-bloco-C.md`; asserts F21 para F43/F44/F46; `db_duplicate_indexes` = 0; snapshot `pos-bloco-C`. **Aceite:** `grep -c` das 9 RPCs novas em `types.ts` = 9.

## FASE 4 — Bloco D″: realtime e contratos do front (F49–F52)

- [ ] **F49** — Decisão de publication registrada (seção 10): `team_messages`, `team_message_reactions`, `team_message_receipts`, `team_conversation_members`; `team_conversations` fora. Estado ao vivo já é este. `realtime-publication-baseline.json` e `runtime-config.test.sh` conferidos. **Aceite:** texto + `db-live-guard` verde.
- [ ] **F50** — `src/hooks/team-chat/README.md` (novo): convenção de canais `team:messages:<cid>:<sfx>`, `team:reactions:<cid>:<sfx>`, `team:receipts:<cid>:<sfx>`, `team:inbox:<pid>:<sfx>`, `team:typing:<cid>` (broadcast), `team:presence`; `sfx = crypto.randomUUID().slice(0,8)`; tabela hook × RPC **real** (F37–F47); pasta de upload; vocabulário de auditoria. **Aceite:** nenhum nome no README sem correspondente em `types.ts`.
- [ ] **F51** — `teamChatTypes.ts` derivado de `types.ts` regenerado: `TeamInboxRow`, `TeamMessagePageRow`, `member_role: 'owner'|'admin'|'member'`, `type: 'direct'|'group'|'department'`, `MessageUIStatus`, `DepartmentAuditAction` (8 valores). Zero `as any`/`as unknown as` novos. **Aceite:** `tsc -b --force` limpo.
- [ ] **F52** — `queryKeys.ts` em `src/hooks/team-chat/`: `inbox()`, `messages(cid)`, `search(cid,q)`, `readState(cid)`, `members(cid)`, `memberProfile(id)`, `performance(cid)`, `participantStats(cid)`, `departments.list()/members(id)/invites(id)/audit(id)`; migrar todas as chaves literais do módulo. **Aceite:** `grep -rn "queryKey: \['" src/hooks/team-chat src/components/team-chat` vazio.

## FASE 5 — Bloco E: camada de dados do front (F53–F63)
*1 PR. Nasce depois de F48 (`types.ts` com as RPCs).*

- [ ] **F53** — `useTeamConversations` → `rpc('get_team_inbox')`, mapeia `TeamInboxRow → TeamConversation`, `refetchInterval` 30 s, canal `team:inbox:<pid>:<sfx>` (`team_messages` INSERT + `team_conversation_members` UPDATE filtrado por `profile_id=eq.<pid>`), sem assinar receipts. **Aceite:** 1 request por refetch; fixadas no topo.
- [ ] **F54** — `useTeamMessages` → `useInfiniteQuery` sobre `get_team_messages_page`, cursor `{created_at,id}`, `sender`/`reactions` mapeados; realtime `INSERT` → `setQueryData` na página 0 (busca a linha por `get_team_messages_page(cid,null,null,1)`), `UPDATE/DELETE` → patch local; remover `olderMessages/fetchOlderMessages` de `useTeamChatPanel.ts:39-42,136-165`. **Aceite:** 200+ msgs sintéticas: novas primeiro, antigas ao rolar; sem `.from('team_messages')` no Panel.
- [ ] **F55** — `useMarkConversationRead` → `mark_team_conversation_read`, chamado em abrir, `visibilitychange` visible e INSERT com aba focada; invalida `inbox` e `readState`; remover o efeito de `useTeamMessages.ts:40-72`. **Aceite:** badge zera ao focar; receipts só de mensagens alheias.
- [ ] **F56** — `uploadTeamMedia(file, conversationId)` → pasta `${profile.id}/${conversationId}/${crypto.randomUUID()}.${ext}` (**`profiles.id`**, decisão (g)), retorna `{bucket, path}`; usado em `TeamFileUploader.tsx:66`, `useTeamChatPanel.handleAudioSend`, `useTeamChatDraft.handlePaste`; mensagem grava `content: legenda ?? ''`, `media_bucket/media_path`, `media_type`, nunca `media_url`; remover `getPublicUrl`. **Aceite:** upload como agente → 200; linha com `media_path` e `media_url` NULL; `grep getPublicUrl` no módulo vazio.
- [ ] **F57** — `useResolvedStorageUrl({bucket,path})` via `useQuery` (`staleTime` 50 min, TTL 1 h), sem `setState` em efeito; `MediaContent` de `teamChatParts.tsx` único consumidor. **Aceite:** imagem de A aparece para B após reload (policy F06); `lint-ratchet` `novas: 0`.
- [ ] **F58** — `useTeamChatMutations`: `useSendTeamMessage` (sem `status`/`updated_at`), `useToggleReaction` (F43, otimista + rollback), `useSetMemberPref` (F44; substitui `useMuteConversation`), `useTransferDepartment` (F45), `useLeaveGroup`/`useRemoveMember` (F46), `useRenameConversation` (UPDATE de `name` pelo grant F11), `useDeleteConversation`, `useUpdateTeamMessageStatus` local; `useEditTeamMessage` só `content` (F28); apagar `useTransferConversation` (`created_by`); `use-toast` → `sonner`. **Aceite:** `grep -rn "use-toast\|update({ is_muted\|update({ created_by" src/hooks/team-chat` vazio.
- [ ] **F59** — `useTeamMessageReactions` vira só realtime filtrado → `setQueryData` na mensagem. **Aceite:** 0 requests extras de reações ao abrir conversa.
- [ ] **F60** — `useTeamReadState(cid)` sobre a view F41 + realtime `team:receipts:<cid>:<sfx>` filtrado. **Aceite:** B lê → tick de A azul sem reload.
- [ ] **F61** — Rascunhos: manter `src/hooks/chat/useTeamChatDraft.ts`; teste de `handlePaste` não limpar texto. **Aceite:** teste passa.
- [ ] **F62** — `useDepartmentManagement.ts`: convites via `create_department_invite` (F16) e leitura de `department_invitations`; WhatsApp via `set_department_whatsapp_config`/`get_department_whatsapp_config` (F10); membros via `set_profile_department` (F47); **zero** `INSERT` em `department_audit_logs` e zero `user?.id` como `profile_id`; `enabled` por aba; erros com `toast.error`; remover `@ts-expect-error` e `department_whatsapp_configs`. **Aceite:** Network mostra só a query da aba ativa; criar convite como admin funciona; chave nunca no Network.
- [ ] **F63** — Fechamento E: `team-chat-local-gates.sh` limpo; `hooks/chat/useTeamChat.ts` e `hooks/team-chat/index.ts` atualizados; PR mergeada. **Aceite:** CI verde; seção 11.

## FASE 6 — Blocos F/G: ligar componentes e completar UX (F64–F75)
*2 PRs de front, paralelizáveis por arquivo.*

- [ ] **F64** — `TeamChatPanel.tsx` compõe `TeamMessageItem` + `TeamMessageReactionsWrapper` + `teamChatParts`; remove markup inline (`:164-258`), helpers locais (`:24-64`), reply duplicado (`:194-217`); `ErrorBoundary`; corrige os 9 avisos "Cannot access refs during render" (`:102-116`). Meta < 200 linhas. **Aceite:** `wc -l` < 200; `grep -c reply` ≤ 2; reações e ticks visíveis; baseline sem entradas de `TeamChatPanel.tsx`.
- [ ] **F65** — `TeamMessageItem.tsx`: tokens `chat-sent`/`chat-received` (`:88-90`); "Mensagem apagada" para reply órfão (`:117`); grid de 6 emojis (`:203-233`); `MessageStatus` lê `all_read` (F60); `hover:bg-muted/50` (`:167`); `bg-white/10` (`:123`) → `bg-chat-sent-foreground/10`. **Aceite:** light/dark/alto-contraste sem cor fixa.
- [ ] **F66** — Header ligado: `onToggleStats`, `canTransfer` (`useUserRole`), `onTransfer`, `onRenameGroup`, `onLeaveGroup`, `onPin`, `onArchive`, `onMute` (lê `membership.is_muted`); Fixar/Arquivar deixam de ser `disabled` (`TeamChatHeader.tsx:266-273`); Performance deixa de ser "em breve" (`:150-156`). **Aceite:** 6 itens funcionam e refletem estado ao reabrir.
- [ ] **F67** — Tokens no módulo inteiro (`bg-inbox-panel`, `chat-header`, `chat-input-bg`); zerar `bg-black|bg-card|bg-background|hover:bg-black` nos 8 pontos; apagar `src/styles/team-chat-tokens.css`; auditoria WCAG AA nos 3 temas em `team-chat-baseline-2026-09-29/contraste.md`. **Aceite:** grep vazio; tabela ≥ 4.5:1.
- [ ] **F68** — Scroll/paginação: `onNearTop` → `fetchNextPage`, âncora `useLayoutEffect`, "Carregando mensagens anteriores…", pílula "Pular para mensagens novas" + badge. Sem virtualização (decisão (j)). **Aceite:** teste RTL de scroll ao topo chama `fetchNextPage`.
- [ ] **F69** — Busca server-side: ⌘K, `useDebounce` 400 ms, `search_team_messages` (F42), contador, clique rola até a mensagem carregando páginas, Esc local. **Aceite:** termo fora das 50 primeiras é achado.
- [ ] **F70** — `TeamConversationList`: debounce 300 ms, `aria-setsize/posinset`, ⌘F, chip "Arquivadas" (`p_include_archived`), fallbacks de preview, ícones por tipo, skeleton 5 linhas; `TeamChatView` passa `canManageDepartments` (`useUserRole`) e `currentUserName`; departamentos carregados em todos os filtros. **Aceite:** teste RTL cobre filtros/teclado/arquivadas; `Settings2` visível para admin.
- [ ] **F71** — `GroupManagementDialog` ligado em `TeamMemberDetails` para `owner|admin`: renomear/avatar (bucket `avatars`)/remover/sair via F58; "Excluir conversa" com `AlertDialog` no header. **Aceite:** fluxo com 2 usuários (F99).
- [ ] **F72** — `TransferConversationDialog` reescrito: Select de `useActiveDepartments`, chama F45, `data-testid`s; mutação "transferir propriedade" apagada. **Aceite:** admin transfere; agente não vê o item.
- [ ] **F73** — Presença real: `useAgentPresenceMap()` em `TeamMemberDetails.tsx:77` e `TeamMemberProfileHeader.tsx:74,81-82`; apagar `useTeamPresence.ts`. **Aceite:** `grep is_active src/components/team-chat` vazio (fora de testes).
- [ ] **F74** — TTS: Panel passa `s.handleVoiceChange/handleSpeedChange` (`useTeamChatPanel.ts:82-98`) em vez de `s.tts.set*` (`TeamChatPanel.tsx:118,140`); header mostra seletor de voz. **Aceite:** voz persiste após reload.
- [ ] **F75** — Estatísticas ligadas: slot colapsável `ParticipantStatsGraph` ↔ `TeamPerformancePanel`; `useTeamPerformance` com `status`, `limit 2000`, chave da fábrica; KPIs/gráficos com tokens; `useParticipantStats` junta receipts. **Aceite:** painéis renderizam com os dados reais sem `return null`.

## FASE 7 — Bloco H: departamentos (F76–F82)
*1 PR de front + 1 migration (F78). Depende de F62.*

- [ ] **F76** — `DepartmentInvitesView`: lista com `use_count/max_uses`, `status`, copiar, "revogar" = `status='revoked'` (UPDATE admin via policy `admin_all`); `DepartmentAuditView` com badges para as 8 ações da seção 0 e CSV com escape de `\r`. **Aceite:** convite aceito sai de pendentes; export abre no Excel.
- [ ] **F77** — `DepartmentWhatsAppView`: lê `get_department_whatsapp_config` (`mode, instance_id, has_api_key`), campo Instance ID, salva via `set_department_whatsapp_config`; chave nunca volta ao front. **Aceite:** salvar/reabrir mostra modo e instance id; Network sem chave.
- [ ] **F78** — **Só agora** `DROP TABLE department_invites` (0 linhas conferidas no turno) + `types-sync` + `known-violations.json`. **Aceite:** `to_regclass` NULL; `grep department_invites src/` vazio.
- [ ] **F79** — "Entrar via Código" no bloqueio (`TeamChatPanel.tsx:113-133`): input 8 chars → `accept_department_invite` → invalida `profile` + `inbox`; erros tipados (`invalid_or_expired_code`, `invite_exhausted`, `already_member`); card "Solicitar acesso" → `request_department_access` (F47). **Aceite:** agente entra sem reload; código usado 2× falha.
- [ ] **F80** — `isChannelMember` = `profile.department_id === conv.department_id || isAdminOrSupervisor` (`TeamChatPanel.tsx:75`). **Aceite:** admin abre qualquer canal.
- [ ] **F81** — `DepartmentMembersView` usa `set_profile_department` (F47); sem UPDATE direto em `profiles`. **Aceite:** agente não muda o depto de outro perfil.
- [ ] **F82** — Fechamento H: PR mergeada; F78 aplicada; `db-live-guard` verde. **Aceite:** seção 11.

## FASE 8 — Bloco I: notificações, presença e digitação (F83–F88)
*1 PR de front.*

- [ ] **F83** — Badge "Teams" na sidebar via `useTeamUnreadTotal()` (soma do cache do inbox) em `Sidebar.tsx` ao lado do badge de `inbox`; apagar `useTeamUnreadCount.ts`. **Aceite:** badge com módulo fechado; zera ao ler.
- [ ] **F84** — Listener global em `AppShell`: canal `team:inbox:<pid>:<sfx>`, filtro por membership pelo cache, respeita `is_muted`; apagar `hooks/team-chat/useTeamChatNotifications.ts`; remover `TeamChatView.tsx:20`. **Aceite:** notificação chega em `/contatos`; silenciada não toca.
- [ ] **F85** — "Digitando…": `useTeamTyping` em `TeamChatInputArea` (throttle 2 s, para em 3 s), header e lista consomem; canal `team:typing:<cid>`. **Aceite:** B vê "A está digitando…".
- [ ] **F86** — Menções: `MentionAutocomplete` com `useTeamChatMembers`; ao enviar com `@`, `notify_team_mentions` (F47). **Aceite:** mencionado recebe notificação in-app.
- [ ] **F87** — Push → conversa: `notificationclick` no SW abre `/?view=team-chat&cid=<id>`; `TeamChatView` lê `cid`. **Aceite:** clique abre a conversa certa.
- [ ] **F88** — Realtime hardening: `removeChannel` em todos os cleanups (teste com mock), `channel.on('system')` logando `CHANNEL_ERROR`, `refetchOnReconnect` no inbox. **Aceite:** teste verifica `removeChannel` no unmount de cada hook.

## FASE 9 — Bloco J: testes, faxina e fechamento (F89–F100)
*2 PRs.*

- [ ] **F89** — Testes de hooks com Supabase mockado: `useTeamConversations` (1 rpc, `other_*`), `useTeamMessages` (3 páginas, cursor, append realtime), `useMarkConversationRead`, `useToggleReaction` (otimista + rollback), `useSetMemberPref`, `uploadTeamMedia` (pasta `profiles.id/cid/`), `useDepartmentManagement` (RPCs, zero insert direto). **Aceite:** 7 arquivos de teste verdes.
- [ ] **F90** — Substituir os 219 + 52 `expect(true).toBe(true)`; apagar `team-chat-exhaustive-audit.test.ts` e `rls-contract.test.ts` (F21 substitui). **Aceite:** `grep -rc "expect(true).toBe(true)" src/**/team-chat*` = 0; cobertura do módulo ≥ 70 %.
- [ ] **F91** — RTL: `TeamMessageItem`, `TeamMessageReactionsWrapper`, `TeamConversationList`, `TeamChatHeader` (6 ações), `DepartmentInvitesView`, "Entrar via Código". **Aceite:** 6 arquivos verdes.
- [ ] **F92** — Faxina de órfãos: apagar `src/i18n/team-chat.ts`, `TeamChatA11y.tsx` (mover `usePrefersReducedMotion` se houver consumidor), `scripts/team-chat-db-validate.mjs`, `src/styles/team-chat-tokens.css` (se F67 não apagou). **Aceite:** cada arquivo da lista de órfãos da auditoria ou tem importador ou não existe (`grep -rL` provado no corpo da PR).
- [ ] **F93** — `scripts/ci/eslint-baseline.json`: zerar as violações reais e **remover** as 88 entradas `team-chat`. **Aceite:** nenhuma entrada `team-chat`; `lint-ratchet` `novas: 0`.
- [ ] **F94** — E2E `e2e/team-chat.spec.ts` com fixtures F22: abrir módulo, enviar texto, reagir, marcar lida, fixar, silenciar, buscar, anexar, entrar via código; habilitado no `e2e-logado.yml`. **Aceite:** verde nos 3 browsers.
- [ ] **F95** — `pg_stat_statements` das RPCs F37–F47 após 1 semana em `team-chat-baseline-2026-09-29/pg_stat_statements.md`. **Aceite:** nenhuma `mean_exec_time > 20 ms`.
- [ ] **F96** — `DROP FUNCTION get_team_conversation_previews(), get_team_unread_counts()` — `grep` no `src/` vazio e `main` deployado antes. **Aceite:** `pg_proc` sem as 2.
- [ ] **F97** — Reservas: `version_reservations` do Team Chat sem linha pendente (as órfãs e as abandonadas anotadas na seção 11). **Aceite:** `SELECT count(*) FROM version_reservations WHERE holder LIKE '%team-chat%' AND version NOT IN (SELECT version FROM schema_migrations)` = 0.
- [ ] **F98** — Paridade final: `supabase-usage-guard.mjs` `novas: 0`; paridade tripla; `db-live-guard` verde; publication conferida; `db_duplicate_indexes` = 0; diff final contra o snapshot de F14 em `diff-final.md`. **Aceite:** 6 evidências commitadas.
- [ ] **F99** — Teste funcional em produção com 2 usuários reais (direta, grupo, canal de depto, anexo + áudio + imagem colada, reação, reply, edição, exclusão, mute, fixar, arquivar, transferir depto, badge, notificação com módulo fechado, digitando, "Entrar via Código", mobile). **Aceite:** checklist com data/hora e executor neste arquivo. Só aqui o módulo é "pronto".
- [ ] **F100** — Encerramento: CLAUDE.md com seção "Team Chat" definitiva (verdades da seção 0, modelo de leitura, convites, papéis, RPCs canônicas, canais, pasta de storage, vocabulário de auditoria); este arquivo com checklist final e links das PRs; follow-ups fora de escopo (virtualização, comandos "/", retry offline, recibos `played`, i18n). **Aceite:** CLAUDE.md e este arquivo no mesmo PR.

---

## 10. Decisões registradas (F24)

*(preencher na F24)*

## 11. Mapa de PRs e applies (F14, F20, F26, F36, F48, F63, F82)

| Bloco | Etapas | Tipo | Gate | PR | Aplicado em |
|---|---|---|---|---|---|
| R (a) | F02–F05 | espelhos + docs | CI verde | — | — |
| R (b) | F06–F14 | DDL corretiva (6) | **Aguarda Joaquim** | — | — |
| A″ DDL | F15–F20 | DDL (5) | Aguarda Joaquim | — | — |
| A″ CI | F21–F26 | CI + fixtures + docs | CI verde | — | — |
| B″ | F27–F36 | DDL (9) | Aguarda Joaquim | — | — |
| C″ | F37–F48 | DDL (RPCs, 14) | Aguarda Joaquim | — | — |
| D″ | F49–F52 | docs + tipos + chaves | CI verde, após F48 | — | — |
| E | F53–F63 | Front (hooks) | CI verde | — | — |
| F/G | F64–F75 | Front (UI) | CI verde | — | — |
| H | F76–F82 | Front + 1 DDL | F78 aguarda Joaquim | — | — |
| I | F83–F88 | Front | CI verde | — | — |
| J | F89–F100 | Testes + fechamento | CI verde | — | — |

**Ordem obrigatória:** R → A″ → B″ → C″ **aplicados e em `main`** → D″ → E → (F/G, H, I em paralelo) → J.

**Reservas de versão pendentes ao escrever este plano:** `20260929090000`, `100000` (órfãs — consumidas por `450000`/`470000`); `160000`–`200000` (reservadas para E26–E30 do plano anterior). Quem executar B″ decide: reaproveita as 5 (se for a mesma sessão) ou reserva novas e anota as 5 como abandonadas aqui.

*Plano criado em 2026-09-29 13:30 UTC a partir da auditoria do mesmo horário. Nenhuma etapa executada.*
