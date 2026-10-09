# Segurança (leitura) — regras de acesso de contatos, mensagens e atribuição

- **Cartão:** Y24 · **Especialista:** worker (sql) · **Data:** 2026-10-07
- **Tipo:** auditoria em LEITURA. Nada foi alterado no produto: este documento é o único entregável.
- **Escopo:** policies, funções e grants de `contacts`, `messages`, `conversation_events` e correlatas; a função `is_contact_visible_to_user` e quem a usa; tabelas sem RLS; policies `USING (true)` ou sem `WITH CHECK`; escrita por papel errado; vazamento por RPC `SECURITY DEFINER` (`get_inbox_contact_summaries`, `get_last_message_dates`, `get_team_inbox`); enumeração de UUID.

## Como esta revisão foi feita (e o que ela NÃO é)

Não houve acesso ao banco de produção (regra R1). A análise é **estática**, sobre o repositório:

- `supabase/migrations/**` — 800 arquivos; reconstruí o **estado final** de cada policy/RLS/função por replay textual ordenado (CREATE/DROP/ALTER POLICY, `ENABLE ROW LEVEL SECURITY`, último `CREATE OR REPLACE FUNCTION` vence).
- `supabase/schema-manifest.json` — retrato do schema **canônico em 2026-10-05T21:05Z** (policies por `tabela."nome"`, `relation_grants`, `routine_grants`). Usei-o como fonte de verdade de **quais** policies existem.
- `supabase/schema-catalog.json` (colunas/constraints), `supabase/functions/**` e `src/**` — para confirmar uso real e caminhos alternativos.
- As 4 migrations de 2026-10-06 e a de 2026-10-05 não entram no retrato acima; leias direto quando citadas.

O resultado do replay bateu com o retrato canônico para todas as tabelas do escopo, exceto por 4 policies de `contact_notes` e 2 de `sicoob_contact_mapping` (substituídas em bloco dinâmico) — sem efeito nos achados abaixo.

**Nível de severidade usado neste relatório** (o cartão só fixa o P0; explicito o resto para não inflar):
`P0` = leitura/escrita de dado de terceiro fora do próprio alcance, explorável por `authenticated`/`anon` · `P1` = vazamento de metadado sensível (existência de UUID) ou escrita indevida de integridade relevante, explorável por `authenticated` · `P2` = endurecimento relevante / bypass com pré-condição conhecida / risco latente · `P3` = informativo.

**Nenhum achado P0.** Os três achados P1 vão marcados URGENTE.

---

## URGENTE — P1

### SEC-RLS_CONTATOS_MENSAGENS-01 — `messages`: INSERT/UPDATE não fixam a ORIGEM da mensagem (mensagem de entrada forjável) — P1

**Evidência**
- `supabase/migrations/20260925120000_fix_messages_insert_rls_contact_visibility.sql:20-41` — a policy de INSERT valida apenas `agent_id` (próprio perfil) e a visibilidade do `contact_id`. Não há condição sobre `sender`, `content`, `created_at`, `is_read` nem `status`.
- `supabase/migrations/20260925223000_messages_update_policy_queue_parity.sql:9-23` — a policy de UPDATE também não restringe `sender`/`content`.
- `supabase/migrations/20251215163158_8fcb49be-34d2-4749-a644-f943eaf83c4a.sql:6` — a coluna só tem `CHECK (sender IN ('agent','contact'))`; a constraint aceita as duas origens.
- O próprio arquivo de 20260925120000 (linhas 1-12) registra que a versão anterior permitia "forjar histórico de conversa"; a correção amarrou o `contact_id`, deixa `sender` em aberto.

**Cenário de exploração (3 passos)**
1. Agente autenticado (qualquer um com um contato acessível pela carteira/fila).
2. `POST /rest/v1/messages` com `{ "contact_id": "<contato acessível>", "sender": "contact", "content": "quero cancelar tudo", "message_type": "text" }`.
3. A linha entra como **mensagem do cliente**, conta como não lida e alimenta contadores/SLA — histórico e métricas falsos.

**Correção sugerida (NÃO aplicada)** — exigir que o papel de aplicação só insira/edite mensagem com origem de agente:
```sql
-- nova migration
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
CREATE POLICY "Users can insert messages" ON public.messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_privileged_contact_caller()   -- service_role/postgres/cron seguem ingerindo inbound
  OR (
    sender = 'agent'
    AND (agent_id IS NULL OR agent_id = public.get_profile_id_for_user(auth.uid()))
    AND ( /* ... predicado de contato visível que já existe ... */ )
  )
);
-- e o mesmo `sender = 'agent'` no WITH CHECK da policy de UPDATE (criar o WITH CHECK explícito)
```
`is_privileged_contact_caller()` já existe (`20260930090000`). **Esforço:** baixo (1 migration + 1 prova de banco vermelho→verde).

### SEC-RLS_CONTATOS_MENSAGENS-02 — `require_contact_edit_permission`: erro distingue "não existe" de "não posso ver" (oráculo de UUID) — P1

**Evidência** — `supabase/migrations/20260930090000_harden_status_and_wa_tag_rpc_authorization.sql:73-89`:
```sql
SELECT assigned_to, queue_id INTO v_assigned_to, v_queue_id FROM public.contacts WHERE id = p_contact_id;
IF NOT FOUND THEN
  RAISE EXCEPTION 'contact not found: %', p_contact_id;      -- UUID NÃO existe
END IF;
...
IF NOT (v_is_admin OR public.can_edit_contact(...)) THEN
  RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';  -- UUID EXISTE mas fora do alcance
END IF;
```
A função é `SECURITY DEFINER` com `GRANT EXECUTE ... TO authenticated` e é chamada direto pela `set_conversation_status` (mesmo arquivo, linha 147) — ou seja, o oráculo é alcançável por qualquer `authenticated`.

**Cenário de exploração (3 passos)**
1. Autenticar como agente comum.
2. `POST /rest/v1/rpc/require_contact_edit_permission { "p_contact_id": "<uuid candidato>" }`.
3. Ler o texto do erro: `contact not found: ...` ⇒ o UUID **não existe**; `contact_not_authorized` ⇒ o contato **existe** (enumeração de contatos por UUID, o mesmo defeito que `get_last_message_dates` teve em `20260924221209`).

**Correção sugerida (NÃO aplicada)**
```sql
-- unificar a mensagem e não ecoar o id
IF NOT FOUND THEN
  RAISE EXCEPTION 'contact_not_authorized' USING ERRCODE = '42501';
END IF;
```
**Esforço:** baixo.

### SEC-RLS_CONTATOS_MENSAGENS-03 — `can_delete_contacts` devolve linha para contato existente fora do alcance (oráculo de UUID) — P1

**Evidência** — `supabase/migrations/20260929820000_contacts_can_delete_contacts_hoisted_params.sql:19-29`: o `WHERE` é só `c.id = ANY(p_ids) AND c.deleted_at IS NULL`; o predicado de permissão está no `SELECT` (`can_delete`), não no filtro — então contato **invisível** também retorna linha (`can_delete=false`). `GRANT EXECUTE ... TO authenticated` (herdado de `20260929770000`).

**Cenário de exploração (3 passos)**
1. Autenticar como agente comum.
2. `POST /rest/v1/rpc/can_delete_contacts { "p_ids": ["<uuid candidato>"] }`.
3. Retornou linha ⇒ contato **existe**; sem linha ⇒ não existe (o comentário da própria função diz "inexistentes … não retornam linha" — o alcance, porém, não é filtrado).

**Correção sugerida (NÃO aplicada)** — filtrar no `WHERE` (a UI só pede ids que já estão na lista visível):
```sql
  FROM public.contacts c
  WHERE c.id = ANY(p_ids)
    AND c.deleted_at IS NULL
    AND public.can_edit_contact(c.assigned_to, c.queue_id,
          (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v),
          (SELECT public.get_profile_id_for_user(auth.uid())),
          (SELECT public.is_admin_or_supervisor(auth.uid())));
```
**Esforço:** baixo.

---

## P2

### SEC-RLS_CONTATOS_MENSAGENS-04 — `message_reactions`: `user_id` não é amarrado ao chamador (personificação e remoção de reação de terceiros) — P2

**Evidência** — a coluna `user_id` é FK de `profiles.id` (`supabase/migrations/20251220181300_aa931cb8-3812-4396-983e-123d19f73ad8.sql:29`). Nenhuma das policies de escrita o amarra ao autor:
- `supabase/migrations/20260413133214_75a73092-8328-4b6a-8bac-9e2a75934a4d.sql:68-80` (INSERT), `:86-99` (UPDATE), `:104-118` (DELETE) — só checam visibilidade do `contact_id`/mensagem.
- `supabase/migrations/20260401003034_46580962-a5ba-41f5-b4b1-b05887b4b490.sql:41` — "Users can insert reactions for assigned contacts": idem.
- As permissivas somam por OR; a insert legada (`20251231115910`) também não fixa o autor.

**Cenário de exploração (3 passos)**
1. Autenticar; escolher uma mensagem de contato acessível.
2. `POST /rest/v1/message_reactions { "message_id": "...", "user_id": "<id de outro perfil>", "emoji": "👍" }` (o cliente legítimo manda o próprio id — `src/hooks/reactions/useReactionMutations.ts:69`).
3. A reação aparece **atribuída a outro usuário**; o mesmo vale para alterar/excluir a reação alheia (a policy de DELETE não exige ser o autor).

**Correção sugerida (NÃO aplicada)**
```sql
-- nas policies de INSERT/UPDATE/DELETE de message_reactions
AND user_id = public.get_profile_id_for_user(auth.uid())
```
**Esforço:** médio (confirmar contrato com `src/hooks/reactions/**` e cobrir com prova de banco).

### SEC-RLS_CONTATOS_MENSAGENS-05 — `anon` tem privilégios de tabela (inclusive TRUNCATE) em 17 tabelas de contatos/mensagens — P2

**Evidência** — `supabase/schema-manifest.json` → `relation_grants`, chaves `r:public.<tabela>|anon|<PRIV>`. As 17: `conversation_events`, `contact_custom_fields`, `contact_identity_map`, `conversation_closures`, `conversation_memory`, `conversation_sla`, `conversation_snoozes`, `conversation_tasks`, `favorite_contacts`, `pinned_conversations`, `message_reactions`, `message_templates`, `scheduled_messages`, `campaign_contacts`, `contact_purchases`, `sicoob_contact_mapping`, `ai_conversation_tags` — cada uma com `SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN` para `anon`.
`contacts`, `messages` e `contact_notes` já estão limpos (só `authenticated`), porque foram endurecidos (ex.: `20260909200000:128`).

**Cenário de exploração**
Hoje **não é explorável pelo PostgREST**: toda policy do escopo exige `auth.uid()` (nulo para `anon`) e o PostgREST não emite `TRUNCATE`. O risco é de defesa em profundidade: `TRUNCATE` **ignora RLS** e qualquer caminho futuro/credencial `anon` que execute SQL direto apaga a tabela inteira.

**Correção sugerida (NÃO aplicada)** — alinhar ao padrão já usado:
```sql
REVOKE ALL PRIVILEGES ON TABLE
  public.conversation_events, public.contact_custom_fields, public.contact_identity_map,
  public.conversation_closures, public.conversation_memory, public.conversation_sla,
  public.conversation_snoozes, public.conversation_tasks, public.favorite_contacts,
  public.pinned_conversations, public.message_reactions, public.message_templates,
  public.scheduled_messages, public.campaign_contacts, public.contact_purchases,
  public.sicoob_contact_mapping, public.ai_conversation_tags
FROM anon;
```
**Esforço:** baixo (migration mecânica + conferência de grants).

### SEC-RLS_CONTATOS_MENSAGENS-06 — `conversation_tasks` INSERT não valida a visibilidade do contato (o guard só cobre UPDATE) — P2

**Evidência**
- `supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql:139-144` — `tasks_insert_own` valida só `created_by = current_profile_id()`.
- `supabase/migrations/20260924110946_add_with_check_conversation_tasks_update.sql:48-51` — o trigger de forja `trg_prevent_conversation_task_field_forgery` é **`BEFORE UPDATE`**; no INSERT (`OLD` nulo) ele não roda.
- `supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql:1127-1129` — corpo vigente do trigger: só reage a mudança de `contact_id` em UPDATE.

**Cenário de exploração (3 passos)**
1. Autenticar como agente sem acesso ao contato-alvo (mas conhecendo o UUID).
2. `POST /rest/v1/conversation_tasks { "title": "x", "contact_id": "<uuid fora do alcance>", "created_by": "<próprio perfil>" }`.
3. Tarefa gravada apontando para contato invisível (integridade/consistência; hoje o SELECT da tabela é por autor, então não vaza dado do contato).

**Correção sugerida (NÃO aplicada)** — cobrir o INSERT:
```sql
-- incluir no WITH CHECK de tasks_insert_own
AND (contact_id IS NULL OR public.is_contact_visible_to_user(contact_id, auth.uid()))
-- e/ou estender o trigger para BEFORE INSERT OR UPDATE
```
**Esforço:** baixo.

---

## P3

### SEC-RLS_CONTATOS_MENSAGENS-07 — 9 policies sem `TO authenticated` (aplicam-se a PUBLIC) — P3

**Evidência** — `supabase/migrations/20260924230500_fix_contact_id_idor_snoozes_pins_favorites.sql`: `conversation_snoozes` "Users can create own snoozes" (`:27`); `favorite_contacts` view/create/update/delete (`:40`, `:45`, `:53`, `:59`); `pinned_conversations` view/create/update/delete (`:67`, `:72`, `:80`, `:86`). Sem cláusula `TO`, a policy vale para `PUBLIC` — inclui `anon`. Hoje **não é explorável**: todos os predicados passam por `auth.uid()`, nulo para `anon`.

**Correção sugerida (NÃO aplicada):** adicionar `TO authenticated` nas 9. **Esforço:** trivial.

### SEC-RLS_CONTATOS_MENSAGENS-08 — `message_reactions_select_policy` compara `profiles.id` com `auth.users.id` (cláusula morta) — P3

**Evidência** — `supabase/migrations/20260830110000_extend_special_agent_visibility_to_related_tables.sql:73` usa `OR user_id = auth.uid()`, mas `message_reactions.user_id` referencia `profiles.id` (`20251220181300:29`). O comentário do próprio arquivo (linha 62) afirma que "user_id é auth.users.id" — **incorreto**. A cláusula nunca é verdadeira (reduz a visibilidade de quem usa a listagem própria; não amplia acesso).

**Correção sugerida (NÃO aplicada):** trocar por `user_id = public.get_profile_id_for_user(auth.uid())` e corrigir o comentário. **Esforço:** trivial.

### SEC-RLS_CONTATOS_MENSAGENS-09 — `conversation_events`: INSERT aceita `performed_by` nulo e não cobre a fila/carteira estendida — P3

**Evidência** — `supabase/migrations/20260412170036_1c09550f-234f-4215-954f-9e0efd5ed610.sql:10-22`: o `WITH CHECK` aceita `performed_by IS NULL` (evento "de sistema" forjável por usuário) e usa `c.assigned_to = (perfil do chamador)` em vez de `is_contact_visible_to_user` (não cobre `special_agent`/fila). Impacto baixo (evento de auditoria sem ator); a leitura da tabela é correta.

**Correção sugerida (NÃO aplicada):** exigir `performed_by = current_profile_id()` para chamadores não privilegiados e trocar o predicado por `public.is_contact_visible_to_user(contact_id, auth.uid())`. **Esforço:** baixo.

---

## Verificado e SEM problema (prova de cobertura)

| Item verificado | Resultado |
|---|---|
| RLS ligado em **todas** as 31 tabelas do escopo (contatos/mensagens/conversas) | OK — `ENABLE ROW LEVEL SECURITY` em todas; **nenhuma tabela sem RLS**; nenhum `DISABLE ROW LEVEL SECURITY` no repositório |
| Policies com `USING (true)` ou `WITH CHECK (true)` em tabela do escopo | **Nenhuma viva.** As que existiram foram removidas: `conversation_events` (`20260409222809:169`, `20260409190343:93`), `sicoob_contact_mapping` (`20260401001655:9`, `20260320133103:2`) |
| `is_contact_visible_to_user(_contact_id, _user_id)` | OK — `SECURITY DEFINER`, `search_path=public,pg_temp`, exige `_user_id = auth.uid()`, `REVOKE ... FROM PUBLIC, anon` e `GRANT` a `authenticated, service_role` (`20260909200000:55-89`). Não serve de oráculo: devolve `false` tanto para inexistente quanto para invisível |
| Quem usa `is_contact_visible_to_user` (policies) | OK — `contact_notes` (4), `contact_purchases` (4), `conversation_closures` (2), `conversation_memory` (3), `crm_contact_links` (1), `ai_conversation_tags` (1), `conversation_analyses` (2) — todas com o `contact_id` da própria linha |
| Quem usa `is_contact_visible_to_user` (funções) | OK — `get_inbox_contact_summaries`, `get_last_message_dates`, `close_conversation_atomic`, `enqueue_outbound_message` (+variante com `p_caption`), `enqueue_rich_outbound_message`, `get_conversation_tab_counts`, `require_contact_edit_permission`, `prevent_conversation_task_field_forgery`, `talk_me_claim`, `talk_me_list_waiting` |
| `get_inbox_contact_summaries(uuid[])` | OK — filtra cada id por `is_contact_visible_to_user`; sem oráculo (inexistente e invisível devolvem zero linhas); `REVOKE ... FROM PUBLIC, anon` e `GRANT` a `authenticated, service_role` (`20261005124628:53,97-99`) |
| `get_last_message_dates(uuid[])` | OK — corrigido em `20260924221209:28-41` (filtra por visibilidade); `GRANT` só a `authenticated, service_role` |
| `get_team_inbox()` | OK — `SECURITY DEFINER` que só devolve conversas em que o chamador é membro (`JOIN team_conversation_members ... m.profile_id = current_profile_id()`), `REVOKE ... FROM PUBLIC, anon` (`20260929260000:6-10`) |
| `set_conversation_status` | OK — apesar do `GRANT` a `authenticated` (necessário ao fixture E2E), há guard interno `require_contact_edit_permission` antes de qualquer efeito (`20260930090000:147`) |
| RPCs `SECURITY DEFINER` com `EXECUTE` para `anon` ou `PUBLIC` | **Zero** em todo o schema (`schema-manifest.json` → `routine_grants`) |
| `contacts` — SELECT/UPDATE | OK — predicado único `can_edit_contact(...)` (`20260929810000:65-78`); sem `assigned_to IS NULL`; reatribuição de responsável/fila bloqueada por `trg_prevent_contact_assignee_hijack` / `trg_prevent_contact_queue_hijack` |
| `contacts` — INSERT | OK — só admin/supervisor ou auto-atribuição (`20260404173121:24-35`) |
| `contacts` — DELETE | OK — não existe policy de DELETE (nega por padrão); exclusão é soft-delete via `delete_contact(s)` com o mesmo predicado |
| `messages` — SELECT | OK — admin OU carteira (`get_visible_agent_ids`) OU membro ativo da fila (`20260902023200:21-36`) |
| `messages` — DELETE | OK — sem policy (nega por padrão) |
| `messages` — campos internos de entrega | OK — `trg_guard_message_delivery_internal_fields` (BEFORE INSERT OR UPDATE) bloqueia `client_message_id`/claims para papéis ≠ `postgres`/`service_role` (`20260909220000:74-108`) |
| `contact_notes` | OK — 4 policies endurecidas com `author_id = get_profile_id_for_user(auth.uid())` + visibilidade; `REVOKE ALL ... FROM anon`; trigger de imutabilidade de `contact_id`/`author_id` (`20260909200000:128-214`) |
| `contacts`/`messages`/`contact_notes` — grants para `anon` | OK — só `authenticated`, `service_role` e `postgres` |
| `contact_deletion_audit` | OK — SELECT só admin/supervisor; INSERT/UPDATE/DELETE explicitamente negados a `authenticated` (`20260930170000`) |
| `campaign_contacts`, `crm_contact_links` (`FOR ALL`) | OK — ambas admin/supervisor |
| `conversation_sla`, `ai_conversation_tags`, `conversation_closures`, `conversation_memory`, `contact_purchases`, `conversation_analyses`, `message_templates`, `scheduled_messages`, `favorite_contacts`, `pinned_conversations`, `conversation_snoozes` | OK — leitura/escrita sempre presa ao próprio perfil/contato visível |
| `search_contacts`, `delete_contact(s)`, `merge_contacts_atomic`, `close_conversation_atomic`, `talk_me_claim`, `talk_me_list_waiting` | OK — filtram por `can_edit_contact`/`is_contact_visible_to_user` e revogam `anon` |
| Colunas/extras: `contact_identity_map` (só `supervisor_read`), `sicoob_contact_mapping` (SELECT admin + INSERT admin) | OK |
| `contact_assignments` (citada no cartão) | **Não existe** no schema atual (nem no catálogo). A atribuição vive em `contacts.assigned_to`/`queue_id`; a legada só aparece em `docs/plans/PLANO_100_ETAPAS_PARIDADE_V1_V3_2026-09-01.md:859`. Nada a revisar |

## Observações fora do escopo (registradas, não pontuadas)

- `record_incoming_call_event(p_contact_id, ...)` é `SECURITY DEFINER` sem guarda de visibilidade, mas o `EXECUTE` está só em `service_role`/`postgres` — a revisão da área de ligações cabe ao Y25/Y26.
- `talkx_recipient_is_suppressed`, `talkx_suppress_contact`, `attribute_talkx_reply` — `service_role` apenas; fora do escopo de contatos/mensagens deste cartão.
- A coluna `conversation_snoozes`/`pinned_conversations` não filtra fila/carteira estendida (só o próprio perfil) — decisão de produto, sem impacto de segurança.
