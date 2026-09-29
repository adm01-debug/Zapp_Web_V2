# PLANO — Team Chat V2: conclusão da implantação (100 etapas) — 2026-09-29

**Status:** PLANEJADO — nada executado.
**Origem:** `AUDITORIA_TEAM_CHAT_REMEDIACAO_2026-09-29.md` (1 DONE · 24 PARCIAL · 21 DIVERGENTE · 54 AUSENTE sobre o
plano de 28/09; PR #1151 inaplicável) + leitura ao vivo do banco `tnnnlkbymytvtqngbbqh` em 29/09.
**Sucede** `PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` (não reabrir) e
`PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md`.
**Base:** `main` @ `a0002bb`. **Ledger:** `max(version) = 20260928210000`. **Versão de migration sempre via**
`SELECT supabase_migrations.reserve_migration_version('team-chat-conclusao','E##')`.

---

## 0. Verdades do schema que TODA etapa deste plano respeita (medidas ao vivo em 29/09)

| Verdade | Prova | Regra derivada |
|---|---|---|
| **`profiles.id ≠ auth.uid()`** — `profiles.user_id` é o id do auth; `profile_id`/`sender_id`/`created_by` nas tabelas `team_*` e `department_*` apontam para `profiles.id` | `count(*) FILTER (WHERE id = user_id) = 0` de 6 | Nunca escrever `= auth.uid()` contra coluna `profile_id`. Usar `public.current_profile_id()` (E02) ou `is_team_conversation_member(auth.uid(), cid)` (já existe) |
| **Não existe `profiles.is_admin`** | `information_schema.columns` | Admin = `public.is_admin_or_supervisor(auth.uid())` (existe, SECDEF) |
| **`department_audit_logs(id, department_id, action, profile_id, details, created_at)`** | ao vivo | Auditoria grava `profile_id = current_profile_id()`; não existe `actor_id` |
| **`team_conversation_members.member_role ∈ ('owner','admin','member')`** | CHECK ao vivo | Dono de grupo = `'owner'`; `find_or_create_direct_conversation` insere `'owner'`; nunca `'viewer'`/`'moderator'` |
| **`team_messages.content` é NOT NULL; `status` ∈ CHECK; `message_type` ∈ CHECK** | ao vivo | Mídia sem legenda grava `content = ''` |
| **`department_invitations.email` NOT NULL DEFAULT `''`** | ao vivo | Convite sem e-mail grava `''`, não NULL |
| **`departments.whatsapp_mode` DEFAULT `'none'`**, sem CHECK; hook usa `none/evolution/official` | ao vivo | CHECK novo com esses 3 valores |
| **Policies são OR**: uma policy permissiva antiga anula a restritiva nova | `pg_policies` × manifest | Toda migration que "reescreve" policy faz `DROP POLICY IF EXISTS "<nome real do manifest>"` e prova com `SELECT count(*) FROM pg_policies WHERE tablename=… AND cmd=…` no rodapé |
| **Storage policies vivem em `pg_policy` sobre `storage.objects`**; não existe `storage.policies` | PG | `CREATE POLICY … ON storage.objects` |
| **`CREATE OR REPLACE FUNCTION` não muda tipo de retorno** (42P13); índice parcial não aceita `now()` | PG | `DROP FUNCTION` antes; predicado de índice só com colunas/constantes |
| **`types.ts` é gerado do banco** — RPC nova só tipa depois de aplicada + `types-sync` | `tsc` da PR #1151: 13 erros | Ordem obrigatória: DDL mergeada → aplicada → `types-sync` mergeado → PR de front que chama a RPC |
| **Ratchets da CI param no primeiro que falha** (`lint-ratchet` → `typecheck-ratchet` → `implicit-any` → `usage-guard`) | run 36490368146 | Rodar os 4 localmente antes de todo push (E07) |

### Regras de execução (herdam as 9 do plano de 28/09; mudanças em negrito)

1. DDL: arquivo → PR → merge em `main` → apply por `db_query` **na mesma transação** do INSERT no ledger gerado por
   `scripts/db-audit/register-migration.mjs` → `supabase-usage-guard.mjs` `novas: 0` → paridade arquivos↔ledger →
   **`types-sync` disparado e mergeado no mesmo turno**.
2. Um objeto por migration. **Cabeçalho obrigatório com 3 blocos: `-- Objetivo`, `-- Estado ao vivo antes (query +
   resultado, data)`, `-- Rollback`.** Migration sem os 3 blocos não entra em PR.
3. **Toda migration que cria/altera policy ou função termina com um bloco `DO $$ … ASSERT … $$` que verifica o estado
   final** (contagem de policies por `cmd`, `proacl` sem `anon`, `prosecdef`), para falhar no apply em vez de "aplicar
   errado em silêncio".
4. Toda policy `TO authenticated`; toda função `SECURITY DEFINER` com `SET search_path = public` e
   `REVOKE EXECUTE … FROM PUBLIC, anon`; leituras que a RLS já cobre são `SECURITY INVOKER`.
5. **Nenhuma migration é escrita sem antes rodar, ao vivo, a query do bloco "Estado antes" e colar o resultado.**
6. Front: **branch de front só nasce depois do `types-sync` do bloco DDL correspondente estar em `main`.** Tokens de
   tema, `sonner`, pt-BR, zero re-fix de hash no `eslint-baseline.json` — como antes.
7. PRs de DDL ficam abertas aguardando Joaquim (regra 8 do fluxo Git). PRs de front mergeiam com CI verde.
8. Cada etapa tem aceite verificável. **Etapa DDL só fecha com o objeto conferido ao vivo** (`pg_get_functiondef`,
   `pg_policies`, `pg_constraint`), nunca "arquivo commitado".
9. **Uma sessão, um bloco.** Não abrir o bloco seguinte antes do anterior estar aplicado e com `db-live-guard` verde.

---

## FASE 0 — Limpeza, identidade e baseline (E01–E08)
*Bloco 0 — 1 PR (E01) + 1 PR de DDL pequena (E02). E01 é pré-requisito de tudo.*

- [ ] **E01** — Sanear a PR #1151: `git rm` das 44 migrations `20260928220000…650000` e dos 11 arquivos de
  `src/hooks/team-chat/` alterados/criados no branch (`queryKeys.ts`, `useMarkConversationRead.ts`,
  `useResolvedStorageUrl.ts`, `useTeamDraft.ts`, `useTeamReadState.ts`, `README.md`, e reverter `teamChatTypes.ts`,
  `useTeamChatMutations.ts`, `useTeamConversations.ts`, `useTeamMessageReactions.ts`, `useTeamMessages.ts` ao estado de
  `main`), preservando `20260928650000` **renomeado** para a versão reservada na E51 (delete + create em commits
  separados). A PR vira docs-only (auditoria de 29/09 + este plano) e mergeia. **Aceite:** `git diff --stat main`
  da PR lista só `docs/audits/**`; CI verde; `tsc -b --force` sem erro no módulo.
- [ ] **E02** — Helper de identidade: `CREATE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE
  SECURITY DEFINER SET search_path = public AS $$ SELECT id FROM profiles WHERE user_id = auth.uid() LIMIT 1 $$`,
  `REVOKE FROM PUBLIC, anon`, `GRANT TO authenticated`. É a **única** forma de obter o perfil em policies/RPCs deste
  plano (`is_team_conversation_member(auth.uid(), cid)` continua válida para membership). **Aceite:** como
  `authenticated` com JWT de teste, `SELECT current_profile_id()` = `profiles.id` daquele usuário, ≠ `auth.uid()`.
- [ ] **E03** — Snapshot pré-mudança em `docs/audits/team-chat-baseline-2026-09-29/`: `pg_policies`, `pg_constraint`,
  `pg_indexes`, `pg_proc` (`proname`, `prosecdef`, `proacl`, `pg_get_function_identity_arguments`),
  `role_table_grants`, `column_privileges`, `pg_publication_tables`, `relreplident` — filtrados pelo escopo, em JSON,
  gerados por script `scripts/db-audit/team-chat-snapshot.mjs` (reutilizável nas E24/E36/E50/E98). **Aceite:** diretório
  commitado; script roda com `DESTINO_URL` e reproduz o JSON.
- [ ] **E04** — Decisões registradas **neste arquivo**, seção 10: (a) leitura: `last_read_at` é o badge,
  `team_message_receipts` só por RPC; (b) convites: consolidar em `department_invitations`, dropar `department_invites`
  **só depois** do front migrado (E80); (c) papéis: `owner` = dono; grupo sempre tem ≥ 1 owner; (d) presença:
  `useAgentPresenceMap`; (e) i18n: pt-BR fixo; (f) tokens: `src/styles/tokens.css` (apagar `team-chat-tokens.css`);
  (g) `announcement` **não** é tipo suportado nesta rodada (remover do enum de tipos do front). **Aceite:** seção 10
  preenchida.
- [ ] **E05** — Teste de contrato RLS **antes** de qualquer policy nova: job no `db-guard.yml` ("Validar SQL de
  catalogo e manifesto no PostgreSQL 17" já sobe Postgres) que aplica `supabase/migrations/*.sql` do escopo num banco
  limpo, cria 3 perfis (admin, membro, estranho) com `profiles.id ≠ user_id`, e roda `scripts/db-audit/team-chat-rls.sql`
  com `SET ROLE authenticated; SET request.jwt.claims`. Primeira versão afirma só o **estado atual** (estranho não lê
  mensagens; membro lê). Cada bloco DDL adiciona asserts. **Aceite:** job verde em `main`; remover uma policy localmente
  faz o job falhar.
- [ ] **E06** — Fixtures E2E/RLS: 2 usuários de teste com `profiles` + `user_roles` (um `admin`, um `agent`), 1 depto
  de teste, 1 grupo, 1 direta — semeados em produção com prefixo `[E2E]` (mesma convenção do contato E2E de 24/09),
  documentados em `e2e/fixtures/team-chat.ts`. **Aceite:** ids registrados no fixture; `SELECT` confirma.
- [ ] **E07** — Script `scripts/ci/team-chat-local-gates.sh`: `tsc -b --force`, `node scripts/ci/lint-ratchet.mjs`,
  `node scripts/ci/typecheck-ratchet.mjs`, `node scripts/ci/implicit-any-ratchet.mjs`,
  `node scripts/db-audit/supabase-usage-guard.mjs`, `vitest run src/hooks/team-chat src/components/team-chat` — os
  mesmos gates da CI, na mesma ordem. Toda PR deste plano cita a saída no corpo. **Aceite:** script commitado; PR da E01
  já o usa.
- [ ] **E08** — Mapa de PRs (seção 11) com número de cada PR ao abrir e data de apply de cada bloco DDL. **Aceite:**
  tabela preenchida conforme avança.

## FASE 1 — Bloco A′: segurança do banco (E09–E24)
*1 PR de DDL, 15 migrations. Aguarda Joaquim. Tabelas vazias (2 conversas, 2 mensagens, 0 recibos, 0 convites).*

- [ ] **E09** — `REVOKE TRUNCATE, TRIGGER, REFERENCES ON` **9 tabelas** (`team_conversations`,
  `team_conversation_members`, `team_messages`, `team_message_reactions`, `team_message_receipts`, `departments`,
  `department_invitations`, `department_invites`, `department_audit_logs`) `FROM anon, authenticated`. Só isso — sem
  sequences, sem outros schemas. **Aceite:** `role_table_grants` com esses privilégios no escopo = 0 (hoje 54).
- [ ] **E10** — `REVOKE ALL ON` as 9 tabelas `FROM anon`. **Aceite:** grants de `anon` no escopo = 0 (hoje 62).
- [ ] **E11** — `REVOKE UPDATE ON team_messages FROM authenticated; GRANT UPDATE (content, is_edited, updated_at) ON
  team_messages TO authenticated` — exatamente 3 colunas; `status` só por trigger/RPC. **Aceite:** `column_privileges`
  UPDATE = 3 linhas; `PATCH` de `conversation_id` → 42501.
- [ ] **E12** — `DROP POLICY "Senders can edit own messages"` (nome real) e recriar `FOR UPDATE TO authenticated USING
  (sender_id = current_profile_id()) WITH CHECK (sender_id = current_profile_id())`. **Aceite:** `pg_policies` mostra 1
  policy UPDATE em `team_messages`, `with_check` não nulo, `roles={authenticated}`; teste E05: remetente edita, outro
  membro recebe 0 linhas.
- [ ] **E13** — `team_message_receipts`: `REVOKE DELETE FROM authenticated`; trigger `BEFORE UPDATE` que rejeita
  `OLD.status='read' AND NEW.status<>'read'` e força `NEW.read_at := coalesce(NEW.read_at, now())` quando
  `NEW.status='read'`; `DROP POLICY "Members can update own receipts"` e recriar `TO authenticated USING (profile_id =
  current_profile_id()) WITH CHECK (profile_id = current_profile_id() AND status = 'read')`. **Aceite:** UPDATE
  `read→delivered` falha; DELETE → 42501.
- [ ] **E14** — `department_invitations`: `ADD COLUMN used_at timestamptz, used_by uuid REFERENCES profiles(id) ON
  DELETE SET NULL, max_uses int NOT NULL DEFAULT 1 CHECK (max_uses >= 1), use_count int NOT NULL DEFAULT 0 CHECK
  (use_count BETWEEN 0 AND max_uses)`; `CHECK (code ~ '^[A-Z0-9]{8}$')`; `CHECK (expires_at > created_at)`; índice
  parcial `(code) WHERE status = 'pending'` (**sem `now()`**). **Aceite:** INSERT com código de 7 chars falha; índice
  criado.
- [ ] **E15** — `DROP FUNCTION accept_department_invite(text)` (a atual, sobre `department_invites`) e recriar com a
  **mesma assinatura** `(p_code text) RETURNS jsonb SECURITY DEFINER SET search_path = public` sobre
  `department_invitations`: `v_me := current_profile_id()`; `SELECT … WHERE code = upper(p_code) AND status='pending'
  FOR UPDATE`; valida `expires_at > now()`, `use_count < max_uses`, `email = '' OR email = (SELECT email FROM profiles
  WHERE id = v_me)`; `UPDATE profiles SET department_id`; `UPDATE department_invitations SET use_count+1, used_at,
  used_by = v_me, status = CASE WHEN use_count+1 >= max_uses THEN 'accepted' ELSE status END`; `INSERT
  department_audit_logs (department_id, action, profile_id, details)` com `details->>'profile_name'`; erros tipados
  `invalid_or_expired_code | already_member | profile_not_found`. `REVOKE FROM PUBLIC, anon`. **Aceite:** 2 sessões
  concorrentes com `max_uses=1` → 1 ok, 1 erro; `profiles.department_id` atualizado; `proacl` sem `anon`.
- [ ] **E16** — `create_department_invite(p_department_id uuid, p_role text DEFAULT 'agent', p_email text DEFAULT '',
  p_max_uses int DEFAULT 1, p_ttl interval DEFAULT '7 days') RETURNS jsonb` SECDEF: exige
  `is_admin_or_supervisor(auth.uid())`; código `upper(substr(translate(encode(gen_random_bytes(8),'base64'),
  '+/=','xyz'),1,8))` filtrado para `[A-Z0-9]{8}` com até 5 retries em 23505; `created_by = current_profile_id()`;
  `email = coalesce(p_email,'')`; auditoria `invite_created` **sem** o código no `details`. **Aceite:** agente →
  42501-like (`not_authorized`); admin → linha com `created_by = profiles.id`.
- [ ] **E17** — `department_audit_logs`: `DROP POLICY dept_audit_insert_authenticated` (nome real); `REVOKE INSERT,
  UPDATE, DELETE FROM authenticated`; `DROP POLICY dept_audit_select_authenticated` e recriar `FOR SELECT TO
  authenticated USING (is_admin_or_supervisor(auth.uid()) OR department_id = (SELECT department_id FROM profiles WHERE
  id = current_profile_id()))`; `CHECK (action IN ('member_added','member_removed','invite_created','invite_deleted',
  'invite_accepted','invite_revoked','whatsapp_updated','department_transferred'))`; trigger `BEFORE INSERT` que
  preenche `details->>'profile_name'` a partir de `profiles` quando ausente. **Aceite:** INSERT direto como
  `authenticated` → 42501; INSERT via RPC sai com `profile_name`.
- [ ] **E18** — `departments`: `CHECK (whatsapp_mode IN ('none','evolution','official'))`; `REVOKE UPDATE ON departments
  FROM authenticated` (a policy `departments_admin_write` continua para INSERT/DELETE de admin) + `GRANT UPDATE (name,
  description, is_active, updated_at)`; RPC `set_department_whatsapp_config(p_department_id uuid, p_mode text,
  p_instance_id text DEFAULT NULL, p_api_key text DEFAULT NULL)` SECDEF admin-only que grava as 3 colunas e audita
  `whatsapp_updated` sem a chave. **Aceite:** `column_privileges` sem UPDATE em `whatsapp_*`; RPC como agente falha.
- [ ] **E19** — `DROP FUNCTION get_department_whatsapp_credentials(uuid)` e recriar `(_department_id uuid) RETURNS TABLE
  (mode text, instance_id text, has_api_key boolean)` STABLE SECDEF admin-only (1 linha, chave nunca sai);
  `get_department_whatsapp_api_key(_department_id uuid) RETURNS text` SECDEF com `REVOKE FROM PUBLIC, anon,
  authenticated` (só `service_role`). **Aceite:** admin recebe 1 linha/3 colunas; nenhuma chave em texto para
  `authenticated`.
- [ ] **E20** — Storage `team-chat-files` em `storage.objects`: `DROP POLICY "Conversation members can read team chat
  files"` (inerte); recriar `"Team chat files readable by owner admin or conversation member"` `FOR SELECT TO
  authenticated USING (bucket_id='team-chat-files' AND ((storage.foldername(name))[1] = auth.uid()::text OR
  is_admin_or_supervisor(auth.uid()) OR is_team_conversation_member(auth.uid(), ((storage.foldername(name))[2])::uuid)))`
  — convenção de pasta `<auth.uid()>/<conversation_id>/<uuid>.<ext>` documentada no arquivo; INSERT e os 2 DELETE
  existentes reescritos `TO authenticated` com o mesmo predicado de pasta. **Aceite:** `pg_policies` em
  `storage.objects` com `team-chat-files` → exatamente 1 SELECT, 1 INSERT, 2 DELETE, todas `{authenticated}`.
- [ ] **E21** — `team_conversations` UPDATE: `DROP POLICY "Creator can update conversation"` (nome real); recriar `TO
  authenticated USING (created_by = current_profile_id() OR is_admin_or_supervisor(auth.uid()) OR EXISTS (SELECT 1 FROM
  team_conversation_members m WHERE m.conversation_id = id AND m.profile_id = current_profile_id() AND m.member_role IN
  ('owner','admin'))) WITH CHECK (<mesmo>)`; `REVOKE UPDATE ON team_conversations FROM authenticated; GRANT UPDATE (name,
  avatar_url, metadata, updated_at)` (`type` fica imutável por grant, não por tautologia). **Aceite:** owner renomeia;
  membro comum 0 linhas; `SET type` → 42501.
- [ ] **E22** — `team_conversation_members`: `DROP POLICY "Members can leave or admins can remove"` e `"Members and
  admins can add conversation members"` (nomes reais); recriar DELETE `TO authenticated USING ((profile_id =
  current_profile_id() AND (member_role <> 'owner' OR (SELECT count(*) FROM team_conversation_members o WHERE
  o.conversation_id = conversation_id AND o.member_role = 'owner') > 1)) OR is_admin_or_supervisor(auth.uid()) OR EXISTS
  (owner/admin da mesma conversa))`; INSERT `TO authenticated WITH CHECK (member_role = 'member' OR
  is_admin_or_supervisor(auth.uid()) OR EXISTS (owner da conversa))` + exige que quem insere seja membro
  (`is_team_conversation_member`) **ou** que a conversa tenha 0 membros (criação). **Aceite:** único owner tenta sair →
  0 linhas; membro insere `member_role='owner'` → 42501; membro insere em conversa alheia → 42501.
- [ ] **E23** — As 6 policies `roles={public}` (nomes reais: "Admins can update any member row", "Members can update own
  preferences", "Conversation creator or admin can delete", "Conversation members can read receipts", "Members can
  insert own receipts", e a de E13) recriadas `TO authenticated` com `current_profile_id()`/`is_team_conversation_member`
  e `WITH CHECK` **real** (não `x = x`). **Aceite:** `pg_policies` `roles='{public}'` no escopo = 0.
- [ ] **E24** — Fechamento A′: apply E09–E23 (uma transação por migration, ledger via `register-migration.mjs`),
  `usage-guard` `novas: 0`, paridade, `types-sync` mergeado, `db-live-guard` verde, asserts do E05 estendidos (estranho
  não lê; membro não move mensagem; TRUNCATE negado; código não reutiliza; último owner não sai), snapshot E03 → diff em
  `diff-bloco-A.md`. **Aceite:** 5 asserts novos verdes; `team-chat-snapshot.mjs` sem `TRUNCATE`/`anon`.

## FASE 2 — Bloco B′: integridade (E25–E36)
*1 PR de DDL, 11 migrations. Aguarda Joaquim.*

- [ ] **E25** — `team_messages`: `CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document',
  'sticker','emoji','audio_meme'))`, `CHECK (char_length(content) <= 10000)`. **Aceite:** `media_type='gif'` falha.
- [ ] **E26** — `team_messages`: `CHECK (message_type IN ('text','system') OR (media_bucket = 'team-chat-files' AND
  media_path IS NOT NULL))`; `COMMENT ON COLUMN media_url 'deprecated: fallback; fonte é media_bucket/media_path'`.
  **Aceite:** imagem sem `media_path` falha.
- [ ] **E27** — `team_messages`: `CHECK (reply_to_id IS NULL OR reply_to_id <> id)` + trigger `BEFORE INSERT OR UPDATE OF
  reply_to_id` que valida mesma `conversation_id` (`RAISE 'reply_cross_conversation'`). **Aceite:** reply cruzado falha.
- [ ] **E28** — `team_messages`: trigger `BEFORE UPDATE OF content` → `is_edited := true, updated_at := now()`; rejeita
  se `created_at < now() - interval '48 hours'` (`RAISE 'edit_window_expired'`). Remove `is_edited`/`updated_at` do
  cliente (E60). **Aceite:** UPDATE só de `content` reflete `is_edited=true`.
- [ ] **E29** — `team_conversations`: `CHECK ((type='direct' AND direct_member_a < direct_member_b AND name IS NULL AND
  department_id IS NULL) OR (type='group' AND name IS NOT NULL AND direct_member_a IS NULL AND direct_member_b IS NULL AND
  department_id IS NULL) OR (type='department' AND department_id IS NOT NULL AND direct_member_a IS NULL AND
  direct_member_b IS NULL))`, `CHECK (char_length(name) <= 60)`; `find_or_create_direct_conversation` alinhada para
  comparar `uuid` nativo (`CREATE OR REPLACE`, mesma assinatura/retorno). **Aceite:** direta sem membros falha; RPC
  idempotente; os 2 registros atuais passam (verificar antes com `SELECT … WHERE NOT (<predicado>)` = 0).
- [ ] **E30** — `team_conversations`: `CREATE UNIQUE INDEX team_conversations_department_unique ON team_conversations
  (department_id) WHERE type='department'`; FK `department_id` recriada `ON DELETE CASCADE` (confirmar ao vivo antes —
  `20260902120000` já pode ter CASCADE; se tiver, migration é só o índice). **Aceite:** 2º canal do mesmo depto → 23505.
- [ ] **E31** — `team_conversation_members`: `CHECK (last_read_at IS NULL OR last_read_at >= joined_at)`; `CREATE INDEX
  idx_team_members_profile_active ON team_conversation_members (profile_id) WHERE NOT is_archived`; `DROP INDEX
  idx_team_members_profile`. **Aceite:** `pg_indexes` sem o antigo.
- [ ] **E32** — `team_message_reactions`: trigger `BEFORE INSERT OR UPDATE` que **força** `conversation_id :=
  (SELECT conversation_id FROM team_messages WHERE id = NEW.message_id)`; `CHECK (char_length(emoji) BETWEEN 1 AND 16)`;
  policy INSERT recriada `TO authenticated WITH CHECK (profile_id = current_profile_id() AND
  is_team_conversation_member(auth.uid(), (SELECT conversation_id FROM team_messages WHERE id = message_id)))`.
  **Aceite:** `conversation_id` errado é corrigido; reação em conversa alheia falha.
- [ ] **E33** — `team_message_receipts`: `CHECK ((status='delivered' AND read_at IS NULL) OR (status='read' AND read_at
  IS NOT NULL))`, `CHECK (read_at IS NULL OR read_at >= delivered_at)`; trigger que rejeita recibo do próprio remetente.
  **Aceite:** 3 INSERTs inválidos falham.
- [ ] **E34** — Migrations-espelho dos drifts: `ALTER TABLE team_conversations ADD COLUMN IF NOT EXISTS metadata jsonb NOT
  NULL DEFAULT '{}'` + `CHECK (jsonb_typeof(metadata)='object')`; `ALTER PUBLICATION supabase_realtime ADD TABLE
  team_message_reactions` guardado por `DO $$ IF NOT EXISTS (pg_publication_tables) $$`. **Aceite:**
  `check-migration-drift.mjs` limpo; ledger com SQL real.
- [ ] **E35** — `COMMENT ON` nas 5 tabelas `team_*`, `department_invitations`, `department_audit_logs` e colunas
  `direct_member_a/b`, `member_role`, `media_bucket/media_path`, `metadata`, `use_count/max_uses`, `conversation_id`
  (receipts, após E51). **Aceite:** `obj_description` não nulo para as 7 tabelas.
- [ ] **E36** — Fechamento B′: igual à E24 + asserts E05 (reply cruzado, mídia sem path, 2º canal de depto) +
  `diff-bloco-B.md`. **Aceite:** igual à E24.

## FASE 3 — Bloco C′: RPCs e performance (E37–E50)
*1 PR de DDL. Aguarda Joaquim. Contratos abaixo são os que o front (Fase 5) consome — não mudar sem mudar os dois.*

- [ ] **E37** — `get_team_inbox(p_include_archived boolean DEFAULT false) RETURNS TABLE (conversation_id uuid, type
  text, name text, avatar_url text, department_id uuid, created_by uuid, created_at timestamptz, updated_at timestamptz,
  member_role text, is_pinned boolean, is_muted boolean, is_archived boolean, last_read_at timestamptz, unread_count int,
  last_message_id uuid, last_message_content text, last_message_type text, last_message_sender_id uuid,
  last_message_sender_name text, last_message_created_at timestamptz, other_profile_id uuid, other_name text,
  other_avatar_url text, member_count int)` STABLE **SECURITY INVOKER** (RLS de members/messages já filtra), `v_me =
  current_profile_id()`, LATERAL para última mensagem e `count(*) WHERE created_at > coalesce(last_read_at,'-infinity')
  AND sender_id <> v_me`, `ORDER BY is_pinned DESC, updated_at DESC`. Sem `LIMIT/OFFSET`. **Aceite:** `EXPLAIN (ANALYZE,
  BUFFERS)` sem Seq Scan em `team_messages`; devolve as 2 conversas reais com `other_name` preenchido na direta.
- [ ] **E38** — `CREATE INDEX idx_team_messages_conv_created_id ON team_messages (conversation_id, created_at DESC, id
  DESC)`; `DROP INDEX idx_team_messages_conversation`. **Aceite:** E39 usa o novo.
- [ ] **E39** — `get_team_messages_page(p_conversation_id uuid, p_before_created_at timestamptz DEFAULT NULL, p_before_id
  uuid DEFAULT NULL, p_limit int DEFAULT 50) RETURNS TABLE (id, conversation_id, sender_id, sender_name text,
  sender_avatar_url text, content, message_type, media_url, media_type, media_bucket, media_path, reply_to_id, is_edited,
  status, created_at, updated_at, reactions jsonb)` STABLE **SECURITY INVOKER**, keyset `(created_at, id) <
  (p_before_created_at, p_before_id)` quando informados, `ORDER BY created_at DESC, id DESC LIMIT least(p_limit,100)`,
  `reactions = jsonb_agg` por emoji `{emoji, count, profile_ids}`. **Aceite:** 3 páginas sobre 120 mensagens sintéticas
  (transação revertida) sem repetir/pular; `EXPLAIN` Index Scan Backward no índice E38.
- [ ] **E40** — `mark_team_conversation_read(p_conversation_id uuid) RETURNS int` SECDEF: `v_me`, exige membership;
  `UPDATE team_conversation_members SET last_read_at = now() … RETURNING (old) last_read_at`; `INSERT INTO
  team_message_receipts (message_id, profile_id, status, delivered_at, read_at) SELECT id, v_me, 'read', now(), now()
  FROM team_messages WHERE conversation_id = $1 AND sender_id <> v_me AND created_at > coalesce(v_old,'-infinity') ON
  CONFLICT (message_id, profile_id) DO UPDATE SET status='read', read_at=excluded.read_at WHERE
  team_message_receipts.status <> 'read'`; devolve linhas afetadas. **Aceite:** 100 msgs não lidas → 1 chamada → 2
  statements; `unread_count` = 0 no `get_team_inbox()`.
- [ ] **E41** — View `team_message_read_state (message_id, conversation_id, member_count, read_count, all_read)` com
  `security_invoker = on` sobre receipts × members; `all_read = read_count >= member_count - 1`. **Aceite:** view
  devolve `all_read=true` só quando todos os outros leram.
- [ ] **E42** — `search_team_messages(p_conversation_id uuid, p_query text, p_limit int DEFAULT 50) RETURNS TABLE (id,
  created_at, sender_id, snippet text)` STABLE INVOKER: rejeita `length(trim(p_query)) < 2`, escapa `%`/`_`, `content
  ILIKE '%'||q||'%'` (usa `idx_team_messages_content_trgm`), `snippet = substring(content from greatest(1, position -
  60) for 160)`. **Aceite:** `EXPLAIN` Bitmap Index Scan no trgm; 1 char → erro.
- [ ] **E43** — `toggle_team_reaction(p_message_id uuid, p_emoji text) RETURNS boolean` INVOKER: `DELETE … WHERE
  message_id=$1 AND profile_id=v_me AND emoji=$2 RETURNING 1` → se 0, `INSERT` → `true`; senão `false`. **Aceite:** 2
  chamadas voltam ao estado inicial; 1 statement de escrita por toggle.
- [ ] **E44** — `set_team_member_pref(p_conversation_id uuid, p_is_pinned boolean DEFAULT NULL, p_is_muted boolean DEFAULT
  NULL, p_is_archived boolean DEFAULT NULL) RETURNS void` INVOKER: `UPDATE … SET col = coalesce(param, col) WHERE
  profile_id = v_me`. **Aceite:** só `p_is_muted` não toca `is_pinned`.
- [ ] **E45** — `transfer_team_conversation_department(p_conversation_id uuid, p_to_department_id uuid) RETURNS jsonb`
  SECDEF admin-only, só `type='department'`, `metadata || {transferred_at, transferred_by, original_department_id}`,
  erro tipado `department_channel_exists` (unique E30), auditoria `department_transferred`. **Aceite:** agente →
  `not_authorized`; admin → metadata preenchido.
- [ ] **E46** — `leave_team_group(p_conversation_id uuid)` e `remove_team_member(p_conversation_id uuid, p_profile_id
  uuid)` SECDEF: regra do último owner (E22) + promoção do membro mais antigo a `owner` quando o único owner sai; grupo
  que fica com 0 membros é deletado (decisão registrada). **Aceite:** owner sai de grupo de 3 → outro vira owner.
- [ ] **E47** — `ALTER TABLE team_messages REPLICA IDENTITY DEFAULT` (grep `payload.old` no módulo = vazio; realtime só
  precisa do PK). **Aceite:** `relreplident='d'`.
- [ ] **E48** — `DROP FUNCTION get_team_conversation_previews(), get_team_unread_counts()` — **só na Fase 9 (E98)**, depois
  do front em `main` sem referência. Aqui: registrar a intenção e `COMMENT ON FUNCTION … 'deprecated: usar
  get_team_inbox()'`. **Aceite:** comentário ao vivo.
- [ ] **E49** — Limpeza de índices duplicados hoje existentes no escopo (conferir `db_duplicate_indexes` ao vivo; a PR
  #1151 teria criado 6 novos — não criar nenhum além dos E31/E38). **Aceite:** `db_duplicate_indexes` = 0 no escopo.
- [ ] **E50** — Fechamento C′: apply + ledger + guard + `types-sync` + `db-live-guard`; `EXPLAIN (ANALYZE, BUFFERS)` de
  E37/E39/E40/E42 em `diff-bloco-C.md`; asserts E05 para E43/E44/E46. **Aceite:** igual à E24 + 4 planos sem Seq Scan.

## FASE 4 — Bloco D′: realtime + apply (E51–E54)

- [ ] **E51** — `team_message_receipts.conversation_id`: reaproveitar o SQL de `20260928650000` (coluna, backfill,
  NOT NULL, FK CASCADE, trigger `BEFORE INSERT OR UPDATE OF message_id` que **força** o valor, índices) com versão nova
  reservada e cabeçalho completo; sem o `DELETE` de órfãos (0 linhas hoje — verificar e, se 0, omitir). **Aceite:**
  coluna ao vivo; subscription com filtro recebe só a conversa aberta.
- [ ] **E52** — Decisão de publication registrada (seção 10): `team_messages`, `team_message_reactions`,
  `team_message_receipts`, `team_conversation_members` — estado ao vivo já é este; `realtime-publication-baseline.json`
  e `runtime-config.test.sh` conferidos. **Aceite:** texto + `db-live-guard` verde.
- [ ] **E53** — `src/hooks/team-chat/README.md` reescrito para a verdade: `crypto.randomUUID().slice(0,8)`, canais
  `team:messages:<cid>:<sfx>`, `team:reactions:<cid>:<sfx>`, `team:receipts:<cid>:<sfx>`, `team:inbox:<pid>:<sfx>`,
  `team:typing:<cid>` (broadcast), `team:presence` (global); tabela de hooks × RPCs **reais** (E37–E46). **Aceite:**
  nenhum nome de RPC/canal no README sem correspondente no código.
- [ ] **E54** — Fechamento D′: apply E51 + `types-sync` + `db-live-guard`. A partir daqui `types.ts` tem todas as RPCs
  das fases 1–4. **Aceite:** `grep -c "get_team_inbox\|get_team_messages_page\|mark_team_conversation_read\|
  search_team_messages\|toggle_team_reaction\|set_team_member_pref" src/integrations/supabase/types.ts` = 6.

## FASE 5 — Camada de dados do front (E55–E66)
*Bloco E — 1 PR. Nasce **depois** da E54. Reaproveita o esqueleto da PR #1151 corrigido.*

- [ ] **E55** — `queryKeys.ts` (em `src/hooks/team-chat/`, decisão: não criar `src/services/api/`): `inbox()`,
  `messages(cid)`, `search(cid,q)`, `readState(cid)`, `members(cid)`, `memberProfile(id)`, `performance(cid)`,
  `participantStats(cid)`, `departments.list()/members(id)/invites(id)/audit(id)`; migrar **todas** as chaves literais
  (`useTeamMemberDetails.ts:41,58`, `useTeamChatMembers.ts:33-34`, `useTeamPerformance.ts`, `useParticipantStats.ts`,
  `useDepartmentManagement.ts`, `useActiveDepartments.ts`). **Aceite:** `grep -rn "queryKey: \['" src/hooks/team-chat
  src/components/team-chat` vazio.
- [ ] **E56** — `teamChatTypes.ts` derivado de `types.ts` regenerado: `TeamInboxRow = Database['public']['Functions']
  ['get_team_inbox']['Returns'][number]`, `TeamMessagePageRow`, `member_role: 'owner'|'admin'|'member'`,
  `TeamConversation.type: 'direct'|'group'|'department'`, `MessageUIStatus`. Zero `as any`/`as unknown as` novos.
  **Aceite:** `tsc -b --force` limpo.
- [ ] **E57** — `useTeamConversations` → `rpc('get_team_inbox')`, mapeia `TeamInboxRow → TeamConversation` (nome/avatar da
  direta vêm de `other_*`), `refetchInterval` 30s, canal `team:inbox:<pid>:<sfx>` em `team_messages` INSERT +
  `team_conversation_members` UPDATE **filtrado por `profile_id=eq.<pid>`** — sem assinar receipts. **Aceite:** 1 request
  por refetch; fixadas no topo; lista renderiza sem `TypeError`.
- [ ] **E58** — `useTeamMessages` → `useInfiniteQuery` sobre `get_team_messages_page`, cursor `{created_at, id}` da última
  linha, `sender` mapeado de `sender_name/sender_avatar_url`, `reactions` mapeadas; realtime `INSERT` → `setQueryData`
  na página 0 buscando a linha por `get_team_messages_page(cid, null, null, 1)`, `UPDATE/DELETE` → patch local; canal
  `team:messages:<cid>:<sfx>` com filtro. **Remover** de `useTeamChatPanel.ts` o estado `olderMessages/oldestCursor/
  hasOlderMessages/isFetchingOlder` e `fetchOlderMessages` (`:39-42,136-165`), expondo `fetchNextPage/hasNextPage/
  isFetchingNextPage` do hook. **Aceite:** 200+ msgs sintéticas: novas primeiro, antigas ao rolar; sem
  `.from('team_messages')` no Panel.
- [ ] **E59** — `useMarkConversationRead` → `mark_team_conversation_read`, **chamado** pelo Panel em (a) abrir, (b)
  `visibilitychange` visible, (c) INSERT com aba focada; invalida `inbox` e `readState`. **Aceite:** badge zera ao focar;
  receipts só de mensagens alheias.
- [ ] **E60** — `uploadTeamMedia(file, conversationId)` → pasta `${session.user.id}/${conversationId}/${uuid}.${ext}`
  (**`auth.uid()`, não `profile.id`**), retorna `{bucket:'team-chat-files', path}`; usado por `TeamFileUploader.tsx:66`,
  `useTeamChatPanel.handleAudioSend`, `useTeamChatDraft.handlePaste`; `send_team_message` recebe `content: legenda ?? ''`,
  `media_bucket/media_path`, nunca `media_url`; remover `getPublicUrl`. `useEditTeamMessage` só manda `content` (E28).
  **Aceite:** upload como agente → 200; linha com `media_path` e `media_url` NULL; `grep getPublicUrl` no módulo vazio.
- [ ] **E61** — `useResolvedStorageUrl({bucket,path})` via `useQuery` (`staleTime` 50 min, TTL 1 h) — sem `setState` em
  efeito (corrige o erro de lint); `MediaContent` de `teamChatParts.tsx` é o único consumidor. **Aceite:** imagem de A
  aparece para B após reload; lint ratchet `novas: 0`.
- [ ] **E62** — `useTeamChatMutations`: `useSendTeamMessage` (`send_team_message`, sem `status`/`updated_at`),
  `useToggleReaction` (`toggle_team_reaction`, otimista+rollback no cache da página), `useSetMemberPref`
  (`set_team_member_pref` — substitui `useToggleMuteConversation`), `useTransferDepartment` (E45), `useLeaveGroup`/
  `useRemoveMember` (E46), `useRenameConversation` (`update_team_conversation` **ou** UPDATE de coluna — decidir pelo
  grant E21), `useDeleteConversation`, `useUpdateTeamMessageStatus` local; apagar `useTransferConversation` (created_by).
  **Aceite:** cada mutação com teste (E92); nenhum `.update({is_muted})`/`.update({created_by})` no módulo.
- [ ] **E63** — `useTeamMessageReactions` vira só realtime de `team_message_reactions` filtrado → `setQueryData` na
  mensagem afetada (reações já vêm na página). **Aceite:** 0 requests extras de reações ao abrir conversa.
- [ ] **E64** — `useTeamReadState(cid)` sobre a view `team_message_read_state` + realtime `team:receipts:<cid>:<sfx>`
  filtrado (E51) → `all_read` por mensagem. **Aceite:** B lê → tick de A azul sem reload.
- [ ] **E65** — Rascunhos: **manter** `src/hooks/chat/useTeamChatDraft.ts`; apagar `useTeamDraft.ts` (duplicata órfã);
  teste unitário de `handlePaste` não limpar texto. **Aceite:** teste passa; arquivo apagado.
- [ ] **E66** — Fechamento E: `team-chat-local-gates.sh` limpo; `hooks/chat/useTeamChat.ts` (re-export) apontando para
  as novas assinaturas; `hooks/team-chat/index.ts` atualizado. **Aceite:** CI verde; PR mergeada.

## FASE 6 — Ligar componentes e completar UX (E67–E78)
*Blocos F (E67–E72) e G (E73–E78) — 2 PRs de front, paralelizáveis com E por arquivo.*

- [ ] **E67** — `TeamChatPanel.tsx` compõe `TeamMessageItem` + `TeamMessageReactionsWrapper` + `teamChatParts`; remove
  markup inline (`:164-258`), helpers locais (`:24-64`), reply duplicado (`:194-217`); `ErrorBoundary` com fallback
  "Erro ao carregar o chat"; importa tipos de `@/hooks/team-chat/teamChatTypes`. Meta < 200 linhas. **Aceite:** `wc -l`
  < 200; `grep -c reply` ≤ 2; reações e ticks visíveis.
- [ ] **E68** — `TeamMessageItem.tsx`: `bg-chat-sent text-chat-sent-foreground`/`bg-chat-received
  text-chat-received-foreground` (`:88-90`); "Mensagem apagada" para `reply_to_id` órfão (`:117`); grid de 6 emojis no
  menu (`:203-233`); `MessageStatus` lê `all_read` (E64); `hover:bg-muted/50` (`:167`); `bg-white/10` (`:123`) →
  `bg-chat-sent-foreground/10`. **Aceite:** light/dark/alto-contraste sem cor fixa.
- [ ] **E69** — Header ligado: `onToggleStats`, `canTransfer` (`useUserRole`, não `profile.role`), `onTransfer`,
  `onRenameGroup`, `onLeaveGroup`, `onPin`, `onArchive`, `onMute` (lê `membership.is_muted`); Fixar/Arquivar deixam de
  ser `disabled` (`TeamChatHeader.tsx:266-273`); Performance deixa de ser "em breve" (`:150-156`). **Aceite:** 6 itens
  funcionam e refletem estado ao reabrir.
- [ ] **E70** — Tokens no módulo inteiro (`bg-inbox-panel`, `chat-header`, `chat-input-bg`); zerar as 16 ocorrências de
  `bg-black|bg-card|bg-background`; **apagar** `src/styles/team-chat-tokens.css`; auditoria WCAG AA nos 3 temas em
  `docs/audits/team-chat-baseline-2026-09-29/contraste.md`. **Aceite:** grep vazio; tabela ≥ 4.5:1.
- [ ] **E71** — Scroll/paginação: `onNearTop` → `fetchNextPage`, âncora `useLayoutEffect`, "Carregando mensagens
  anteriores…", pílula "Pular para mensagens novas" + badge. Sem virtualização (registrado). Corrige também os 9 avisos
  "Cannot access refs during render" do baseline (`TeamChatPanel.tsx:102-116`). **Aceite:** teste RTL de scroll ao topo
  chama `fetchNextPage`.
- [ ] **E72** — Busca server-side: ⌘K, `useDebounce` 400 ms, `search_team_messages`, contador, clique rola até a
  mensagem carregando páginas, Esc local. **Aceite:** termo fora das 50 primeiras é achado.
- [ ] **E73** — `TeamConversationList`: debounce 300 ms, `aria-setsize/posinset`, ⌘F, chip "Arquivadas"
  (`p_include_archived`), fallbacks de preview, ícones por tipo, skeleton 5 linhas, `canManageDepartments` recebido de
  `TeamChatView` (E85). **Aceite:** teste RTL cobre filtros/teclado/arquivadas.
- [ ] **E74** — `GroupManagementDialog` ligado em `TeamMemberDetails` para `owner|admin`: renomear/avatar (bucket
  `avatars`)/remover/sair via E62; "Excluir conversa" com `AlertDialog` no header. **Aceite:** fluxo com 2 usuários (E99).
- [ ] **E75** — `TransferConversationDialog` reescrito: Select de `useActiveDepartments`, chama E45, `data-testid`s;
  a mutação "transferir propriedade" é apagada. **Aceite:** admin transfere; agente não vê o item.
- [ ] **E76** — Presença real: `useAgentPresenceMap()` em `TeamMemberDetails.tsx:77` e `TeamMemberProfileHeader.tsx:74,
  81-82`; apagar `useTeamPresence.ts`. **Aceite:** `grep is_active src/components/team-chat` vazio (fora de testes).
- [ ] **E77** — TTS: Panel passa `s.handleVoiceChange/handleSpeedChange` (`useTeamChatPanel.ts:82-98`) em vez de
  `s.tts.set*` (`:118,140`); header mostra seletor de voz. **Aceite:** voz persiste após reload.
- [ ] **E78** — Estatísticas ligadas: slot colapsável `ParticipantStatsGraph` ↔ `TeamPerformancePanel`;
  `useTeamPerformance` com `status`, `limit 2000`, chave da fábrica; KPIs e gráficos com tokens; `useParticipantStats`
  junta receipts. **Aceite:** painéis renderizam com os dados reais sem `return null`.

## FASE 7 — Departamentos (E79–E85)
*Bloco H — 1 PR de front + 1 migration (E86 do plano anterior vira E84 aqui).*

- [ ] **E79** — `useDepartmentManagement.ts`: convites via `create_department_invite`/`department_invitations`;
  `profile_id`/`created_by` nunca recebem `user.id`; `enabled` por aba; erros tratados com `toast.error`. **Aceite:**
  criar convite como admin funciona; Network só com a query da aba ativa.
- [ ] **E80** — **Só agora** `DROP TABLE department_invites` (migration própria; 0 linhas confirmadas no turno) + remover
  do `schema-catalog.json`/`known-violations.json` via `types-sync`. **Aceite:** `to_regclass` NULL; `grep
  department_invites src/` vazio.
- [ ] **E81** — WhatsApp de depto: salvar via `set_department_whatsapp_config`; ler via E19 com `has_api_key`; campo
  Instance ID; remover `@ts-expect-error` e `department_whatsapp_configs` (`:226`). **Aceite:** chave nunca no Network.
- [ ] **E82** — `DepartmentAuditView` com badges para as 8 ações da E17 e CSV com escape de `\r`;
  `DepartmentInvitesView` com `use_count/max_uses`, status, "revogar" = `status='revoked'` (UPDATE admin). **Aceite:**
  convite aceito sai de pendentes.
- [ ] **E83** — "Entrar via Código" no bloqueio (`TeamChatPanel.tsx:113-133`): input 8 chars →
  `accept_department_invite` → invalida `profile` + `inbox`; erros tipados; card "Solicitar acesso" cria
  `app_notifications` para admins (verificar policy INSERT ao vivo — hoje **nenhuma**; se necessário RPC
  `request_department_access` SECDEF). **Aceite:** agente entra sem reload; código usado 2× falha.
- [ ] **E84** — `set_profile_department(p_profile_id uuid, p_department_id uuid)` SECDEF admin-only com auditoria
  `member_added/member_removed`; `DepartmentMembersView` usa a RPC (não UPDATE em `profiles`). **Aceite:** agente não
  muda o depto de outro perfil.
- [ ] **E85** — `isChannelMember` = `profile.department_id === conv.department_id || isAdminOrSupervisor`
  (`TeamChatPanel.tsx:75`); `TeamChatView` passa `canManageDepartments` (`useUserRole`) e `currentUserName`; departamentos
  carregados em todos os filtros. **Aceite:** admin abre qualquer canal; `Settings2` visível para admin.

## FASE 8 — Notificações, presença e digitação (E86–E91)
*Bloco I — 1 PR de front.*

- [ ] **E86** — Badge "Teams" na sidebar via `useTeamUnreadTotal()` (soma do cache do inbox); apagar
  `useTeamUnreadCount.ts`. **Aceite:** badge com módulo fechado; zera ao ler.
- [ ] **E87** — Listener global em `AppShell`: canal `team:inbox:<pid>:<sfx>`, filtro por membership pelo cache,
  respeita `is_muted`; apagar `hooks/team-chat/useTeamChatNotifications.ts`; remover chamada de `TeamChatView.tsx:20`.
  **Aceite:** notificação chega em `/contatos`; silenciada não toca.
- [ ] **E88** — "Digitando…": `useTeamTyping` em `TeamChatInputArea` (throttle 2 s, para em 3 s), header e lista
  consomem; canal `team:typing:<cid>`. **Aceite:** B vê "A está digitando…".
- [ ] **E89** — Menções: `MentionAutocomplete` com `useTeamChatMembers`; ao enviar com `@`, RPC
  `notify_team_mentions(p_message_id)` SECDEF (migration extra) insere em `app_notifications`. **Aceite:** mencionado
  recebe notificação in-app.
- [ ] **E90** — Push → conversa: `notificationclick` no SW abre `/?view=team-chat&cid=<id>`; `TeamChatView` lê `cid`.
  **Aceite:** clique abre a conversa certa.
- [ ] **E91** — Realtime hardening: `removeChannel` em todos os cleanups (teste com mock), `channel.on('system')` logando
  `CHANNEL_ERROR`, `refetchOnReconnect` no inbox. **Aceite:** teste verifica `removeChannel` no unmount de cada hook.

## FASE 9 — Testes, faxina e fechamento (E92–E100)
*Bloco J — 2 PRs.*

- [ ] **E92** — Testes de hooks com Supabase mockado: `useTeamConversations` (1 rpc, mapeamento `other_*`),
  `useTeamMessages` (3 páginas, cursor `(created_at,id)`, append realtime), `useMarkConversationRead`,
  `useToggleReaction` (otimista+rollback), `useSetMemberPref`, `uploadTeamMedia` (pasta `auth.uid()/cid/`). Substituir
  os 219 + 52 `expect(true).toBe(true)`; apagar `team-chat-exhaustive-audit.test.ts` e `rls-contract.test.ts`
  (E05 substitui). **Aceite:** `grep -c "expect(true).toBe(true)"` = 0; cobertura ≥ 70 %.
- [ ] **E93** — RTL: `TeamMessageItem`, `TeamMessageReactionsWrapper`, `TeamConversationList`, `TeamChatHeader` (6
  ações), `DepartmentInvitesView`, "Entrar via Código". **Aceite:** 6 arquivos de teste verdes.
- [ ] **E94** — Faxina de órfãos: apagar `src/i18n/team-chat.ts`, `TeamChatA11y.tsx` (mover `usePrefersReducedMotion`
  se houver consumidor), `scripts/team-chat-db-validate.mjs`, `src/styles/team-chat-tokens.css` (se E70 não apagou).
  **Aceite:** cada arquivo da lista de órfãos da auditoria de 28/09 ou tem importador ou não existe.
- [ ] **E95** — `scripts/ci/eslint-baseline.json`: zerar as violações reais dos arquivos do módulo e **remover** as 88
  entradas `team-chat`. **Aceite:** nenhuma entrada `team-chat`; `lint-ratchet` `novas: 0`.
- [ ] **E96** — E2E `e2e/team-chat.spec.ts` com os fixtures da E06: abrir módulo, enviar texto, reagir, marcar lida,
  fixar, silenciar, buscar, anexar; habilitado no `e2e-logado.yml`. **Aceite:** verde nos 3 browsers.
- [ ] **E97** — `pg_stat_statements` das RPCs E37–E46 após 1 semana em `team-chat-baseline-2026-09-29/pg_stat_statements.md`.
  **Aceite:** nenhuma `mean_exec_time > 20 ms`.
- [ ] **E98** — `DROP FUNCTION get_team_conversation_previews(), get_team_unread_counts()` (E48) — `grep` no `src/` vazio
  e `main` deployado antes. **Aceite:** `pg_proc` sem as 2.
- [ ] **E99** — Teste funcional em produção com 2 usuários reais (checklist: direta, grupo, canal de depto, anexo +
  áudio + imagem colada, reação, reply, edição, exclusão, mute, fixar, arquivar, transferir depto, badge, notificação com
  módulo fechado, digitando, "Entrar via Código", mobile). **Aceite:** checklist com data/hora e executor neste arquivo.
- [ ] **E100** — Encerramento: CLAUDE.md do V2 ganha seção "Team Chat" (verdades da seção 0, modelo de leitura,
  convites, papéis, RPCs canônicas, canais); este arquivo com checklist final e links das PRs; `db-live-guard` verde;
  diff final contra E03 em `diff-final.md`. **Aceite:** CLAUDE.md e este arquivo no mesmo PR.

---

## 10. Decisões registradas (E04)

*(preencher na E04)*

## 11. Mapa de PRs (E08)

| Bloco | Etapas | Tipo | Gate | PR | Aplicado em |
|---|---|---|---|---|---|
| 0 | E01–E08 | limpeza + helper + CI | E02 aguarda Joaquim | — | — |
| A′ | E09–E24 | DDL (15) | Aguarda Joaquim | — | — |
| B′ | E25–E36 | DDL (11) | Aguarda Joaquim | — | — |
| C′ | E37–E50 | DDL (RPCs) | Aguarda Joaquim | — | — |
| D′ | E51–E54 | DDL (1) + README | Aguarda Joaquim | — | — |
| E | E55–E66 | Front (hooks) | CI verde, **após E54** | — | — |
| F/G | E67–E78 | Front (UI) | CI verde | — | — |
| H | E79–E85 | Front + 2 migrations | migrations aguardam Joaquim | — | — |
| I | E86–E91 | Front + 1 migration | idem | — | — |
| J | E92–E100 | Testes + fechamento | CI verde | — | — |

**Ordem obrigatória:** 0 → A′ → B′ → C′ → D′ **aplicados** → E → (F, G, H, I em paralelo) → J.

*Plano criado em 2026-09-29 a partir da auditoria do mesmo dia. Nenhuma etapa executada.*
