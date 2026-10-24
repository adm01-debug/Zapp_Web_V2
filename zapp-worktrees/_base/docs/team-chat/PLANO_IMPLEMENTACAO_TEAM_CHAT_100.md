# PLANO — Team Chat V2: finalização da implantação (100 etapas, prefixo `TC-`)

**Data:** 2026-09-29 · **Status:** PLANEJADO — nada executado
**Origem:** `docs/team-chat/AUDITORIA_TEAM_CHAT_2026-09-29.md` (11 DONE · 33 PARCIAL · 56 AUSENTE sobre o plano de
29/09 + 10 regressões R1–R10 introduzidas pelo apply de DDL a partir de branch aberto).
**Sucede** `docs/audits/PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` (branch #1151),
`PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` e `PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md`.
Nenhum dos três deve ser reaberto; o que neles estava certo está aqui, renumerado com prefixo `TC-` para acabar
com a ambiguidade de "E37" (§6.1 da auditoria).
**Base:** `main` @ `ac5d629`; ledger `max(version) = 20260929330000` (13:34 UTC, **em movimento**).

---

## 0. Verdades que toda etapa respeita

Herdam a seção 0 do plano de 29/09 (`profiles.id ≠ auth.uid()`; `current_profile_id()`; não existe
`profiles.is_admin`; `department_audit_logs.profile_id`; `member_role ∈ owner|admin|member`; `content` NOT NULL;
policies são OR; `storage.objects`; 42P13; `types.ts` é gerado do banco; ratchets param no primeiro que falha).
Acrescentam-se, medidas em 29/09:

| Verdade | Prova | Regra derivada |
|---|---|---|
| **36 migrations do módulo estão em produção sem estar em `main`** (28 num branch aberto, 8 só no ledger) | ledger × `git log --all` | Fase 0 é reconciliação, não implementação. Nenhum DDL novo no escopo antes de TC-08. |
| **Duas policies permissivas no mesmo `cmd` = a mais fraca vence** (R1) | `pg_policies` em `team_message_reactions` | Toda migration de policy termina com `ASSERT (SELECT count(*) FROM pg_policies WHERE tablename=… AND cmd=…) = 1`. |
| **Convenção de pasta no storage é `current_profile_id()`**, não `auth.uid()` (o INSERT já é assim e o front já grava `profile.id`) | policy `team_chat_files_insert` + `TeamFileUploader.tsx:66` | SELECT/DELETE seguem a mesma pasta; membership por `foldername[2]` = `conversation_id`. Decisão fecha R2. |
| **Índice duplicado é regressão, não "a mais"** | 2 pares idênticos | Antes de `CREATE INDEX`: `SELECT indexdef FROM pg_indexes WHERE tablename=…` no cabeçalho. |
| **Contrato de RPC muda por `DROP FUNCTION` + `CREATE` com nome `_v2` só se o antigo tiver consumidor em `main`** | R8 | Hoje **nenhuma** das 10 RPCs novas tem consumidor em `main` → podem ser reescritas in-place (mesmo nome), sem `_v2`. |
| `pg_stat_statements` está instalada | `pg_extension` | Baseline de performance é medível já. |

### Regras de execução

1. DDL: arquivo → PR → merge em `main` → apply por `db_query` na mesma transação do INSERT no ledger
   (`scripts/db-audit/register-migration.mjs`) → `supabase-usage-guard.mjs` `novas: 0` → paridade → `types-sync`
   mergeado no mesmo turno. **Exceção única: Fase 0 (reconciliação) registra o que JÁ está aplicado.**
2. Versão sempre por `SELECT supabase_migrations.reserve_migration_version('team-chat-tc','TC-##')` no turno da
   criação do arquivo; nome do arquivo = `<versão>_team_chat_<objeto>.sql` (o objeto, não o número da etapa).
3. Um objeto por migration. Cabeçalho com `-- Objetivo`, `-- Estado ao vivo antes (query + resultado + data)`,
   `-- Rollback`; rodapé `DO $$ … ASSERT … $$` para policy/função/índice.
4. Toda policy `TO authenticated`; SECDEF só quando precisa cruzar RLS, com `SET search_path = public` e `REVOKE
   FROM PUBLIC, anon`; leitura coberta por RLS é `SECURITY INVOKER`.
5. **Uma sessão por bloco DDL**, registrada na tabela de PRs (§11) **antes** de reservar versão. Sessão que
   encontrar reserva de outra no escopo para e avisa.
6. Front: branch de front só nasce depois do `types-sync` do bloco DDL correspondente estar em `main`.
7. Tokens de tema (`bg-inbox-panel`, `chat-sent/received`, `chat-header`, `chat-input-bg`), `sonner`, pt-BR fixo,
   zero re-fix de hash no `eslint-baseline.json`.
8. PRs de DDL ficam abertas aguardando Joaquim (regra 8 do fluxo Git); PRs de front mergeiam com CI verde.
9. Etapa DDL só fecha com o objeto conferido ao vivo; etapa de front só fecha com o teste do aceite verde.

---

## FASE 0 — Estancar o drift e reconciliar (TC-01–TC-10)
*Bloco R — 1 PR de reconciliação (a própria #1151, reaproveitada) + 1 PR de docs. Aguarda Joaquim para o merge
das migrations. Nada aqui muda o banco.*

- [ ] **TC-01** — Congelamento: comentar na PR #1151 e na issue #1166 que o escopo `team_*`/`department*`/
  `team-chat-files` está em reconciliação e que **nenhuma sessão aplica DDL nele** até TC-08. Registrar na §11.
  **Aceite:** comentário postado; `version_reservations` sem reserva nova no escopo após a hora do comentário.
- [ ] **TC-02** — Materializar as 8 versions só-ledger (`20260929260000`–`330000`): para cada uma, `SELECT
  statements FROM supabase_migrations.schema_migrations WHERE version = …` → arquivo `supabase/migrations/<versão>_team_chat_<objeto>.sql`
  com o SQL **exato** do ledger e cabeçalho "reconciliação: aplicado em 29/09 fora do fluxo; SQL lido do ledger".
  Conferir com `pg_get_functiondef` que o ledger bate com o objeto vivo (se divergir, o objeto vivo vence e o ledger é
  corrigido com `UPDATE … RETURNING`). **Aceite:** 8 arquivos; `md5(statements)` = `md5` do SQL do arquivo.
- [ ] **TC-03** — Conferir os 28 arquivos do branch #1151 contra o ledger: `node scripts/db-audit/register-migration.mjs
  <arquivo>` em dry-run gera o `statements` esperado; comparar com o registrado. Divergência = corrigir o **arquivo**
  (o banco é a verdade). **Aceite:** 28/28 iguais; relatório em `docs/team-chat/reconciliacao-2026-09-29.md`.
- [ ] **TC-04** — Fechar a PR #1151 como reconciliação: título "reconcile(team-chat): 36 migrations aplicadas em
  29/09 + auditoria + plano", corpo com a lista das 36 versions e o link da auditoria; adicionar os 8 arquivos de
  TC-02 e o relatório de TC-03; remover o "[NÃO MERGEAR]". Não mudar nenhum SQL já aplicado. **Aceite:** CI verde
  (`Contrato DB offline`, `db-guard` "Rejeitar edicao" não dispara porque nada em `main` é editado).
- [ ] **TC-05** — Merge da PR de reconciliação (aguarda Joaquim — é DDL, ainda que já aplicado) e, no mesmo turno,
  `types-sync` disparado e mergeado. **Aceite:** `grep -c "get_team_inbox\|get_team_messages_page\|
  mark_team_conversation_read\|search_team_messages\|toggle_team_reaction\|set_team_member_pref\|leave_team_group\|
  remove_team_member\|current_profile_id" src/integrations/supabase/types.ts` ≥ 9.
- [ ] **TC-06** — `db-live-guard` disparado manualmente após TC-05; issue #1166 recebe o comentário de resolução
  ou fecha. **Aceite:** run verde; paridade arquivos↔ledger = 0 diferenças no escopo.
- [ ] **TC-07** — Snapshot pós-reconciliação em `docs/team-chat/baseline-2026-09-29/` via
  `scripts/db-audit/team-chat-snapshot.mjs` (novo, reutilizável): `pg_policies`, `pg_constraint`, `pg_indexes`,
  `pg_proc` (nome, args, retorno, `prosecdef`, `proacl`), `role_table_grants`, `column_privileges`,
  `pg_publication_tables`, `relreplident`, `obj_description`/`col_description` — JSON, só metadados. **Aceite:**
  diretório commitado; script reproduz o JSON com `DESTINO_URL`.
- [ ] **TC-08** — Decisões registradas na §10 deste arquivo: (a) pasta de storage = `current_profile_id()`;
  (b) convites consolidados em `department_invitations`, `department_invites` dropada em TC-19 **depois** do front
  (TC-66); (c) RPCs novas sem consumidor podem ser reescritas in-place; (d) leitura: `last_read_at` = badge,
  receipts só por RPC; (e) papéis: `owner` é dono, grupo sempre com ≥ 1 owner; (f) presença via
  `useAgentPresenceMap`; (g) pt-BR fixo; (h) tokens de `src/styles/tokens.css`; (i) `announcement` fora.
  **Aceite:** §10 preenchida.
- [ ] **TC-09** — Teste de contrato RLS no `db-guard.yml` (job "Validar SQL de catalogo e manifesto no PostgreSQL 17"):
  aplica `supabase/migrations/*.sql` do escopo num banco limpo, cria 3 perfis (`admin`, `membro`, `estranho`) com
  `profiles.id ≠ user_id`, roda `scripts/db-audit/team-chat-rls.sql` com `SET ROLE authenticated; SET request.jwt.claims`.
  Primeira versão afirma o estado pós-reconciliação: estranho não lê mensagens; membro não move mensagem;
  `TRUNCATE` negado; `anon` sem acesso; **e já falha** para R1 (estranho reage) — o teste nasce vermelho e TC-11 o
  deixa verde. **Aceite:** job existe; falha com a policy `reactions_insert` presente.
- [ ] **TC-10** — Fixtures: 2 usuários de teste (`admin`, `agent`) com `profiles` + `user_roles`, 1 departamento
  `[E2E]`, 1 grupo, 1 direta — semeados em produção como o contato E2E de 24/09; `e2e/fixtures/team-chat.ts`;
  script `scripts/ci/team-chat-local-gates.sh` (tsc, lint-ratchet, typecheck-ratchet, implicit-any, usage-guard,
  vitest do módulo). **Aceite:** ids no fixture; script roda limpo em `main`.

## FASE 1 — Corrigir as regressões do apply de 29/09 (TC-11–TC-22)
*Bloco A — 1 PR de DDL (12 migrations). Aguarda Joaquim. Prioridade máxima: R1 e R2 estão ao vivo.*

- [ ] **TC-11** — R1: `DROP POLICY reactions_insert ON team_message_reactions` e recriar com `WITH CHECK (profile_id =
  current_profile_id() AND is_team_conversation_member(auth.uid(), (SELECT conversation_id FROM team_messages WHERE id
  = message_id)))`; `DROP POLICY team_message_reactions_insert` (a antiga, redundante); mesma consolidação para SELECT
  (`reactions_select` fica, `team_message_reactions_select` cai) e DELETE. **Aceite:** 1 policy por `cmd`; teste TC-09
  "estranho reage" passa a falhar (verde).
- [ ] **TC-12** — R2: storage `team-chat-files` — `DROP POLICY "Conversation members can read team chat files"`;
  `CREATE POLICY team_chat_files_select FOR SELECT TO authenticated USING (bucket_id='team-chat-files' AND
  ((storage.foldername(name))[1] = current_profile_id()::text OR is_admin_or_supervisor(auth.uid()) OR
  is_team_conversation_member(auth.uid(), ((storage.foldername(name))[2])::uuid)))`; `DROP POLICY "Users can delete
  own team chat files"` e recriar com `[1] = current_profile_id()::text`; manter INSERT e o DELETE de admin.
  Convenção documentada no arquivo: `<profiles.id>/<conversation_id>/<uuid>.<ext>`. **Aceite:** exatamente 1 SELECT,
  1 INSERT, 2 DELETE, todas `{authenticated}`; teste: membro B lê objeto de A na mesma conversa; estranho não.
- [ ] **TC-13** — R3: `get_department_whatsapp_credentials(p_department_id) RETURNS TABLE (mode text, instance_id
  text, has_api_key boolean)` — `DROP FUNCTION` + `CREATE` (42P13), STABLE SECDEF, `IF NOT is_admin_or_supervisor
  (auth.uid()) THEN RAISE 'not_authorized'`, `GRANT EXECUTE TO authenticated`, `REVOKE FROM PUBLIC, anon`.
  **Aceite:** admin recebe 1 linha/3 colunas; agente recebe erro tipado; chave nunca no retorno.
- [ ] **TC-14** — R5: `DROP INDEX idx_team_conv_members_profile_id` (duplicado); `CREATE INDEX
  idx_team_members_profile_active ON team_conversation_members (profile_id) WHERE NOT is_archived`; `DROP INDEX
  idx_team_members_profile`. **Aceite:** `pg_indexes` com o parcial e sem os 2 antigos.
- [ ] **TC-15** — R5: `CREATE INDEX idx_team_messages_conv_created_id ON team_messages (conversation_id,
  created_at DESC, id DESC)`; `DROP INDEX idx_team_messages_conv_created, idx_team_messages_conversation`.
  **Aceite:** consulta de duplicados no escopo = 0 pares; `EXPLAIN` de TC-30 usa o novo.
- [ ] **TC-16** — R6: `DROP CONSTRAINT team_conv_members_last_read_at_check`; `ADD CONSTRAINT … CHECK (last_read_at
  IS NULL OR last_read_at >= joined_at)`. **Aceite:** `pg_get_constraintdef` sem `now()`.
- [ ] **TC-17** — R7: `accept_department_invite(p_code)` reescrita in-place com `UPDATE profiles SET department_id =
  v_dept WHERE id = v_me`, erro `already_member` quando já está, `use_count`/`used_at`/`used_by`/`status` como no
  plano anterior, auditoria `invite_accepted` com `profile_name`. **Aceite:** aceitar muda `profiles.department_id`;
  2 aceites concorrentes com `max_uses=1` → 1 ok / 1 erro.
- [ ] **TC-18** — R10: `dept_audit_select_own_dept` → `USING (is_admin_or_supervisor(auth.uid()) OR department_id =
  (SELECT department_id FROM profiles WHERE id = current_profile_id()))`. **Aceite:** admin global lê qualquer depto;
  membro lê só o seu.
- [ ] **TC-19** — R4 (parte DDL, **executar só depois de TC-66 em `main` deployado**): `DROP TABLE department_invites`
  (0 linhas confirmadas no turno). Migration fica no PR desta fase mas o apply é adiado e registrado na §11.
  **Aceite:** `to_regclass` NULL; `grep -r department_invites src/` vazio antes do apply.
- [ ] **TC-20** — `team_conversations`: `REVOKE UPDATE ON team_conversations FROM authenticated; GRANT UPDATE (name,
  avatar_url, metadata, updated_at)`; policy `team_conversations_update_own` reescrita `USING/WITH CHECK (created_by
  = current_profile_id() OR is_admin_or_supervisor(auth.uid()) OR EXISTS (SELECT 1 FROM team_conversation_members m
  WHERE m.conversation_id = id AND m.profile_id = current_profile_id() AND m.member_role IN ('owner','admin')))`.
  **Aceite:** 4 colunas em `column_privileges`; owner renomeia; membro comum 0 linhas; `SET type` → 42501.
- [ ] **TC-21** — `departments`: `REVOKE INSERT (whatsapp_api_key, whatsapp_instance_id), UPDATE (whatsapp_api_key,
  whatsapp_instance_id) ON departments FROM authenticated` (a RPC `set_department_whatsapp_config` já existe);
  `CHECK (whatsapp_mode IN ('none','evolution','official'))`. **Aceite:** `column_privileges` sem as 4 linhas;
  UPDATE direto → 42501.
- [ ] **TC-22** — `team_conversation_members`: policy DELETE com regra do último owner (`member_role <> 'owner' OR
  (SELECT count(*) FROM team_conversation_members o WHERE o.conversation_id = conversation_id AND o.member_role =
  'owner') > 1` para o próprio; admin/owner da conversa para terceiros); INSERT `WITH CHECK (member_role = 'member' OR
  is_admin_or_supervisor(auth.uid()) OR EXISTS (owner da conversa))` + `is_team_conversation_member` **ou** conversa
  com 0 membros. Fechamento do bloco A: apply + ledger + guard + `types-sync` + `db-live-guard` + asserts TC-09
  (6 novos) + `diff-bloco-A.md` contra TC-07. **Aceite:** único owner tenta sair → 0 linhas; membro insere `owner` →
  42501; run verde.

## FASE 2 — Integridade pendente (TC-23–TC-30)
*Bloco B — 1 PR de DDL (8 migrations). Aguarda Joaquim. Tabelas vazias: sem backfill.*

- [ ] **TC-23** — `team_messages`: `CHECK (media_type IS NULL OR media_type IN ('image','video','audio','document',
  'sticker','emoji','audio_meme'))`; `CHECK (char_length(content) <= 10000)`. **Aceite:** `media_type='gif'` falha.
- [ ] **TC-24** — `team_messages`: `DROP CONSTRAINT team_messages_type_media_check` (olha `media_url`, legada) e
  `ADD CHECK (message_type IN ('text','system') OR (media_bucket = 'team-chat-files' AND media_path IS NOT NULL))`;
  `ALTER message_type_check` para incluir `'sticker'` (a `type_media_check` já aceitava); `COMMENT ON COLUMN media_url
  'deprecated: fallback de exibição; fonte é media_bucket/media_path'`. **Aceite:** imagem sem `media_path` falha;
  os 2 registros atuais passam (verificar `WHERE NOT (…)` = 0 antes).
- [ ] **TC-25** — `team_conversations`: `CHECK ((type='direct' AND direct_member_a IS NOT NULL AND direct_member_b IS
  NOT NULL AND direct_member_a < direct_member_b AND name IS NULL AND department_id IS NULL) OR (type='group' AND name
  IS NOT NULL AND direct_member_a IS NULL AND direct_member_b IS NULL AND department_id IS NULL) OR (type='department'
  AND department_id IS NOT NULL AND direct_member_a IS NULL AND direct_member_b IS NULL))`; `CHECK (name IS NULL OR
  char_length(name) <= 60)`; `CHECK (jsonb_typeof(metadata) = 'object')`; `find_or_create_direct_conversation`
  alinhada a comparar `uuid` nativo. Substitui `dept_required`/`group_name_required` (dropar as 2). **Aceite:** direta
  sem membros falha; RPC idempotente; `WHERE NOT (…)` = 0 antes.
- [ ] **TC-26** — `team_message_reactions`: trigger `BEFORE INSERT OR UPDATE OF message_id` que **força**
  `NEW.conversation_id := (SELECT conversation_id FROM team_messages WHERE id = NEW.message_id)`. **Aceite:** INSERT
  com `conversation_id` errado sai corrigido.
- [ ] **TC-27** — `team_message_receipts`: `CHECK ((status='delivered' AND read_at IS NULL) OR (status='read' AND
  read_at IS NOT NULL))` (substitui `read_at_required`), `CHECK (read_at IS NULL OR read_at >= delivered_at)`.
  **Aceite:** 2 INSERTs inválidos falham.
- [ ] **TC-28** — `department_invitations`: `DROP CONSTRAINT department_invitations_code_format` → `CHECK (code ~
  '^[A-Z0-9]{8}$')`; `CHECK (use_count <= max_uses)`; `create_department_invite` gera código nesse formato
  (verificar `prosrc`; ajustar in-place se gerar outro tamanho). **Aceite:** código de 7 chars falha; RPC gera 8.
- [ ] **TC-29** — `COMMENT ON COLUMN` para `direct_member_a/b`, `member_role`, `is_pinned/is_muted/is_archived`,
  `media_bucket/media_path`, `metadata`, `use_count/max_uses/used_at/used_by`, `receipts.conversation_id`,
  `reactions.conversation_id` — descrevendo os invariantes de TC-23–TC-28. **Aceite:** `col_description` não nulo
  para as 16 colunas.
- [ ] **TC-30** — Fechamento B: apply + ledger + guard + `types-sync` + `db-live-guard` + asserts TC-09 (reply
  cruzado, mídia sem path, 2º canal de depto, conversation_id forçado) + `diff-bloco-B.md`. **Aceite:** run verde.

## FASE 3 — Contratos das RPCs alinhados ao front (TC-31–TC-44)
*Bloco C — 1 PR de DDL. Aguarda Joaquim. As 10 RPCs de 29/09 não têm consumidor em `main` → reescrita in-place
(mesmo nome; `DROP FUNCTION` + `CREATE` quando o retorno muda).*

- [ ] **TC-31** — `get_team_inbox(p_include_archived boolean DEFAULT false)` com o contrato completo: `conversation_id,
  type, name, avatar_url, department_id, created_by, created_at, updated_at, member_role, is_pinned, is_muted,
  is_archived, last_read_at, unread_count int, last_message_id, last_message_content, last_message_type,
  last_message_sender_id, last_message_sender_name, last_message_created_at, other_profile_id, other_name,
  other_avatar_url, member_count int`; STABLE **SECURITY INVOKER**; LATERAL para última mensagem e contagem
  (`created_at > coalesce(last_read_at,'-infinity') AND sender_id <> me`); `ORDER BY is_pinned DESC, updated_at
  DESC`. **Aceite:** `EXPLAIN (ANALYZE, BUFFERS)` sem Seq Scan em `team_messages`; as 2 conversas reais voltam com
  `other_name` na direta.
- [ ] **TC-32** — `get_team_messages_page(p_conversation_id uuid, p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL, p_limit int DEFAULT 50)` keyset `(created_at, id) < (…)`, `ORDER BY created_at DESC,
  id DESC LIMIT least(p_limit,100)`, STABLE INVOKER, retorno com `status`, `sender_name/sender_avatar_url` e
  `reactions jsonb` (`jsonb_agg` por emoji `{emoji, count, profile_ids}`). **Aceite:** 3 páginas sobre 120 msgs
  sintéticas (transação revertida) sem repetir/pular; Index Scan Backward em `idx_team_messages_conv_created_id`.
- [ ] **TC-33** — `mark_team_conversation_read(p_conversation_id) RETURNS int` (linhas afetadas), exige membership,
  insere receipts só de mensagens alheias após o `last_read_at` antigo. **Aceite:** 100 msgs → 1 chamada → 2 statements
  em `pg_stat_statements`; `unread_count` = 0 no inbox.
- [ ] **TC-34** — View `team_message_read_state (message_id, conversation_id, member_count, read_count, all_read)`
  `security_invoker = on`; `all_read = read_count >= member_count - 1`. **Aceite:** `all_read=true` só quando todos os
  outros leram.
- [ ] **TC-35** — `search_team_messages` devolve `snippet` (`substring` ± 60 chars ao redor do primeiro match),
  rejeita `length(trim(p_query)) < 2`, escapa `%`/`_`; STABLE INVOKER. **Aceite:** `EXPLAIN` com Bitmap Index Scan no
  `idx_team_messages_content_trgm`; 1 char → erro.
- [ ] **TC-36** — `set_team_member_pref(p_conversation_id uuid, p_is_pinned boolean DEFAULT NULL, p_is_muted boolean
  DEFAULT NULL, p_is_archived boolean DEFAULT NULL) RETURNS void` INVOKER (`coalesce(param, col)`). **Aceite:** só
  `p_is_muted` não toca `is_pinned`.
- [ ] **TC-37** — `toggle_team_reaction` mantido (`jsonb` — decisão: o front consome `{reacted: boolean}`); conferir
  `prosrc`: 1 DELETE `RETURNING` → INSERT se 0; `SECURITY INVOKER` (RLS TC-11 cobre). **Aceite:** 2 chamadas voltam ao
  estado inicial; `prosecdef=false`.
- [ ] **TC-38** — `leave_team_group`/`remove_team_member`: ler `pg_get_functiondef` e garantir (in-place) regra do
  último owner, promoção do membro mais antigo a `owner`, deleção da conversa com 0 membros; erros tipados
  `last_owner`, `not_member`, `not_authorized`. **Aceite:** owner sai de grupo de 3 → outro vira owner; grupo de 1 →
  conversa some.
- [ ] **TC-39** — `transfer_team_conversation_department(p_conversation_id, p_to_department_id) RETURNS jsonb` SECDEF
  admin-only, só `type='department'`, `metadata || {transferred_at, transferred_by, original_department_id}`, erro
  `department_channel_exists` (unique parcial), auditoria `department_transferred` (acrescentar ao CHECK de `action`
  de TC-18 se faltar). **Aceite:** agente → `not_authorized`; admin → `metadata` preenchido.
- [ ] **TC-40** — `set_profile_department(p_profile_id, p_department_id) RETURNS void` SECDEF admin-only com auditoria
  `member_added`/`member_removed`. **Aceite:** agente não muda o depto de outro perfil.
- [ ] **TC-41** — `notify_team_mentions(p_message_id) RETURNS int` SECDEF: para cada `@nome` no `content` que case
  com membro da conversa, INSERT em `app_notifications` (conferir policy INSERT ao vivo — hoje nenhuma para
  `authenticated`). **Aceite:** mencionado ganha 1 linha em `app_notifications`.
- [ ] **TC-42** — `ALTER TABLE team_messages REPLICA IDENTITY DEFAULT` (grep `payload.old` no módulo = vazio);
  `COMMENT ON FUNCTION get_team_conversation_previews(), get_team_unread_counts() IS 'deprecated: usar
  get_team_inbox()'`. **Aceite:** `relreplident='d'`; comentários ao vivo.
- [ ] **TC-43** — Baseline de `pg_stat_statements` das 12 RPCs do módulo em `docs/team-chat/baseline-2026-09-29/
  pg_stat_statements.md` (calls, mean_exec_time, shared_blks_hit) + `EXPLAIN (ANALYZE, BUFFERS)` de TC-31/32/33/35.
  **Aceite:** 4 planos sem Seq Scan em `team_messages`; nenhuma RPC > 20 ms com os dados atuais.
- [ ] **TC-44** — Fechamento C: apply + ledger + guard + `types-sync` mergeado + `db-live-guard` + asserts TC-09
  (toggle, pref, leave, transfer, set_profile_department) + `diff-bloco-C.md`. A partir daqui `types.ts` tem todos os
  contratos das fases 4–7. **Aceite:** run verde; `grep` das 13 RPCs em `types.ts` = 13.

## FASE 4 — Camada de dados do front (TC-45–TC-56)
*Bloco D — 1 PR de hooks. Nasce após TC-44.*

- [ ] **TC-45** — `src/hooks/team-chat/queryKeys.ts` (fábrica) e migração das 40 chaves literais do módulo,
  incluindo `useTeamMemberDetails`, `useTeamChatMembers`, `useTeamPerformance`, `useParticipantStats`,
  `useDepartmentManagement`, `useActiveDepartments`. **Aceite:** `grep -rn "queryKey: \['" src/hooks/team-chat
  src/components/team-chat` vazio.
- [ ] **TC-46** — `teamChatTypes.ts` derivado de `types.ts`: `TeamInboxRow`, `TeamMessagePageRow`, `member_role:
  'owner'|'admin'|'member'`, `type: 'direct'|'group'|'department'`, `TeamMessageReaction`, `MessageUIStatus`,
  `metadata`, `is_pinned/is_muted/is_archived`. Zero `as any`/`as unknown as` novos. **Aceite:** `tsc -b --force`
  limpo.
- [ ] **TC-47** — `useTeamConversations` → 1 `rpc('get_team_inbox')`, mapeamento `other_*`, `refetchInterval` 30 s,
  canal `team:inbox:<pid>:<sfx>` (`team_messages` INSERT + `team_conversation_members` UPDATE filtrado por
  `profile_id=eq.<pid>`), `refetchOnReconnect`. Remove as 2 RPCs antigas e as 3 queries encadeadas. **Aceite:** 1
  request por refetch; fixadas no topo; `grep get_team_conversation_previews src/` vazio.
- [ ] **TC-48** — `useTeamMessages` → `useInfiniteQuery` sobre `get_team_messages_page`, cursor `{created_at, id}`,
  páginas concatenadas em ordem cronológica; realtime `INSERT` → busca a linha por `get_team_messages_page(cid, null,
  null, 1)` e `setQueryData` na página 0; `UPDATE`/`DELETE` → patch local; canal `team:messages:<cid>:<sfx>` com filtro.
  Remove de `useTeamChatPanel.ts` `olderMessages/oldestCursor/hasOlderMessages/isFetchingOlder/fetchOlderMessages`.
  **Aceite:** 200+ msgs sintéticas: novas primeiro, antigas ao rolar; `.from('team_messages')` = 0 no módulo.
- [ ] **TC-49** — `useMarkConversationRead(cid)` → `mark_team_conversation_read`, chamado em abrir, `visibilitychange`
  visible e INSERT com aba focada; invalida `inbox` e `readState`. Remove o efeito de `useTeamMessages.ts:40-72`.
  **Aceite:** badge zera ao focar; receipts só de mensagens alheias.
- [ ] **TC-50** — `uploadTeamMedia(file, conversationId)` em `src/hooks/team-chat/uploadTeamMedia.ts`: pasta
  `${profile.id}/${conversationId}/${crypto.randomUUID()}.${ext}` (convenção TC-08a), retorna `{bucket, path}`;
  usado por `TeamFileUploader.tsx:66`, `useTeamChatPanel.handleAudioSend` (`:248`, corrige a pasta) e
  `useTeamChatDraft.handlePaste` (`:68`); `media_url` nunca gravado; `getPublicUrl` removido. **Aceite:** upload de
  áudio como agente → 200 (hoje 403); `grep getPublicUrl` no módulo vazio.
- [ ] **TC-51** — `useResolvedStorageUrl({bucket, path})` via `useQuery` (`staleTime` 50 min, TTL 1 h), sem
  `setState` em efeito; `MediaContent` de `teamChatParts.tsx` é o único consumidor e lê `media_bucket/media_path`
  com fallback `media_url`. **Aceite:** imagem de A aparece para B após reload (TC-12); lint ratchet `novas: 0`.
- [ ] **TC-52** — `useTeamChatMutations`: `useSendTeamMessage` sem `updated_at`/`status`; `useEditTeamMessage` só
  `content` (trigger cuida de `is_edited`); `useToggleReaction` → `toggle_team_reaction` otimista + rollback na
  página; `useSetMemberPref` → `set_team_member_pref` (substitui `useToggleMuteConversation`); `useTransferDepartment`
  → TC-39; `useLeaveGroup`/`useRemoveMember` → TC-38; `useDeleteConversation` mantido; apagar `useTransferConversation`
  (`created_by`); `use-toast` → `sonner`. **Aceite:** `grep -rn "use-toast\|update({ is_muted\|update({ created_by"`
  no módulo vazio.
- [ ] **TC-53** — `useTeamMessageReactions` vira só realtime filtrado (`team:reactions:<cid>:<sfx>`) que faz
  `setQueryData` na mensagem afetada. **Aceite:** 0 requests extras de reações ao abrir conversa.
- [ ] **TC-54** — `useTeamReadState(cid)` sobre a view TC-34 + realtime `team:receipts:<cid>:<sfx>` filtrado →
  `all_read` por mensagem. **Aceite:** B lê → tick de A azul sem reload.
- [ ] **TC-55** — Rascunhos: manter `useTeamChatDraft`; teste unitário de `handlePaste` não limpar texto;
  `src/hooks/team-chat/README.md` com canais reais (`team:messages|reactions|receipts:<cid>:<sfx>`,
  `team:inbox:<pid>:<sfx>`, `team:typing:<cid>`, `team:presence`) e tabela hook × RPC. **Aceite:** nenhum nome de
  RPC/canal no README sem correspondente no código.
- [ ] **TC-56** — Fechamento D: `team-chat-local-gates.sh` limpo; `hooks/chat/useTeamChat.ts` e
  `hooks/team-chat/index.ts` re-exportando as novas assinaturas; PR mergeada. **Aceite:** CI verde.

## FASE 5 — Ligar componentes e completar UX (TC-57–TC-68)
*Blocos E (TC-57–TC-62) e F (TC-63–TC-68) — 2 PRs de front, paralelizáveis por arquivo.*

- [ ] **TC-57** — `TeamChatPanel.tsx` compõe `TeamMessageItem` + `TeamMessageReactionsWrapper` + `teamChatParts`;
  remove markup inline (`:164-258`), helpers locais (`:24-64`), reply duplicado (`:194-217`); `ErrorBoundary`
  "Erro ao carregar o chat"; < 200 linhas. **Aceite:** `wc -l` < 200; `grep -c reply` ≤ 2; reações e ticks visíveis.
- [ ] **TC-58** — `TeamMessageItem.tsx`: tokens `chat-sent/received(-foreground)`; "Mensagem apagada" para reply
  órfão; grid de 6 emojis no menu; `MessageStatus` lê `all_read`; `hover:bg-muted/50`; `bg-white/10` →
  `bg-chat-sent-foreground/10`. **Aceite:** 3 temas sem cor fixa.
- [ ] **TC-59** — Header ligado: `onToggleStats`, `canTransfer` (`useUserRole`), `onTransfer`, `onRenameGroup`,
  `onLeaveGroup`, `onPin`, `onArchive`, `onMute` (lê `membership.is_muted`); Fixar/Arquivar deixam de ser `disabled`;
  Performance deixa de ser "em breve"; TTS via `s.handleVoiceChange/handleSpeedChange` com seletor de voz. **Aceite:**
  os 6 itens funcionam e persistem ao reabrir; voz persiste após reload.
- [ ] **TC-60** — Tokens no módulo inteiro (`bg-inbox-panel`, `chat-header`, `chat-input-bg`); zerar as 16
  ocorrências de `bg-black|bg-card|bg-background`; apagar `src/styles/team-chat-tokens.css`; auditoria WCAG AA nos 3
  temas em `docs/team-chat/baseline-2026-09-29/contraste.md`. **Aceite:** grep vazio; tabela ≥ 4.5:1.
- [ ] **TC-61** — Scroll/paginação: `onNearTop` → `fetchNextPage`, âncora `useLayoutEffect`, "Carregando mensagens
  anteriores…", pílula "Pular para mensagens novas" + badge; corrige os 9 avisos "Cannot access refs during render"
  (`TeamChatPanel.tsx:102-116`). Sem virtualização (registrado). **Aceite:** teste RTL de scroll ao topo chama
  `fetchNextPage`.
- [ ] **TC-62** — Busca server-side: ⌘K, `useDebounce` 400 ms, `search_team_messages`, contador, clique rola até a
  mensagem carregando páginas, Esc local. **Aceite:** termo fora das 50 primeiras é achado.
- [ ] **TC-63** — `TeamConversationList`: debounce 300 ms, `aria-setsize/posinset`, ⌘F, chip "Arquivadas"
  (`p_include_archived`), fallbacks de preview ("Canal do departamento"/"Sem mensagens"), ícones por tipo, skeleton
  5 linhas. **Aceite:** teste RTL cobre filtros/teclado/arquivadas.
- [ ] **TC-64** — `GroupManagementDialog` ligado em `TeamMemberDetails` para `owner|admin`: renomear/avatar (bucket
  `avatars`)/remover/sair via TC-52; "Excluir conversa" com `AlertDialog` no header. **Aceite:** fluxo com 2 usuários.
- [ ] **TC-65** — `TransferConversationDialog` reescrito: Select de `useActiveDepartments`, chama TC-39, `data-testid`s.
  **Aceite:** admin transfere; agente não vê o item.
- [ ] **TC-66** — Presença real: `useAgentPresenceMap()` em `TeamMemberDetails.tsx:77` e
  `TeamMemberProfileHeader.tsx:74,81-82`; apagar `useTeamPresence.ts`. **Aceite:** `grep is_active
  src/components/team-chat` vazio (fora de testes).
- [ ] **TC-67** — Estatísticas ligadas: slot colapsável `ParticipantStatsGraph` ↔ `TeamPerformancePanel`;
  `useTeamPerformance` com `status`, `limit 2000`, chave da fábrica; `useParticipantStats` junta receipts; tokens nos
  gráficos; estados erro/vazio. **Aceite:** painéis renderizam com os dados reais sem `return null`.
- [ ] **TC-68** — Fechamento E/F: gates locais limpos; 2 PRs mergeadas; `TeamChatView` recebe `cid` da URL
  (`?view=team-chat&cid=`) para TC-79. **Aceite:** CI verde.

## FASE 6 — Departamentos (TC-69–TC-75)
*Bloco G — 1 PR de front. Depende de TC-13/17/18/40 aplicados.*

- [ ] **TC-69** — `useDepartmentManagement.ts`: convites via `create_department_invite`/`department_invitations`;
  `profile_id`/`created_by` nunca recebem `user.id`; `enabled` por aba; erros com `toast.error`; membros via
  `set_profile_department` (TC-40), não UPDATE em `profiles`. **Aceite:** criar convite como admin funciona; Network
  só com a query da aba ativa; `grep department_invites src/` vazio → **libera o apply de TC-19**.
- [ ] **TC-70** — WhatsApp de depto: salvar via `set_department_whatsapp_config`; ler via TC-13 (`mode, instance_id,
  has_api_key`); campo Instance ID; remover `@ts-expect-error` e `department_whatsapp_configs` (`:226`). **Aceite:**
  salvar/reabrir mostra modo e instance id; chave nunca no Network.
- [ ] **TC-71** — `DepartmentAuditView` com badges para as ações do CHECK vivo e CSV com escape de `\r`;
  `DepartmentInvitesView` com `use_count/max_uses`, status, "revogar" = `status='revoked'`. **Aceite:** convite aceito
  sai de pendentes; export abre no Excel sem quebrar linhas.
- [ ] **TC-72** — "Entrar via Código" no bloqueio (`TeamChatPanel.tsx:113-133`): input 8 chars →
  `accept_department_invite` → invalida `profile` + `inbox`; erros tipados; card "Solicitar acesso" via
  `notify_team_mentions`-like (`request_department_access` SECDEF se a policy de `app_notifications` exigir; migration
  extra neste bloco). **Aceite:** agente entra sem reload; código usado 2× falha na 2ª.
- [ ] **TC-73** — `isChannelMember = profile.department_id === conv.department_id || isAdminOrSupervisor`
  (`TeamChatPanel.tsx:75`); `TeamChatView` passa `canManageDepartments` (`useUserRole`) e `currentUserName`;
  departamentos carregados em todos os filtros. **Aceite:** admin abre qualquer canal; `Settings2` visível para admin.
- [ ] **TC-74** — Apply de TC-19 (`DROP TABLE department_invites`) após TC-69 em `main` deployado; `types-sync`;
  `known-violations.json` sem a tabela. **Aceite:** `to_regclass` NULL; `db-live-guard` verde.
- [ ] **TC-75** — Fechamento G: gates locais; PR mergeada. **Aceite:** CI verde.

## FASE 7 — Notificações, presença, digitação (TC-76–TC-82)
*Bloco H — 1 PR de front.*

- [ ] **TC-76** — Badge "Teams" na sidebar via `useTeamUnreadTotal()` (soma do cache do inbox) em `Sidebar.tsx:124`;
  apagar `useTeamUnreadCount.ts`. **Aceite:** badge com módulo fechado; zera ao ler.
- [ ] **TC-77** — Listener global em `AppShell`: `hooks/chat/useTeamChatNotifications` com canal
  `team:inbox:<pid>:<sfx>`, filtro por membership pelo cache, respeita `is_muted`; apagar
  `hooks/team-chat/useTeamChatNotifications.ts`; remover a chamada de `TeamChatView.tsx:20`. **Aceite:** notificação
  chega em `/contatos`; silenciada não toca.
- [ ] **TC-78** — "Digitando…": `useTeamTyping` em `TeamChatInputArea` (throttle 2 s, para em 3 s), header e lista
  consomem; canal `team:typing:<cid>`. **Aceite:** B vê "A está digitando…".
- [ ] **TC-79** — Menções: `MentionAutocomplete` com `useTeamChatMembers`; ao enviar com `@`, `notify_team_mentions`
  (TC-41). **Aceite:** mencionado recebe notificação in-app.
- [ ] **TC-80** — Push → conversa: `notificationclick` no SW abre `/?view=team-chat&cid=<id>`; `TeamChatView` lê
  `cid` (TC-68). **Aceite:** clique abre a conversa certa.
- [ ] **TC-81** — Realtime hardening: `removeChannel` em todos os cleanups (teste com mock), `channel.on('system')`
  logando `CHANNEL_ERROR`, `refetchOnReconnect` no inbox. **Aceite:** teste verifica `removeChannel` no unmount de
  cada hook.
- [ ] **TC-82** — Fechamento H: gates; PR mergeada. **Aceite:** CI verde.

## FASE 8 — Testes e faxina (TC-83–TC-92)
*Bloco I — 2 PRs.*

- [ ] **TC-83** — Testes de hooks com Supabase mockado: `useTeamConversations` (1 rpc, `other_*`), `useTeamMessages`
  (3 páginas, cursor, append realtime), `useMarkConversationRead`, `useToggleReaction` (otimista + rollback),
  `useSetMemberPref`, `uploadTeamMedia` (pasta `profile.id/cid/`). **Aceite:** 6 arquivos verdes.
- [ ] **TC-84** — Substituir os 219 + 52 `expect(true).toBe(true)` por asserts reais ou apagar; apagar
  `team-chat-exhaustive-audit.test.ts` e `rls-contract.test.ts` (TC-09 substitui). **Aceite:** `grep -c
  "expect(true).toBe(true)"` = 0 no módulo; cobertura ≥ 70 % linhas.
- [ ] **TC-85** — RTL: `TeamMessageItem`, `TeamMessageReactionsWrapper`, `TeamConversationList`, `TeamChatHeader`
  (6 ações), `DepartmentInvitesView`, "Entrar via Código". **Aceite:** 6 arquivos verdes.
- [ ] **TC-86** — Faxina de órfãos: apagar `src/i18n/team-chat.ts`, `TeamChatA11y.tsx` (mover
  `usePrefersReducedMotion` se houver consumidor), `scripts/team-chat-db-validate.mjs`; conferir que os 10 órfãos da
  auditoria ou têm importador ou não existem. **Aceite:** script de órfãos (grep de importadores) = 0.
- [ ] **TC-87** — `scripts/ci/eslint-baseline.json`: zerar as violações reais dos 7 arquivos do módulo e remover as 88
  entradas. **Aceite:** nenhuma entrada `team-chat`; `lint-ratchet` `novas: 0`.
- [ ] **TC-88** — E2E `e2e/team-chat.spec.ts` com os fixtures de TC-10: abrir módulo, enviar texto, reagir, marcar
  lida, fixar, silenciar, buscar, anexar; habilitado no `e2e-logado.yml`; verificar antes que o usuário de teste vê
  "Teams". **Aceite:** verde nos 3 browsers.
- [ ] **TC-89** — Contrato RLS (TC-09) estendido com asserts das fases 1–3 (≥ 15 asserts). **Aceite:** remover
  qualquer policy do escopo localmente faz o job falhar.
- [ ] **TC-90** — `DROP FUNCTION get_team_conversation_previews(), get_team_unread_counts()` — `grep` no `src/` vazio
  e `main` deployado antes; migration + ledger. **Aceite:** `pg_proc` sem as 2.
- [ ] **TC-91** — Re-medição de `pg_stat_statements` (TC-43) após 1 semana de uso real. **Aceite:** nenhuma RPC com
  `mean_exec_time > 20 ms`.
- [ ] **TC-92** — Fechamento I: PRs mergeadas; `db-live-guard` verde. **Aceite:** CI verde.

## FASE 9 — Validação em produção e encerramento (TC-93–TC-100)

- [ ] **TC-93** — Deploy do front confirmado na Vercel (último merge de front) — `github_list_workflow_runs` +
  deployment READY. **Aceite:** URL de produção com o build do SHA de `main`.
- [ ] **TC-94** — Teste funcional com 2 usuários reais — parte 1 (mensagens): direta, grupo, canal de depto, texto,
  anexo, áudio, imagem colada, reação, reply, edição, exclusão com confirmação. **Aceite:** checklist com data/hora e
  executor na §12.
- [ ] **TC-95** — Parte 2 (preferências e gestão): mute, fixar, arquivar, renomear grupo, remover membro, sair,
  transferir depto, "Entrar via Código", convite 2× falha. **Aceite:** idem.
- [ ] **TC-96** — Parte 3 (notificações e mobile): badge sidebar, notificação com módulo fechado, digitando, menção,
  push → conversa, layout mobile. **Aceite:** idem.
- [ ] **TC-97** — Snapshot final (`team-chat-snapshot.mjs`) → `diff-final.md` contra TC-07; paridade tripla
  arquivos↔ledger↔catálogo; publication conferida. **Aceite:** 0 diferenças inexplicadas.
- [ ] **TC-98** — CLAUDE.md do V2 ganha seção "Team Chat": verdades da §0, convenção de pasta do storage, modelo de
  leitura, convites, papéis, RPCs canônicas, canais, e o incidente de 29/09 (DDL de branch aberto) como lição.
  **Aceite:** seção presente.
- [ ] **TC-99** — Este arquivo recebe checklist final com links das PRs e datas de apply; follow-ups fora de escopo
  listados (virtualização, comandos "/", fila offline, recibos `played`, i18n, `announcement`). **Aceite:** §11 e §12
  completas.
- [ ] **TC-100** — Encerramento: "Pronto" = PR mergeada + deploy confirmado + comportamento verificado (TC-93–TC-96);
  os 3 planos anteriores recebem no cabeçalho "SUPERSEDIDO por docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md".
  **Aceite:** 3 cabeçalhos atualizados no mesmo PR de fechamento.

---

## 10. Decisões registradas (TC-08)

*(preencher na TC-08)*

## 11. Mapa de PRs e sessões (TC-01/TC-08)

| Bloco | Etapas | Tipo | Gate | Sessão | PR | Aplicado em |
|---|---|---|---|---|---|---|
| R | TC-01–TC-10 | reconciliação + CI | merge aguarda Joaquim | — | #1151 (reaproveitada) | já aplicado (29/09) |
| A | TC-11–TC-22 | DDL (12) | Aguarda Joaquim | — | — | — |
| B | TC-23–TC-30 | DDL (8) | Aguarda Joaquim | — | — | — |
| C | TC-31–TC-44 | DDL (RPCs) | Aguarda Joaquim | — | — | — |
| D | TC-45–TC-56 | Front (hooks) | CI verde, **após TC-44** | — | — | — |
| E/F | TC-57–TC-68 | Front (UI) | CI verde | — | — | — |
| G | TC-69–TC-75 | Front (deptos) + apply TC-19 | CI verde; TC-74 aguarda Joaquim | — | — | — |
| H | TC-76–TC-82 | Front (notificações) | CI verde | — | — | — |
| I | TC-83–TC-92 | Testes + faxina + TC-90 | CI verde; TC-90 aguarda Joaquim | — | — | — |
| J | TC-93–TC-100 | Validação + docs | — | — | — | — |

**Ordem obrigatória:** R → A → B → C **aplicados** → D → (E/F, G, H em paralelo) → I → J.

## 12. Checklist de validação em produção (TC-94–TC-96)

*(preencher na execução)*

---

*Plano criado em 2026-09-29 a partir de `AUDITORIA_TEAM_CHAT_2026-09-29.md`. Nenhuma etapa executada.*
