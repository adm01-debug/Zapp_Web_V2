# RELATORIO-W2-SEGURANCA-PG

**Onda 2 — auditoria adversarial de segurança no Postgres**
Repo: `adm01-debug/Zapp_Web_V2` · Banco canônico: `tnnnlkbymytvtqngbbqh` (Supabase)
Escopo: **tudo que as migrations de 29/09/2026 criaram/alteraram** — funções, triggers, policies, ACLs.
Workspace: `~/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae` (HEAD `77f1a054`)
Data da auditoria: 29/09/2026 · Autor: frente de banco (Onda 2)

---

## 0. Veredito em uma página

| # | Achado | Severidade | Demonstrado? |
|---|---|---|---|
| A1 | `toggle_team_reaction` (RPC do dia, E41) **não valida vínculo**: `authenticated` escreve reação em mensagem de conversa de outro time, e os membros do time invadido **enxergam** a reação | **ALTO** | **Sim** — exploit executado |
| A2 | `mark_team_conversation_read` (RPC do dia, E39) **não valida vínculo**: cria `team_message_receipts` em conversa alheia | MÉDIO | **Sim** |
| A3 | Causa-raiz de A1/A2: `team_message_reactions` e `team_message_receipts` têm policy de INSERT que só exige `profile_id = current_profile_id()`, **sem condição de vínculo**. Corrigir as RPCs não fecha o caminho direto via PostgREST | MÉDIO (raiz de A1) | **Sim** — INSERT direto aceito |
| A4 | `can_edit_contact(uuid, uuid, uuid[], uuid, boolean)` (#1198, params "hoisted"): `SECURITY DEFINER` que recebe os **insumos da autorização** (`p_visible_agent_ids`, `p_profile_id`, `p_is_admin`) como parâmetro do chamador e tem `EXECUTE` para `authenticated`. `p_is_admin := true` devolve `true` para contato que o chamador não pode editar | MÉDIO (latente) | **Sim** — retorno `true` fora do escopo |
| A5 | Oráculo de pertencimento perfil↔fila pela versão de 5 argumentos: `authenticated` descobre se um **perfil arbitrário** é membro ativo de uma **fila arbitrária** | MÉDIO | **Sim** |
| A6 | `enforce_multiplix_dispatch_mutability` / `enforce_multiplix_recipient_mutability` (`20260929590000`) usam gate **fail-open** por GUC: `IF COALESCE(auth.role(),'') <> 'authenticated' THEN RETURN ...`. Sem a GUC o guard **desaparece** (não erra, não nega) | MÉDIO | Mecanismo **sim**; alcançabilidade via PostgREST **não** |
| B1 | Defeito funcional (não segurança) em `get_team_messages_page` (E38): `column reference "conversation_id" is ambiguous` → **a RPC falha para todo mundo, inclusive membros** | ALTO funcional | **Sim** |
| B2 | `team_conversation_members`: a policy `tcm_select_own` (28/09, fora do dia) faz subselect na própria tabela → `infinite recursion detected in policy` em qualquer SELECT direto de `authenticated` | ALTO funcional (28/09) | **Sim** |
| B3 | Resíduo de ACL do dia: `audit_contact_address_change`, `team_receipts_fill_conversation_id`, `enforce_multiplix_*_mutability` nasceram **sem `REVOKE`** → `PUBLIC`/`anon` têm `EXECUTE`. São funções de trigger: o PG recusa invocação direta | BAIXO | **Sim** |
| B4 | 5 funções do dia (contatos, +3 helpers herdados) e 15 (team chat) fixam `search_path = public` **sem `pg_temp`**. Semântica confirmada (`pg_temp` é resolvido ANTES de `public` quando não listado), mas **nenhuma** das funções tem referência não qualificada → sem vetor | BAIXO (higiene) | Mecanismo **sim**; exploração **não** |
| B5 | `session_replication_role = replica`: `permission denied` para `authenticated` **e** para `service_role` | BAIXO (teórico) | **Sim** — negado |
| B6 | Gates por GUC (`request.jwt.claims->>'role'`, `auth.role()`): forjáveis por quem puder emitir `SET` na sessão (prova em descartável). PostgREST executa 1 statement por request → não alcançável pelo app | BAIXO (teórico) | Mecanismo **sim** |
| B7 | `can_delete_contacts` devolve linha para contato de outro dono → oráculo de **existência** de contato (soft-deleted não retorna). `toggle_team_reaction` com `message_id` inexistente → erro de FK, mesmo oráculo | BAIXO | **Sim** |
| B8 | `find_or_create_direct_conversation` cria DM com qualquer `profile_id` existente, sem consentimento do alvo (guard de "consigo mesmo" funciona) | BAIXO | **Sim** |
| — | **Nenhum achado CRÍTICO** | — | — |

**Resumo do que está sólido:** `anon` não tem `EXECUTE` em nenhuma função relevante do dia; `search_contacts` / `delete_contact(s)` / `can_edit_contact` / `can_delete_contacts` fizeram `REVOKE ... FROM PUBLIC, anon` no próprio arquivo; as 3 funções do motor Multiplix continuam `service_role`-only (ACL preservada por `CREATE OR REPLACE`, provado) **e** têm gate interno `auth.role() <> 'service_role'` que falha fechado; **nenhuma** função do dia usa parâmetro do cliente como fonte de identidade — todas derivam de `auth.uid()`/`current_profile_id()`.

---

## 1. Método, ambiente e limites

### 1.1 Limite de infraestrutura (fato registrado, não impedimento)

O gateway MCP do banco canônico está **fora** no momento da auditoria:

```
$ python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py "select 1"
""            # saída vazia; nenhum SELECT respondeu
```

(Esse foi o **único** comando executado contra o canônico, e é o probe de conectividade que o próprio briefing indicou como forma de observar a queda. Retornou vazio: nenhum dado foi lido. Fora dele, nenhum DDL/DML/`SELECT` — nem de leitura — tocou o canônico.)

Consequência: **nenhuma leitura do estado vivo foi feita**. Toda a análise usa o Postgres descartável com as migrations do repo aplicadas. Isso significa que:

- o **estado real** de `pg_proc`/`pg_policy`/`pg_trigger` do canônico **não foi comparado** com o repo (o `db-live-guard` faria isso);
- ACL herdada de migrations posteriores a 29/09, ou DDL fora do Git **não registrada**, não está no radar;
- tudo abaixo é **fato do par arquivo↔execução**, declarado como tal.

Onde a conclusão depende de estado herdado, o relatório diz explicitamente e cita a migration de origem (ver §3.4).

### 1.2 Harnesses (evidência reproduzível)

Três scripts novos, todos em container `postgres:17-alpine` descartável, `--network none`, sem credencial de produção:

| Harness | Arquivo | O que prova |
|---|---|---|
| Contatos (#1173 F1 / #1198) | `scripts/db-audit/w2-contacts-seguranca.test.sh` | ACL `proacl`/`has_function_privilege`, `search_path`, guards, trigger de auditoria, oráculos |
| Team chat (E26–E51) | `scripts/db-audit/w2-teamchat-seguranca.test.sh` | 15 funções do dia: guardas de vínculo por RPC, RLS direta vs. definer, ACL |
| Mecânica do PG | `scripts/db-audit/w2-mecanica-pg.test.sh` | definer × RLS com dono **não-superusuário**, `FORCE ROW LEVEL SECURITY`, preservação de ACL por `CREATE OR REPLACE`, gate por GUC |

Saídas brutas preservadas em `audit-w2-evidencias/out-{contacts,teamchat,mecanica}.txt`.

Comando único (runner do repo):

```sh
bash scripts/db-audit/retry-disposable-postgres-test.sh \
     bash scripts/db-audit/w2-contacts-seguranca.test.sh
```

### 1.3 Duas provas mecânicas que sustentam o resto do relatório

Sem elas, "SECURITY DEFINER ignora RLS" seria atribuível a privilégio de superusuário (o `postgres` do container **é** superusuário), e a conclusão inteira ficaria frágil. Fixture com dono `NOSUPERUSER NOBYPASSRLS`:

```
PROBE|dono_da_tabela_sem_BYPASSRLS|exit=0|false/false
PROBE|insert_direto_app_user_barrado_pela_POLICY|exit=1|ERROR:  new row violates row-level security policy for table "livre"
PROBE|definer_sem_FORCE_atravessa_RLS|exit=0|1
PROBE|definer_com_FORCE_e_barrado|exit=1|ERROR:  new row violates row-level security policy for table "forcada"
PROBE|confirmacao_de_leitura|exit=0|livre=1 forcada=0
```

→ **`SECURITY DEFINER` de dono não-superusuário ignora RLS; `FORCE ROW LEVEL SECURITY` fecha.** É por isso que, em cada RPC do dia, **o único guard é o corpo da função**. E é coerente com o próprio dia: `20260929570000` aplicou `FORCE RLS` nas três tabelas Multiplix justificando exatamente isso ("as três tabelas pertencem a postgres; sem FORCE, o dono ignora RLS").

ACL preservada por `CREATE OR REPLACE` (base da conclusão sobre o Multiplix, §3.5):

```
PROBE|acl_antes_do_replace|exit=0|postgres=X/postgres|role_x=X/postgres
PROBE|acl_depois_do_replace|exit=0|postgres=X/postgres|role_x=X/postgres
PROBE|default_e_PUBLIC_EXECUTE|exit=0|<NULL=default> anon_tem=true
```

---

## 2. Inventário do dia

**45 migrations** em `supabase/migrations/20260929*.sql` — **23 com arquivo original no Git** (contatos, Multiplix, Talk X, catálogo, notificações) e **22 reconstruídas do ledger** (`_team_chat_e26_` a `_team_chat_e51_`, cujo cabeçalho declara "aplicada em producao sem arquivo no repositorio (DDL fora do Git)"). Ver §4.8 — é uma ressalva de confiança importante, e ela incide sobre os achados A1/A2. Agrupadas por cluster, com os objetos que cada uma cria/altera:

### 2.1 Contatos — #1173 F1 e #1198 (11 arquivos)

| Migration | Objetos |
|---|---|
| `20260929140000_search_contacts_returns_address` | `DROP`+`CREATE` `search_contacts(...)` (23 colunas, SECURITY DEFINER, `search_path='public'`) + `GRANT`/`REVOKE` |
| `20260929150000_contact_address_audit_trigger` | **nova** `audit_contact_address_change()` (trigger, SECURITY DEFINER, `search_path='public'`) + trigger `trg_audit_contact_address_change` (`AFTER UPDATE OF address,…`) — **sem REVOKE** |
| `20260929370000_contacts_soft_delete_and_search_filters` | coluna `deleted_at` + índices; `delete_contact(uuid)`, `delete_contacts(uuid[])`, `contacts_count_by_type()`; `REVOKE ALL … FROM PUBLIC, anon` nas duas RPCs |
| `20260929380000_disable_sicoob_bridge_trigger` | `DROP TRIGGER trg_sicoob_reply`; `DROP FUNCTION notify_sicoob_on_reply()` (redução de superfície) |
| `20260929560000_contacts_conversation_status_and_grants` | consolida 1 `CHECK` de `conversation_status`; `CREATE OR REPLACE enforce_conversation_status_transition()` (trigger, definer, `search_path='public'`) — **sem REVOKE**; `REVOKE TRUNCATE, REFERENCES ON contacts` de `authenticated,anon`; `REVOKE SELECT ON contacts FROM anon` |
| `20260929720000_contacts_delete_align_edit_policy` | `delete_contact` / `delete_contacts` reescritos (mesmo predicado da policy de UPDATE) |
| `20260929770000_contacts_can_edit_contact_helper` | **novo** `can_edit_contact(uuid,uuid)` + `can_delete_contacts(uuid[])` (definer, `search_path='public','pg_temp'`), `REVOKE` de `PUBLIC,anon`, `GRANT` a `authenticated,service_role` |
| `20260929780000_contacts_single_permission_predicate` | recria as policies `contacts_select_policy` (SELECT) e `Users can update their assigned contacts` (UPDATE) chamando o helper; reescreve `search_contacts`, `delete_contact`, `delete_contacts` |
| `20260929790000_contacts_hijack_guards_only_on_change` | `CREATE OR REPLACE prevent_contact_assignee_hijack()` / `prevent_contact_queue_hijack()` — guard passa a comparar `OLD … IS DISTINCT FROM NEW …`; **sem REVOKE** |
| `20260929810000_contacts_can_edit_contact_hoisted_params` | **novo overload** `can_edit_contact(uuid,uuid,uuid[],uuid,boolean)`; a versão de 2 args passa a delegar; policies apontam para a de 5 args; `REVOKE`/`GRANT` explícitos |
| `20260929820000_contacts_can_delete_contacts_hoisted_params` | `can_delete_contacts(uuid[])` passa os lookups por parâmetro |

### 2.2 Team chat E26–E51 (22 arquivos)

| Migration | Objetos |
|---|---|
| `…160000` E26 | `CHECK team_messages_type_media_check`; `COMMENT` em `media_url` |
| `…170000` E27 | `team_messages_validate_reply_to()` (trigger, definer) + trigger; `REVOKE`/`GRANT` |
| `…180000` E28 | `team_messages_edit_guard()` (trigger, definer, janela 48 h) + `BEFORE UPDATE OF content`; `REVOKE`/`GRANT` |
| `…190000` E29 | `find_or_create_direct_conversation(uuid)` (definer); `REVOKE`/`GRANT` |
| `…200000` E30 | índice único por departamento; FK `department_id` `DEFERRABLE` |
| `…210000` E31 | `CHECK last_read_at`; 2 índices |
| `…220000` E32 | `team_reactions_dedup_guard()` (trigger) + trigger; **recria as 3 policies de `team_message_reactions`** (`reactions_select`, `reactions_insert`, `reactions_delete`) |
| `…230000` E33 | `CHECK`s de receipts; `team_receipts_no_own_sender()` (trigger) + trigger; `REVOKE`/`GRANT` |
| `…240000` E34 | colunas `metadata`; `ALTER PUBLICATION … ADD TABLE` (4 tabelas) |
| `…250000` E35 | `COMMENT ON TABLE` |
| `…260000` E37 | `get_team_inbox()` (definer); `REVOKE`/`GRANT` |
| `…270000` E38 | `get_team_messages_page(uuid,uuid,integer)` (definer); `REVOKE`/`GRANT` |
| `…280000` E39 | `mark_team_conversation_read(uuid)` (definer); `REVOKE`/`GRANT` |
| `…290000` E40 | `search_team_messages(uuid,text,integer)` (definer); `REVOKE`/`GRANT` |
| `…300000` E41 | `toggle_team_reaction(uuid,text)` (definer); `REVOKE`/`GRANT` |
| `…310000` E42 | `set_team_member_pref(uuid,boolean)` (definer); `REVOKE`/`GRANT` |
| `…320000` E43 | `leave_team_group(uuid)` (definer); `REVOKE`/`GRANT` |
| `…330000` E44 | `remove_team_member(uuid,uuid)` (definer); `REVOKE`/`GRANT` |
| `…400000` E45 | `transfer_team_conversation_department(uuid,uuid)` (definer); `REVOKE`/`GRANT` |
| `…410000` E47/E48/E49 | `REPLICA IDENTITY DEFAULT`; `COMMENT` de 2 RPCs legadas; `DROP INDEX` duplicados |
| `…430000` E46 | `DROP`+`CREATE` `leave_team_group` (agora `jsonb`, promoção de novo owner) e `remove_team_member`; `REVOKE`/`GRANT` |
| `…440000` E51 | **nova** `team_receipts_fill_conversation_id()` (trigger, definer) + `BEFORE INSERT` — **sem REVOKE** |

### 2.3 Multiplix (9 arquivos)

| Migration | Objetos |
|---|---|
| `…570000` | `REVOKE ALL` das 3 tabelas para `anon`; `REVOKE TRUNCATE,REFERENCES,TRIGGER` para `authenticated`; `GRANT SELECT,INSERT,UPDATE,DELETE`; **`ALTER TABLE … FORCE ROW LEVEL SECURITY`** nas 3 |
| `…580000` | consolida policies de `multiplix_dispatches` (5) e `multiplix_recipients` (4) |
| `…590000` | **novas** `enforce_multiplix_dispatch_mutability()` / `enforce_multiplix_recipient_mutability()` (trigger, gate por `auth.role()`) + 2 triggers — **sem REVOKE** |
| `…600000` | `claim_multiplix_recipient(...)`, `complete_multiplix_dispatch_if_drained(uuid)`, `transition_multiplix_dispatch(uuid,text,text)`, `sweep_multiplix_stuck_recipients(int)`; `REVOKE ALL` explícito só do último |
| `…610000` | `multiplix_dispatch_window_is_open(uuid)`, `multiplix_connection_daily_usage(uuid)`, `trigger_pending_multiplix_dispatches()`; `REVOKE ALL` + `GRANT` a `service_role` nos 3 |
| `…620000` | escopo de colunas na publication (`DROP`/`ADD TABLE` com lista) |
| `…630000` | **nova** `multiplix_create_draft(...)`; `REVOKE ALL` de `PUBLIC,anon,authenticated` + `GRANT` a `service_role` |
| `…640000` | `INSERT` em `permissions` / `role_permissions` (`multiplix.dispatch.manage_all`) |
| `…650000` | grants de `catalog_favorites` / `catalog_send_events` (dois níveis: tabela **e** coluna) |

### 2.4 Talk X, catálogo, notificações (3 arquivos)

| Migration | Objetos |
|---|---|
| `…420000_fix_talkx_transition_overload_and_status_check` | `DROP FUNCTION transition_talkx_campaign(uuid,text)` (elimina overload ambíguo) + `CHECK` de `talkx_campaigns.status` |
| `…730000_talkx_events_contract_v11` | `CHECK` de `event_type` (19 valores), colunas `entity_type`/`entity_id`, `CHECK` de alvo, e **recria as 2 policies** de `talkx_campaign_events` (SELECT e INSERT) |
| `…800000_user_settings_sound_volume` | coluna `sound_volume` |

---

## 3. Achados

> Todos os comandos de exploit abaixo rodam **dentro do container descartável** já com as migrations do dia aplicadas. As saídas são transcrições literais dos arquivos `audit-w2-evidencias/out-*.txt`.

### 3.1 ALTO — A1: `toggle_team_reaction` escreve em conversa de outro time

**Objeto:** `public.toggle_team_reaction(p_message_id uuid, p_emoji text)` — criado por `20260929300000_team_chat_e41_toggle_team_reaction_rpc.sql` (E41), `SECURITY DEFINER`, `search_path=public`, `EXECUTE` para `authenticated`.

**Corpo exato (recuperado do ledger, arquivo `…e41_…` linha 6) — o único teste é "existe sessão?"; não há teste de vínculo com a conversa da mensagem:**

```sql
CREATE OR REPLACE FUNCTION public.toggle_team_reaction(p_message_id uuid, p_emoji text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_profile_id uuid := public.current_profile_id(); v_exists boolean;
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.team_message_reactions
                WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.team_message_reactions WHERE message_id = p_message_id AND profile_id = v_profile_id AND emoji = p_emoji;
    RETURN jsonb_build_object('action', 'removed', 'emoji', p_emoji);
  ELSE
    INSERT INTO public.team_message_reactions(message_id, profile_id, emoji) VALUES (p_message_id, v_profile_id, p_emoji) ON CONFLICT DO NOTHING;
    RETURN jsonb_build_object('action', 'added', 'emoji', p_emoji);
  END IF;
END; $f$;
```

**Exploit** (B1 não é membro do "Grupo A"; `MSG_A` pertence ao Grupo A):

```sql
SET ROLE authenticated;
SET request.jwt.claim.sub='20000000-0000-0000-0000-0000000000b1';
SET request.jwt.claims='{"role":"authenticated","sub":"20000000-0000-0000-0000-0000000000b1"}';
SELECT public.toggle_team_reaction('50000000-0000-0000-0000-00000000000a','x');
```

```
PROBE|toggle_reaction_msg_alheia_B1|exit=0|{"emoji": "x", "action": "added"}
PROBE|reaction_gravada_por_B1|exit=0|1 reacao(es) em 50000000-0000-0000-0000-00000000000a
```

A reação foi **criada** por um não-membro. O efeito não fica no registro do atacante: a policy `reactions_select` (`EXISTS (… team_conversation_members … profile_id = current_profile_id())`) é de leitura e os membros do Grupo A **veem** a reação do invasor na própria conversa.

**Comparação que fecha o diagnóstico** — o insert direto de **mensagem** na conversa alheia é negado pela RLS:

```
PROBE|insert_msg_direto_conversa_alheia|exit=1|ERROR:  new row violates row-level security policy for table "team_messages"
```

Ou seja, `team_messages` está protegido; a superfície equivalente para reação não está.

**Remediação:** adicionar ao corpo da RPC o mesmo guard que `search_team_messages`/`get_team_messages_page` já têm (`IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = (SELECT conversation_id FROM public.team_messages WHERE id = p_message_id) AND profile_id = v_profile_id) THEN RAISE EXCEPTION 'not_member'`) **e** corrigir a policy `reactions_insert` (ver A3), senão o caminho direto permanece.

---

### 3.2 MÉDIO — A2 e A3: `mark_team_conversation_read` e a RLS de INSERT sem vínculo

**A2 — objeto:** `public.mark_team_conversation_read(p_conversation_id uuid)` — `20260929280000` (E39), definer, `EXECUTE` para `authenticated`. Corpo exato (recuperado do ledger):

```sql
CREATE OR REPLACE FUNCTION public.mark_team_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
DECLARE v_profile_id uuid := public.current_profile_id(); v_now timestamptz := now();
BEGIN
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  INSERT INTO public.team_message_receipts(message_id, profile_id, status, delivered_at, read_at)
    SELECT m.id, v_profile_id, 'read', v_now, v_now FROM public.team_messages m
     WHERE m.conversation_id = p_conversation_id AND m.sender_id <> v_profile_id
       AND NOT EXISTS (SELECT 1 FROM public.team_message_receipts r
                        WHERE r.message_id = m.id AND r.profile_id = v_profile_id AND r.status = 'read')
  ON CONFLICT (message_id, profile_id) DO UPDATE SET status = 'read', read_at = v_now;
  UPDATE public.team_conversation_members SET last_read_at = v_now
   WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;
END; $f$;
```

Nenhum teste de vínculo com `p_conversation_id`: o `INSERT … SELECT` percorre **todas** as mensagens da conversa informada. O `UPDATE` final só encontra linha quando o chamador é membro (RLS/tabela o restringe por `profile_id`), mas o INSERT já foi.

```
PROBE|mark_read_conversa_alheia|exit=0|
PROBE|receipts_criados_por_B1_em_A|exit=0|4 receipt(s) de B1 em mensagens da conversa A
```

**A3 — causa-raiz (o que sobrevive a corrigir só a RPC).** As duas policies abaixo vieram do dia (`…220000` E32 e o histórico de receipts espelhado no harness); nenhuma exige vínculo:

```sql
-- 20260929220000 (E32)
CREATE POLICY "reactions_insert" ON public.team_message_reactions
  FOR INSERT TO authenticated WITH CHECK (profile_id = public.current_profile_id());
-- receipts (e13/e22, vigente em 29/09)
CREATE POLICY tmrpt_insert_own ON public.team_message_receipts
  FOR INSERT TO authenticated WITH CHECK (profile_id = public.current_profile_id());
```

INSERT **direto** (o caminho que um `POST /rest/v1/team_message_reactions` toma), sem passar por RPC nenhuma:

```
PROBE|insert_reaction_direto_msg_alheia|exit=0|                       # aceito
PROBE|insert_receipt_direto_msg_alheio|exit=0|                       # aceito
PROBE|conferir_receipt_landed|exit=0|1 receipt(s) de B1 na conversa A (lido como postgres)
```

E o trigger do dia não ajuda: `team_receipts_fill_conversation_id` (E51) **preenche** `conversation_id` a partir da mensagem, sem checar vínculo:

```
PROBE|receipt_novo_sem_conversation_id|exit=0|
PROBE|receipt_A3_conversation_id|exit=0|40000000-0000-0000-0000-00000000000a <- preenchido pelo trigger em read
```

**Diagnóstico:** a autorização de escrita dessas duas tabelas é "você só escreve como você mesmo" — não é "você só escreve no que você participa". Em um schema com RLS por vínculo (`team_messages`, `team_conversations`) isso é uma assimetria, não um descuido de uma RPC.

**Impacto demonstrado:** escrita não autorizada em conversa de outro time; em A1 o efeito é visível para os membros. **Não demonstrei** leitura do conteúdo alheio (`reactions_select` e `tmrpt_select_member` continuam checando vínculo), nem alteração de dados alheios.

**Remediação:** `WITH CHECK (profile_id = current_profile_id() AND EXISTS (vínculo com a conversa da mensagem))` nas duas policies, mantendo o guard também nas RPCs (defesa em profundidade).

---

### 3.3 MÉDIO — A4: `can_edit_contact` de 5 argumentos recebe os insumos da autorização do cliente

**Objeto:** `public.can_edit_contact(p_assigned_to uuid, p_queue_id uuid, p_visible_agent_ids uuid[], p_profile_id uuid, p_is_admin boolean)` — `20260929810000` (#1198, hoisted params). `SECURITY DEFINER`, `STABLE`, `search_path='public','pg_temp'`, `EXECUTE` para `authenticated` e `service_role` (necessário: a função é chamada no `USING` das policies, e expressão de policy roda como o **chamador**).

**Corpo:**

```sql
SELECT COALESCE(
  COALESCE(p_is_admin, public.is_admin_or_supervisor(auth.uid()))
  OR p_assigned_to = ANY (COALESCE(p_visible_agent_ids, (SELECT array_agg(v) FROM public.get_visible_agent_ids(auth.uid()) v)))
  OR EXISTS (SELECT 1 FROM public.queue_members qm
             WHERE qm.queue_id = p_queue_id
               AND qm.profile_id = COALESCE(p_profile_id, public.get_profile_id_for_user(auth.uid()))
               AND qm.is_active = true),
  false)
```

`p_is_admin`, `p_visible_agent_ids` e `p_profile_id` **substituem** os valores derivados de `auth.uid()` sempre que vierem não-nulos. Como `authenticated` tem `EXECUTE`, eles são parâmetros que o chamador escolhe.

**Exploit 1 — a função devolve `true` fora do escopo do chamador** (agente comum, contato atribuído a outro agente, fila da qual não participa):

```sql
SET ROLE authenticated; SET request.jwt.claim.sub='20000000-0000-0000-0000-000000000001';
SET request.jwt.claims='{"role":"authenticated","sub":"20000000-0000-0000-0000-000000000001"}';
SELECT public.can_edit_contact('10000000-0000-0000-0000-000000000002'::uuid,
                               '50000000-0000-0000-0000-000000000002'::uuid,
                               ARRAY[]::uuid[], NULL, true);
```

```
PROBE|cec_outro_tenant_2args|exit=0|f                        # a versão de 2 args (server-side) diz f
PROBE|cec_p_is_admin_forjado|exit=0|t                        # a de 5 args com p_is_admin=true diz t
PROBE|cec_p_visible_forjado|exit=0|t                         # com p_visible_agent_ids contendo o alvo, t
```

**Exploit 2 — oráculo de pertencimento perfil↔fila (A5).** Com `p_visible_agent_ids = ARRAY[]::uuid[]` e `p_is_admin = false`, o ramo do `queue_members` é exercido com o `p_profile_id` do atacante:

```sql
SELECT public.can_edit_contact(NULL, '50000000-0000-0000-0000-000000000002'::uuid,
                               ARRAY[]::uuid[], '<perfil de OUTRO>'::uuid, false);
```

```
PROBE|cec_oraculo_membro_da_fila_alheia|exit=0|outro_perfil_na_fila_2=true eu_na_fila_2=false
```

→ `authenticated` descobre que um **perfil arbitrário** é membro ativo de uma **fila arbitrária**. É divulgação de estrutura interna (quem está em qual fila), não de dado de contato.

**Risco real (não inflar):** hoje **nenhum** chamador interno repassa dado do cliente para esses parâmetros —

- policies (`contacts_select_policy`, `Users can update their assigned contacts`) passam `(SELECT array_agg(v) FROM get_visible_agent_ids(auth.uid()))`, `(SELECT get_profile_id_for_user(auth.uid()))`, `(SELECT is_admin_or_supervisor(auth.uid()))` — todos derivados do JWT;
- `search_contacts`, `delete_contact`, `delete_contacts`, `can_delete_contacts` idem;
- em `src/` e `supabase/functions/` **não existe** chamada de cliente a `can_edit_contact` (o front usa `can_delete_contacts`), apesar de a função estar exposta em `src/integrations/supabase/types.ts`.

Portanto o que está **demonstrado** é: (a) retorno `true` mentiroso para quem chama direto via RPC; (b) oráculo de pertencimento. O que **não** está demonstrado é escalada de privilégio — para isso seria preciso um chamador que repassasse entrada do cliente, e não existe. Classificação: **MÉDIO, latente**, com gatilho claro (qualquer novo chamador que passe valor de request para a assinatura de 5 args vira ALTO/CRÍTICO).

**Remediação sugerida:** as variantes "hoisted" não deveriam ser RPC público. Ou (a) `REVOKE EXECUTE … FROM authenticated` + `GRANT` só a quem precisa (o que não é possível: policy roda como chamador), ou (b) separar em dois objetos — um `can_edit_contact(uuid,uuid)` público que sempre deriva de `auth.uid()`, e um `can_edit_contact_hoisted(...)` **não** executável por `authenticated` (chamado só de dentro de funções definer, que não precisam de `EXECUTE` do chamador).

---

### 3.4 MÉDIO — A6: gates de autorização por GUC em Multiplix (fail-open)

**Objetos:** `enforce_multiplix_dispatch_mutability()` e `enforce_multiplix_recipient_mutability()` — `20260929590000`, `BEFORE INSERT OR UPDATE OR DELETE`.

```sql
IF COALESCE(auth.role(), '') <> 'authenticated' THEN
  RETURN COALESCE(NEW, OLD);   -- libera TUDO
END IF;
```

`auth.role()` lê a GUC `request.jwt.claim.role`. Consequências:

1. **Não falha fechado.** Se a GUC estiver ausente, `COALESCE(NULL,'') <> 'authenticated'` é **verdadeiro** → o guard sai pela porta da frente sem erro. Não nega; **libera**.
2. Quem puder emitir `SET request.jwt.claim.role = …` desliga o guard (qualquer role pode `SET` uma GUC customizada; provado no harness de mecânica):

```
PROBE|gate_guc_ausente|exit=1|ERROR:  service_role_required        # gate no estilo COALESCE(...,'')<>'service_role' nega
PROBE|gate_guc_forjavel_pelo_chamador|exit=0|passou               # SET da GUC -> passa
```

3. O discriminador é uma **string de GUC**, não um teste de privilégio (`current_user`, `pg_has_role`, `session_user`).

**Alcançabilidade (seja claro):** o PostgREST executa **um** statement por request, então um usuário de app não consegue emitir o `SET` antes da escrita — e o PostgREST popula `request.jwt.claim.role` a partir do JWT assinado (`'authenticated'` para logado). **Não demonstrei exploração pelo canal do app.** O que fica demonstrado é: o guard não é barreira de profundidade real, e a **única** barreira que sobra no caminho é a RLS (que é por linha, não por coluna — nada impede valores de contadores/estado dentro das linhas que a policy permite).

**O que isso contrasta com o resto do dia:** o mesmo padrão aparece nos guards de contatos (`current_setting('request.jwt.claims', true)::jsonb->>'role'`), mas ali o comportamento é diferente e melhor:

```
PROBE|guard_reenquadro_com_claims|exit=1|ERROR:  Sem permissao para atribuir contato a este agente
PROBE|guard_reenquadro_sem_claims_guc|exit=1|ERROR:  invalid input syntax for type json   # falha FECHADA (22P02)
PROBE|guard_reenquadro_sem_role_no_claims|exit=1|ERROR:  new row violates row-level security policy for table "contacts"
PROBE|guard_reenquadro_role_forjado|exit=1|ERROR:  new row violates row-level security policy for table "contacts"
```

Isto é, no cluster de contatos: (a) GUC ausente → **erro** (não bypass), embora um erro 22P02 para o usuário final seja feio; (b) claims sem chave `role` ou com `role` forjado → **a RLS barra de qualquer forma**. Ou seja, os guards de #1198 são redundância, não o gate — o que é o desenho correto. Vale registrar como ponto positivo e como argumento para o mesmo desenho em Multiplix.

---

### 3.5 O que NÃO é problema (checado e negado)

**`session_replication_role = replica` (item 5 da missão) — não alcançável:**

```
PROBE|srr_authenticated|exit=1|ERROR:  permission denied to set parameter "session_replication_role"
PROBE|srr_service_role|exit=1|ERROR:  permission denied to set parameter "session_replication_role"
PROBE|srr_dono_tabela|exit=0|set-ok (postgres=superuser)
```

Só superusuário. Nem `service_role` (que no Supabase **não** é superusuário) consegue. Os guards do #1198 não são burláveis por esse caminho. **Risco teórico apenas** — e, se algum dia a role de migração ganhar o app no meio, deixa de ser.

**Trigger de auditoria de endereço — SECURITY DEFINER, e o INSERT em `audit_logs` sobrevive às policies (item 5):**

```
PROBE|acl_inventory|…|audit_contact_address_change() prosrc_definer=true proconfig=search_path=public proacl=<NULL=default PUBLIC EXECUTE> anon=true authenticated=true
PROBE|audit_logs_insert_sem_privilegio?|exit=0|f                 # authenticated NEM tem INSERT na tabela
PROBE|audit_logs_rls_insert_direto|exit=1|ERROR:  permission denied for table audit_logs
PROBE|trigger_auditoria_grava_via_definer|exit=0|update-ok
PROBE|audit_logs_linhas_apos_trigger|exit=0|1 | contact_address_changed/user_id=20000000-0000-0000-0000-000000000001
```

O estado do canônico foi reproduzido (RLS ligada; policies `Block authenticated inserts/updates/deletes on audit_logs` de 20260404174354; INSERT revogado de `anon` em 20260903240000). O UPDATE de endereço feito por `authenticated` gerou a linha de auditoria **com `user_id` = `auth.uid()` do ator**, apesar de o mesmo usuário não poder inserir direto. É o comportamento desejado e é **por isso que a função precisa ser definer** — confirmando a premissa do item 5.

**ACL do dia — inventário completo dos dois clusters:**

Contatos (`proacl` real + `has_function_privilege`):

```
audit_contact_address_change()   definer=true  proconfig=search_path=public     proacl=<NULL=default PUBLIC EXECUTE>  anon=true  authenticated=true
can_delete_contacts(p_ids uuid[]) definer=true proconfig=search_path=public, pg_temp proacl=postgres=X/postgres|authenticated=X/postgres|service_role=X/postgres  anon=false authenticated=true
can_edit_contact(uuid,uuid)       definer=true proconfig=search_path=public, pg_temp proacl=postgres=X/postgres|authenticated=X/postgres|service_role=X/postgres  anon=false authenticated=true
delete_contact / delete_contacts  definer=true proconfig=search_path=public     anon=false authenticated=true
search_contacts(...)              definer=true proconfig=search_path=public     anon=false authenticated=true
contacts_count_by_type()          definer=false                    anon=true authenticated=true
enforce_conversation_status_transition()   definer=true            anon=false authenticated=false
prevent_contact_assignee_hijack() / prevent_contact_queue_hijack()  definer=true anon=false authenticated=false
```

Team chat — resumo do inventário das 15 funções do dia:

```
PROBE|acl_team_dia_resumo|exit=0|15 funcoes do dia; com anon=1; com proacl NULL=1;
  sem EXECUTE p/ anon e sem proacl NULL: nomes=find_or_create_direct_conversation,get_team_inbox,
  get_team_messages_page,leave_team_group,mark_team_conversation_read,remove_team_member,
  search_team_messages,set_team_member_pref,team_messages_edit_guard,team_messages_validate_reply_to,
  team_reactions_dedup_guard,team_receipts_no_own_sender,toggle_team_reaction,
  transfer_team_conversation_department
```

→ **14 de 15** têm ACL fechada para `anon` e `PUBLIC`; a única com `proacl NULL` é `team_receipts_fill_conversation_id` (função de trigger). Todas as tentativas de `anon` foram negadas:

```
PROBE|anon_chama_toggle_reaction|exit=1|ERROR:  permission denied for function toggle_team_reaction
PROBE|anon_chama_get_team_inbox|exit=1|ERROR:  permission denied for function get_team_inbox
PROBE|anon_rpcs|exit=0|false|false|false|false|false|false
PROBE|anon_chama_can_edit_contact|exit=1|ERROR:  permission denied for function can_edit_contact
PROBE|anon_chama_can_delete_contacts|exit=1|ERROR:  permission denied for function can_delete_contacts
PROBE|anon_chama_search_contacts|exit=1|ERROR:  permission denied for function search_contacts
PROBE|anon_chama_guard_direto|exit=1|ERROR:  permission denied for function prevent_contact_assignee_hijack
PROBE|anon_chama_fsm_direto|exit=1|ERROR:  permission denied for function enforce_conversation_status_transition
PROBE|anon_chama_contacts_count_by_type|exit=1|ERROR:  permission denied for table contacts
```

**Resíduo de ACL do dia (B3) — BAIXO, não explorável.** As funções abaixo nasceram em 29/09 **sem `REVOKE`**, então mantêm o default `PUBLIC EXECUTE` (`anon=true`):

| Função nova no dia | Migration | `RETURNS` |
|---|---|---|
| `audit_contact_address_change()` | `20260929150000` | `trigger` |
| `team_receipts_fill_conversation_id()` | `20260929440000` | `trigger` |
| `enforce_multiplix_dispatch_mutability()` | `20260929590000` | `trigger` |
| `enforce_multiplix_recipient_mutability()` | `20260929590000` | `trigger` |

O PostgreSQL recusa invocação direta, então `PUBLIC EXECUTE` é inerte:

```
PROBE|anon_chama_audit_fn_direto|exit=1|ERROR:  trigger functions can only be called as triggers
PROBE|auth_chama_guard_direto|exit=1|ERROR:  trigger functions can only be called as triggers
PROBE|anon_exec_trigger_fns|exit=1|ERROR:  trigger functions can only be called as triggers
```

É **dívida de higiene**, não vulnerabilidade — e é regressão de convenção: o repo já havia varrido exatamente esse resíduo em `20260927310000_revoke_trigger_functions_anon_execute.sql` e `20260927390000_revoke_trigger_funcs_public_execute.sql` (27/09, revogando `PUBLIC`/`anon` de `enforce_conversation_status_transition`, `prevent_contact_*_hijack` e mais 6). O dia voltou a introduzir 4 funções sem o `REVOKE`.

> Nota de método: na primeira execução do harness de contatos, `enforce_conversation_status_transition` e `prevent_contact_*_hijack` apareceram como `anon=true` — **artefato da fixture**, que não reproduzia os `REVOKE` de 27/09. A fixture foi corrigida e a linha `public_execute_funcs_dia` passou a listar apenas `audit_contact_address_change` (trigger) e `contacts_count_by_type` (não-definer, e que falha por falta de `SELECT` do `anon`). O número acima é o corrigido.

**`search_path` sem `pg_temp` (B4) — BAIXO, higiene; sem vetor.** A semântica é real e foi medida:

```
PROBE|pg_temp_primeiro_quando_ausente|exit=0|t     # search_path='public'  -> unqualified resolve para o TEMP
PROBE|pg_temp_por_ultimo_quando_declarado|exit=0|t # search_path='public','pg_temp' -> resolve para public
PROBE|auth_create_temp_table|exit=0|temp-criada    # authenticated PODE criar tabela temporaria
PROBE|db_temp_privilege|exit=0|t
```

Objetos do dia que fixam `search_path` **sem** `pg_temp` (5 alterados/criados no dia + 3 helpers pré-existentes que continuam sem `pg_temp`, medidos no mesmo probe):

- dia — contatos: `search_contacts`, `delete_contact`, `delete_contacts`, `audit_contact_address_change`, `enforce_conversation_status_transition`;
- herdados — contatos: `get_profile_id_for_user`, `get_visible_agent_ids`, `is_admin_or_supervisor`;
- dia — team chat: **todas** as 15 funções do dia (`search_path=public`).

Prova de que todos os 15 do team chat ficaram assim:

```
PROBE|search_path_de_cada_funcao_do_dia|exit=0|current_profile_id=>search_path=public ; find_or_create_direct_conversation=>search_path=public ;
  get_team_inbox=>search_path=public ; get_team_messages_page=>search_path=public ; leave_team_group=>search_path=public ;
  mark_team_conversation_read=>search_path=public ; remove_team_member=>search_path=public ; search_team_messages=>search_path=public ;
  set_team_member_pref=>search_path=public ; team_messages_edit_guard=>search_path=public ; team_messages_validate_reply_to=>search_path=public ;
  team_reactions_dedup_guard=>search_path=public ; team_receipts_fill_conversation_id=>search_path=public ;
  team_receipts_no_own_sender=>search_path=public ; toggle_team_reaction=>search_path=public ;
  transfer_team_conversation_department=>search_path=public
```

Mas **nenhuma delas tem referência não qualificada**. Prova automatizada (regex sobre `pg_get_functiondef` procurando nome de tabela sem `public.`):

```
PROBE|definer_sem_pg_temp_e_ref_sem_schema|exit=0|audit_contact_address_change~w2_probe_pub
```

Revisão manual do único nome real (`audit_contact_address_change`): o casamento é o **literal de string** `'contacts'` passado em `entity_type`, não uma leitura de tabela — o corpo usa `public.audit_logs`, `auth.uid()` e `jsonb_build_object` (pg_catalog). Idem os demais: `search_contacts` final responde `NAO - tudo qualificado`:

```
PROBE|search_contacts_unqualified|exit=0|NAO - tudo qualificado
```

Os únicos que usam tabela sem schema são `prevent_contact_assignee_hijack` / `prevent_contact_queue_hijack` (`FROM profiles p JOIN user_roles ur`), mas eles declaram `search_path = public, pg_temp` → `pg_temp` fica por último → sem shadowing. **Conclusão: resíduo de estilo, não vetor**, porque (a) o corpo qualifica tudo e (b) mesmo o canal preciso para explorar (dois statements na mesma sessão, para o `CREATE TEMP TABLE` preceder a chamada) não existe no PostgREST. Registrar como inconsistência com a convenção que o próprio repo adota em 4 arquivos do dia (`'public','pg_temp'`).

**Multiplix: as 3 funções do motor continuam `service_role`-only (checado, e é o ponto mais sensível do dia).** `claim_multiplix_recipient`, `complete_multiplix_dispatch_if_drained` e `transition_multiplix_dispatch` são `CREATE OR REPLACE` em `20260929600000` **sem** `REVOKE` no arquivo — o que, à primeira leitura, seria um buraco grande (elas mudam estado de disparo e ignoram a RLS). Não é:

1. foram criadas em `20260926180000_multiplix_send_engine.sql` com `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role` nas linhas 456–474;
2. `CREATE OR REPLACE FUNCTION` **preserva** a ACL existente — provado em §1.3;
3. além disso cada uma tem gate interno fail-closed: `IF COALESCE(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'`.

Idem `enforce_multiplix_*_mutability` (gate A6), `sweep_multiplix_stuck_recipients`, `multiplix_dispatch_window_is_open`, `multiplix_connection_daily_usage`, `trigger_pending_multiplix_dispatches` e `multiplix_create_draft` — todos com `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT` a `service_role` no próprio arquivo do dia.

**Ponto positivo estrutural:** `20260929570000` fez `REVOKE ALL … FROM anon` nas 3 tabelas, `REVOKE TRUNCATE,REFERENCES,TRIGGER … FROM authenticated` e **`FORCE ROW LEVEL SECURITY`** nas 3. E `20260929560000` removeu `TRUNCATE` e `REFERENCES` de `public.contacts` para `authenticated,anon` (privilégios que **não passam por RLS**) e tirou o `SELECT` inútil de `anon`. Mesma coisa em `20260929650000` para `catalog_favorites` / `catalog_send_events`, revogando nos **dois níveis** (tabela e coluna — o de coluna sobrevive a `REVOKE … ON TABLE`).

**Nenhuma função do dia usa parâmetro do cliente como identidade (item 6).** Auditoria das fontes de identidade das funções do dia:

| Fonte | Funções do dia |
|---|---|
| `auth.uid()` **dentro** de SECURITY DEFINER | `search_contacts` (140000/780000/810000), `delete_contact`/`delete_contacts` (370000/720000/780000/810000), `can_edit_contact` 5-arg (810000), `can_delete_contacts` (770000/820000), `audit_contact_address_change` (150000), `prevent_contact_assignee_hijack` / `prevent_contact_queue_hijack` (790000) |
| `public.current_profile_id()` (= `profiles.id` de `auth.uid()`) *dentro* de SECURITY DEFINER | as 13 RPCs de team chat (`…170000` a `…440000`) |
| `auth.role()` dentro de SECURITY DEFINER | as 7 funções Multiplix (`…590000`, `…600000`, `…610000`, `…630000`) |
| RLS como chamador (não-definer) | `contacts_count_by_type` (370000) |

**Nenhuma** delas aceita identidade por parâmetro (`p_user_id`, `p_profile_id` como *quem age*). A única exceção — e é exatamente o achado A4 — é `can_edit_contact` de 5 argumentos, que aceita os **insumos** da autorização (não a identidade). É uma diferença importante: não há vetor de impersonação nas RPCs do dia.

---

### 3.6 Achados funcionais (não são escalada de privilégio, mas são do dia)

**B1 — ALTO funcional: `get_team_messages_page` está 100 % quebrada.** `20260929270000` (E38) declara `RETURNS TABLE(…, conversation_id uuid, …)` e no corpo faz:

```sql
IF NOT EXISTS (SELECT 1 FROM public.team_conversation_members
               WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id) THEN
```

O parâmetro de saída `conversation_id` colide com a coluna → erro **sempre**, para membro e para não-membro:

```
PROBE|get_team_messages_page_alheia|exit=1|ERROR:  column reference "conversation_id" is ambiguous
  QUERY: NOT EXISTS (SELECT 1 FROM public.team_conversation_members WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id)
  CONTEXT: PL/pgSQL function get_team_messages_page(uuid,uuid,integer) line 1 at IF
PROBE|get_team_messages_page_MEMBRO|exit=1|ERROR:  column reference "conversation_id" is ambiguous    # também para quem é membro
PROBE|search_team_messages_MEMBRO|exit=0|2                                                           # a RPC irmã funciona
```

Classificação: **fail-closed** (nega todo mundo) → não é vulnerabilidade; é indisponibilidade de função publicada no dia. Correção: `WHERE tcm.conversation_id = p_conversation_id` com alias na tabela.

**B2 — ALTO funcional (proveniência 28/09, não do dia): recursão infinita na policy `tcm_select_own`.** A policy veio de `20260928580000_team_chat_e22_team_conversation_members_policies.sql` (recuperada do ledger) e faz subselect na própria tabela:

```sql
CREATE POLICY tcm_select_own ON public.team_conversation_members FOR SELECT TO authenticated
USING (profile_id = public.current_profile_id()
   OR EXISTS (SELECT 1 FROM public.team_conversation_members m2
              WHERE m2.conversation_id = team_conversation_members.conversation_id
                AND m2.profile_id = public.current_profile_id()));
```

```
PROBE|select_direto_membros_MEMBRO|exit=1|ERROR:  infinite recursion detected in policy for relation "team_conversation_members"
PROBE|b1_le_membros_a_direto|exit=1|ERROR:  infinite recursion detected in policy for relation "team_conversation_members"
PROBE|get_team_inbox_MEMBRO|exit=0|40000000-0000-0000-0000-0000000000a/Grupo A    # as RPCs definer funcionam (o dono ignora RLS)
```

Qualquer `SELECT` direto de `authenticated` na tabela falha. Isso **não** afeta a segurança dos achados A1–A3 (as RPCs definer escrevem fora da RLS), mas explica por que o invasor de A1 não consegue ler de volta pela tabela — e é o motivo pelo qual a superfície de `team_conversation_members` merece um `SECURITY DEFINER` helper (como `is_team_conversation_member`, que já existe e é usado nas outras tabelas).

---

## 4. O que NÃO foi verificável (e por quê)

1. **Estado vivo do canônico `tnnnlkbymytvtqngbbqh`.** Gateway MCP fora (`zapp_db.py "select 1"` → saída vazia). Não li `pg_proc`, `pg_policy`, `pg_trigger`, `pg_class.relforcerowsecurity`, `pg_roles`, nem `role_table_grants`/`column_privileges` do banco real. **Tudo aqui é fato do par arquivo↔execução em PG 17 descartável.**
2. **Drift entre arquivo e ledger.** `20260929370000` **não** reaplica byte-a-byte: o arquivo declara `search_contacts` com 17 colunas enquanto o SQL aplicado em produção tem 23 (o próprio repo documenta isso e reconcilia por hash em `scripts/db-audit/migration-evidence.json`, classe `safer-replay`). No harness a migration abortou nesse ponto:
   ```
   APPLY|FAIL|20260929370000_contacts_soft_delete_and_search_filters|ERROR:  cannot change return type of existing function
     DETAIL:  Row type defined by OUT parameters is different.
   ```
   O estado final dos objetos que auditei nesse cluster vem de `20260929720000` / `…770000` / `…780000` / `…790000` / `…810000` / `…820000`, que aplicaram. `contacts_count_by_type` já existia de migrations anteriores, então a lacuna não deixou objeto faltando.
3. **`FORCE ROW LEVEL SECURITY` + dono real no Supabase.** No container o `postgres` é superusuário; no Supabase o dono `postgres` **não** é. Provei o mecanismo com dono `NOSUPERUSER NOBYPASSRLS` (§1.3), o que torna a conclusão válida, mas **o estado de `relforcerowsecurity` de cada tabela no canônico não foi lido** — para team_*/contacts o harness assume o modelo do repo (sem FORCE), e o próprio `20260929570000` documenta que sem FORCE o dono ignora RLS. Se alguma tabela team_* tiver FORCE ligado no canônico por migration que eu não repliquei, **A2/A3 (as escritas) continuam valendo** — porque as RPCs definer executam como dono e as policies de INSERT não têm condição de vínculo de qualquer forma; o que mudaria seria apenas a leitura de retorno.
4. **Políticas de RLS completas do canônico.** A fixture do team chat espelha o modelo de vínculo de `20260402130912` + as policies de `20260928430000/…480000/…490000/…570000/…580000` **mais** as que o dia recria (`reactions_*`). Não repliquei a série E1–E25 inteira. Como as conclusões de A1/A2/A3 dependem do **corpo das funções** (byte-idêntico, aplicado do repo) e do **texto das policies do dia**, elas não mudam com policies adicionais — policies permissivas se somam (`OR`), nunca restringem as existentes.
5. **`pg_cron`/`pg_net`/`storage`/`vault` e o resto do schema.** Fora do escopo do dia e não presentes no descartável. Três migrations não aplicaram por dependerem de objetos fora do recorte: `…240000` (publication — stub criado, aplicou), `…250000` (dependia de `department_audit_logs`/`department_invitations` — stub criado, aplicou) e nada mais; ver a lista `APPLY|` completa em `audit-w2-evidencias/`. Nenhuma delas cria/alteram função, trigger ou policy relevante para os achados: `…250000` é só `COMMENT ON TABLE`.
6. **Comportamento do PostgREST do canônico.** Não pude confirmar empiricamente *como* o PostgREST vivo popula `request.jwt.claims` / `request.jwt.claim.role` / `request.jwt.claim.sub`. Toda a análise de forja de GUC (B6/A6) assume o comportamento padrão (claims vindas do JWT assinado) e está marcada como **não demonstrada pelo canal do app**.
7. **Volume de dados real e o custo do predicado.** `20260929810000` cita medição de produção (3.224 ms vs. 128 ms em 3.104 contatos). Não reproduzi performance; aquele número é citação do arquivo, não minha medição.
8. **22 das 45 migrations do dia são reconstruções do ledger, não os bytes originais — e é exatamente onde estão os achados ALTO/MÉDIO de team chat.** O próprio cabeçalho de cada arquivo diz:

   ```
   -- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
   -- Migration 20260929300000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
   -- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
   -- scripts/db-audit/check-migration-drift.mjs
   ```

   São os 22 `2026092916…`–`2026092944…` (`_team_chat_e26_` a `_team_chat_e51_`). Consequências:

   - a fidelidade dos corpos que auditei repousa na coluna de statements do ledger, que eu **não pude reler no banco vivo** (gateway fora) — o `check-migration-drift.mjs` do repo faria isso e não pôde rodar;
   - os outros 23 arquivos (contatos, Multiplix, Talk X, catálogo) **não** são reconstruções: nasceram no Git com autor/plano citados, e o `apply` deles no descartável é evidência direta;
   - o achado A1/A2 é, portanto, "o SQL que o ledger registra como aplicado" — o que **aumenta** a gravidade do contexto (DDL foi a produção **fora do Git**, junto com as RPCs desprotegidas) e é uma ressalva que o leitor precisa ter para calibrar confiança.
9. **Um comentário de migration é citado como fonte de um número de produção.** O "128 ms → 3.224 ms" e o "3.104 contatos" do item 7 vêm do cabeçalho de `20260929810000`, não de medição minha. Reproduzi apenas a forma do defeito (chamada por linha vs. lista pronta), não o custo absoluto.

---

## 5. Recomendações, em ordem de retorno

1. **Fechar a superfície de escrita de `team_message_reactions` e `team_message_receipts`** (A1/A2/A3): `WITH CHECK` com condição de vínculo **e** guard explícito nas 2 RPCs. É o único conjunto de achados com escrita não autorizada demonstrada e efeito visível para terceiros.
2. **Tirar `EXECUTE` de `authenticated` das variantes "hoisted"** de `can_edit_contact` (A4/A5) e mover os lookups para dentro da função, ou renomear para um objeto interno. Enquanto houver um parâmetro que substitui `auth.uid()`, existe um chamador futuro capaz de transformar isso em escalada.
3. **Trocar os gates por GUC por teste de privilégio** (A6): em trigger, use `current_user`/`session_user`/`pg_has_role` em vez de `auth.role()`; e nunca deixe o ramo de negação ser o caminho de saída. Aproveitar e trocar `current_setting('request.jwt.claims', true)::jsonb->>'role'` em `prevent_contact_*_hijack` (hoje redundante com a RLS, mas o `22P02` quando a GUC falta é ruído desnecessário).
4. **Corrigir `get_team_messages_page`** (B1) — a função está publicada e não funciona para ninguém.
5. **Corrigir a policy `tcm_select_own`** (B2) — hoje qualquer `SELECT` direto de `authenticated` em `team_conversation_members` estoura, forçando todo mundo a usar RPC `SECURITY DEFINER`. Envolver o subselect em `public.is_team_conversation_member()` (definer, que já existe).
6. **Fechar o resíduo de ACL** (B3) — adicionar `REVOKE EXECUTE … FROM PUBLIC, anon` nas 4 funções de trigger novas do dia, e transformar isso em check no `db-guard` (`scripts/db-audit/grants-baseline.sql` é o lugar natural), já que a varredura de `20260927390000` regrediu em 2 dias.
7. **Padronizar `search_path = public, pg_temp`** em toda função definer nova (B4) — barato, elimina a classe de shadowing e alinha com o que 4 arquivos do dia já fazem.

---

## Anexo — Comandos exatos

```sh
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
cd ~/hermes-workspaces/Zapp_Web_V2/auditoria-onda2-2609291646adae

bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/w2-mecanica-pg.test.sh
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/w2-contacts-seguranca.test.sh
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/w2-teamchat-seguranca.test.sh
```

Saídas brutas: `audit-w2-evidencias/out-mecanica.txt`, `out-contacts.txt`, `out-teamchat.txt`.

Inventário do dia (somente leitura, sem tocar o canônico):

```sh
git -C ~/projetos/Zapp_Web_V2 ls-tree -r --name-only HEAD -- supabase/migrations/ | grep 20260929   # 45 arquivos
```

Nenhum DDL/DML foi executado no banco canônico; nenhum arquivo foi escrito em `~/projetos/**`; nenhum `commit`, `push` ou `checkout`.
