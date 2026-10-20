# Auditoria Onda 3 — a3-brown (consumidores / over-closing / brownfield)

- Ref (somente leitura): `/home/joaquim_ataides/projetos/Zapp_Web_V2` — `git fetch origin -q` feito; `origin/main = 92e884eef21d86ec05ba5659feb8e63c4f2799f4` (2026-09-30 14:56 -0300, alvo confirmado = 92e884ee).
- Banco canônico (ref `tnnnlkbymytvtqngbbqh`) lido somente-SELECT via `zapp_db.py`.
- PRs: #1309 (MERGED, mergeCommit b4581381) fix #1265 reação cross-team; #1313 (MERGED, 9d37567e) fix #1266 RPC ambígua + recursão da policy; #1314 (OPEN, head `hermes/multiplix-guards-fail-closed-26093014476657`, MERGEABLE) fix #1267 guards Multiplix fail-closed.
- Não usei sandbox separado: `git grep -n <token> origin/main -- <path>` e `git show origin/main:<path>` leem o objeto direto, sem checkout e sem escrever em `~/projetos` (proibição respeitada).

---

## 1) INVENTÁRIO de consumidores (git grep em origin/main)

### toggle_team_reaction
- `supabase/migrations/20260929300000_team_chat_e41_toggle_team_reaction_rpc.sql:6` (RPC original, sem vínculo), `:8` REVOKE, `:10` GRANT
- `supabase/migrations/20260930260000_team_reaction_membership_guard.sql:30` (RPC nova, com `not_member`), `:6` rollback, `:20` comentário
- `src/integrations/supabase/types.ts:10503` — **única ocorrência em `src/`**; **NÃO existe chamador da RPC no app** (o front NÃO chama `rpc('toggle_team_reaction')`)
- `scripts/db-audit/team-reaction-membership.test.sh:210,231,232,290,294,310,322,328`
- `supabase/schema-catalog.json:2025,2376`; `supabase/schema-manifest.json:3935,5070,5093,5102`

### team_message_reactions
- Seleção: `src/hooks/team-chat/useTeamMessageReactions.ts:52`
- Mutação (caminho real do app): `src/hooks/team-chat/useTeamMessageReactions.ts:89` (DELETE) e `:92` (INSERT)
- Realtime: `src/hooks/team-chat/useTeamMessageReactions.ts:68`
- Tipos: `src/integrations/supabase/types.ts:7631`
- Migrations relevantes: `20260902120000_team_chat_v3_parity_reactions_status_departments.sql:93` (cria `team_message_reactions_insert`), `20260902200000_fix_team_message_reactions_membership_tautology.sql:13,15` (recria com vínculo), `20260927630000_add_conversation_id_to_team_message_reactions.sql:1`, **`20260929220000_team_chat_e32_reactions_hardening.sql:26` (cria a policy fraca `reactions_insert` — a duplicata do #1265)**, `20260930260000_team_reaction_membership_guard.sql:28` (DROP `reactions_insert`)
- `scripts/db-audit/realtime-publication-baseline.json:31`

### team_message_receipts
- `src/hooks/team-chat/useTeamMessages.ts:55,65` (upsert de recibo de leitura)
- `src/hooks/team-chat/useTeamConversations.ts:119` (realtime)
- `src/integrations/supabase/types.ts:7687`
- Migrations: `20260927270005:1,3,5,7,9,11,13`, `20260927270016:1,3`, `20260928430000:18,20,22,24,26,28`, `20260928440000:6,8,10`, `20260928490000:6`
- `scripts/db-audit/realtime-publication-baseline.json:32`

### useTeamMessageReactions
- Definição: `src/hooks/team-chat/useTeamMessageReactions.ts:43`
- **Único consumidor**: `src/components/team-chat/useTeamChatPanel.ts:9` (import) e `:58` (`useTeamMessageReactions(conversation.id)`)

### get_team_messages_page
- RPC original: `supabase/migrations/20260929270000_team_chat_e38_get_team_messages_page_rpc.sql:6,8,10`
- Fix: `supabase/migrations/20260930280000_team_rpc_ambiguity_and_tcm_recursion.sql:41`
- `src/integrations/supabase/types.ts:9885` — **única ocorrência em `src/`; nenhum chamador** (o app lê mensagens por SELECT direto em `team_messages`: `src/hooks/team-chat/useTeamMessages.ts:17`)
- `scripts/db-audit/team-chat-rpc-ambiguity.test.sh:149,188,189,232,243,278...`

### is_team_conversation_member
- Definição: `supabase/migrations/20260402130912_abca9ec2-dfde-4f76-908b-2e993e611ad5.sql:49` (usa `team_conversation_members` JOIN `profiles` por `profile_id`/`user_id`)
- Usos em policies: `20260402130912:66,79,96,101`, `20260902200000:26`, `20260928430000:20`, `20260930280000:87`
- `src/integrations/supabase/types.ts:10009`

### team_conversation_members
- App: `src/hooks/team-chat/useTeamConversations.ts:17,33`, `useTeamChatMembers.ts:27`, `useTeamChatMutations.ts:119,133,150,185,207`, `useTeamMessages.ts:70`, `src/hooks/chat/useTeamChatNotifications.ts:118`
- Migrations: `20260402130912:38..`, `20260927270000`, `20260927270015`, `20260928580000` (cria `tcm_*`), `20260928430000`, `20260930280000:83,85`

### multiplix_dispatches
- App (só **leitura**): `src/hooks/integrations/useMultiplixDispatches.ts:39,54`; `src/components/multiplix/MultiplixMonitor.tsx:84` (realtime)
- Edge (service_role): `supabase/functions/multiplix-send/index.ts:163,187,223,331,438,587`
- Migrations: `20260926161000_multiplix_dispatches_schema.sql:12`, `20260926180000_multiplix_send_engine.sql:43,55,66,102,136,282,324,397`

### enforce_multiplix_dispatch_mutability / enforce_multiplix_recipient_mutability
- `supabase/migrations/20260929590000_multiplix_mutability_guard.sql:21` (dispatch) e `:100` (recipient); triggers `:131-139`
- **PR #1314 (NÃO em main): `supabase/migrations/20260930300000_multiplix_guards_fail_closed.sql`** (ver §6)
- REVOKE anon: `20260930113613_revoke_anon_default_privileges_and_gamification_rpcs.sql:43`
- `supabase/schema-catalog.json:2170,2171`; `schema-manifest.json:3774,3778,3893,3897,4929,4944,4985,4997,4996,5010`

### multiplix_recipients
- App (só **leitura**): `src/hooks/integrations/useMultiplixDispatches.ts:70`; `src/components/multiplix/MultiplixMonitor.tsx:63,88`
- Edge (service_role): `supabase/functions/multiplix-send/index.ts:317`
- Migrations: `20260926161000:45,67,68,76,81,107..141`, `20260926180000:16..46,84..216`, `20260929850000_multiplix_revoke_recipient_writes.sql`

---

## 2) A PERGUNTA MAIS IMPORTANTE — over-closing do #1309/#1265

**Definição no banco (raw, `zapp_db.py`):**
```
is_team_conversation_member(_user_id uuid, _conversation_id uuid) RETURNS boolean
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.team_conversation_members tcm
    JOIN public.profiles p ON p.id = tcm.profile_id
    WHERE tcm.conversation_id = _conversation_id AND p.user_id = _user_id);
$function$;
```
→ "membro" = **ter linha em `team_conversation_members`** (coluna `profile_id` → `profiles.user_id`).

**O fix do #1309 (aplicado em produção, conferido no canônico):**
- INSERT em `team_message_reactions` — **restou 1 só policy** (`reactions_insert` foi DROPada):
```json
{"tablename":"team_message_reactions","policyname":"team_message_reactions_insert","cmd":"INSERT",
 "roles":"{authenticated}",
 "with_check":"((EXISTS (SELECT 1 FROM profiles p WHERE p.id=team_message_reactions.profile_id AND p.user_id=auth.uid()))
   AND (EXISTS (SELECT 1 FROM team_messages tm WHERE tm.id=team_message_reactions.message_id
     AND is_team_conversation_member(auth.uid(), tm.conversation_id))))"}
```
  `pk_policies` para `team_message_reactions` INSERT = 1 (o `reactions_insert` NÃO existe mais). Confirmado por consulta em `pg_policies`.

**O app permite a um NÃO-membro abrir a conversa e reagir? NÃO.**
- Lista de conversas = **só onde há linha de membro**: `src/hooks/team-chat/useTeamConversations.ts:17` → `.from('team_conversation_members').select(...).eq('profile_id', profile.id)`; sem `memberships` retorna `[]` (`:22`). Um não-membro não tem linha → conversa **não aparece**.
- A tela só renderiza o painel para a conversa selecionada dessa lista: `src/components/team-chat/TeamChatView.tsx:14` (`useTeamConversations()`) e `:45` (`<TeamChatPanel conversation={selectedConversation} …>`).
- `team_conversations` SELECT (live) = `is_team_conversation_member(auth.uid(), id) OR created_by = current_profile_id()` — **sem bypass de admin/supervisor**.
- `team_messages` SELECT (live) = `is_team_conversation_member(auth.uid(), conversation_id)` — **sem bypass de admin/supervisor**.
- O hook de reação só existe dentro do painel: `src/components/team-chat/useTeamChatPanel.ts:58`.

**Conclusão (severidade):** o #1309 fechou o furo **sem quebrar um caminho legítimo de tela** — não há como um não-membro chegar ao botão de reagir, porque tanto a listagem quanto o SELECT de mensagens/reações exigem vínculo. **NÃO é achado de over-closing na UI principal.**
- *Ressalva honesta (caminho teórico não alcançável hoje):* `team_conversations` SELECT admite `created_by = current_profile_id()`. Um criador **sem** linha em `team_conversation_members` conseguiria ler a linha da conversa, mas **não** as mensagens (SELECT de `team_messages` exige vínculo) e a conversa **não** aparece na lista (que é escopada por `memberships`). Ou seja: sem botão de reação, sem impacto.
- *Assimetria a registrar:* o INSERT agora exige vínculo, mas o DELETE de reação **não** exige (§4) — um membro que reagiu e depois saiu ainda poderia apagar a própria reação *se conseguisse enxergá-la*; não consegue (SELECT exige vínculo). Não é buraco, é assimetria cosmética.

---

## 3) RPC toggle_team_reaction — ramos e o que o `not_member` morde

Definição viva (canônico, `pg_get_functiondef`):
```
IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
SELECT tm.conversation_id INTO v_conversation_id
  FROM public.team_messages tm
  JOIN public.team_conversation_members tcm ON tcm.conversation_id = tm.conversation_id
 WHERE tm.id = p_message_id AND tcm.profile_id = v_profile_id;
IF v_conversation_id IS NULL THEN RAISE EXCEPTION 'not_member'; END IF;
-- depois: SELECT EXISTS(...) -> 'removed' (DELETE) | senão 'added' (INSERT ... conversation_id = v_conversation_id)
```
Ramos:
- `not_authenticated` — sem perfil.
- `not_member` — **checado ANTES de qualquer ramo**, logo morde **added E removed**.
- `added` — exige vínculo; agora preenche `conversation_id` (antes **sempre estourava** `null value in column "conversation_id"`, pois a coluna é NOT NULL sem default e a tabela não tem trigger — ver `20260930260000…:66`).
- `removed` — exige vínculo.

**O `not_member` adicionado morde algum caminho legítimo?**
- **Autor apagando a própria reação após sair/ser removido do time:** SIM, morde — a checagem de vínculo vem antes do `EXISTS`, então a RPC devolve `not_member` mesmo a reação sendo do próprio autor. **Impacto hoje = zero**, porque **nenhum código do app chama esta RPC** (só `types.ts` a referencia; §1). É um estreitamento real do contrato da RPC, sem consumidor que o exercite.
- **Moderador/admin/moderador apagando reação de outro:** a RPC nunca teve esse ramo (só toca a própria linha do chamador); nada mudou.
- **Não-membro reagindo (o furo original):** fechado, correto.

---

## 4) Quem apaga/altera reação (DELETE/UPDATE) — policies vivas

`pg_policies` para `team_message_reactions` (canônico):
- **DELETE (2, ambas PERMISSIVE, só próprio autor):**
  - `reactions_delete` → `USING (profile_id = current_profile_id())`
  - `team_message_reactions_delete` → `USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = team_message_reactions.profile_id AND p.user_id = auth.uid()))`
  - **Nenhuma exige vínculo de time; nenhuma dá poder a admin/supervisor.** → o autor apaga a própria; um não-membro **não** apaga a de outro (a policy nem considera a linha de terceiros).
- **UPDATE:** **não existe policy de UPDATE** em `team_message_reactions` → com RLS habilitada e sem policy permissiva, **UPDATE é negado** para `authenticated`. Reação é imutável exceto insert/delete.
- **SELECT (2):** ambas exigem vínculo (`reactions_select` via `team_conversation_members`; `team_message_reactions_select` via join). Sem bypass de admin.
- Efeito real: **nada de "nada apaga"** — o DELETE do app (`useTeamMessageReactions.ts:89`) funciona para o autor; não há caminho para apagar reação de terceiros nem para editar reação.

---

## 5) #1266 — get_team_messages_page e a policy recursiva

- **Chamadores de `get_team_messages_page`:** nenhum em `src/` (só `types.ts:9885`) nem em edge/functions/RPC/cron. O app lê mensagens por SELECT direto (`useTeamMessages.ts:17`). → a ambiguidade 42702 era **LATENTE** (defeito em objeto concedido a `authenticated`, sem primeiro cliente). **Risco: BAIXO** (quebra funcional latente; o gate `not_member` está presente, não é furo de segurança). A própria migration declara isso (`20260930280000…:22`).
- **A outra metade do #1266 (`tcm_select_own` recursiva) NÃO era latente:** foi criada em `20260928580000_team_chat_e22_team_conversation_members_policies.sql:18` com `USING (profile_id = current_profile_id() OR EXISTS (SELECT 1 FROM public.team_conversation_members m2 …))` — **a policy referencia a própria tabela** → PostgreSQL aborta qualquer SELECT de `authenticated` nessa tabela com `42P17 "infinite recursion detected in policy"`. Isso é **consumido pelo app** (`useTeamConversations.ts:17`, `useTeamChatMembers.ts:27`) e quebra a lista de conversas do time. A policy viva hoje (já corrigida por #1313) = `USING (is_team_conversation_member(auth.uid(), conversation_id))`. O teste reproduz o 42P17: `scripts/db-audit/team-chat-rpc-ambiguity.test.sh:236-237`, e a versão corrigida `:315,324`. **Risco: MÉDIO** — quebra funcional alcançável (não latente), sanada.
- **Helper `is_team_conversation_member` em outras policies (5 na live):**
  - `team_conversation_members` SELECT (`tcm_select_own`), `team_conversations` SELECT, `team_messages` SELECT, `team_messages` INSERT, `team_message_reactions` INSERT.
  - Comportamento de leitura: o helper lê `team_conversation_members` via `SECURITY DEFINER` (dono `postgres`, `relforcerowsecurity=false`) → **não** dispara a RLS da tabela de membros, evitando recursão. A semântica do `qual` antigo ("minha linha **ou** linha minha na mesma conversa") é idêntica a "sou membro → helper", então **não ampliou nem reduziu quem lê**.

---

## 6) #1267 (NÃO aplicado) — existe caminho legítimo de escrita como `authenticated`?

**Estado atual (canônico):** guards ainda **fail-open** (não aplicados) — `prosecdef=false`:
```
IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
```
`auth.role()` (canônico) = `coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role'))` → NULL sem a GUC.

**O que o #1314 muda (diff do PR):** primeiro `IF current_user <> 'authenticated' THEN RETURN` (dispensa por **papel real**), depois `IF auth.role() IS NULL THEN RAISE 'multiplix_guard_auth_role_undefined'`. Corpo de negócio idêntico.

**Rastreio de caminhos de escrita em `multiplix_dispatches`/`multiplix_recipients`:**
- **RPCs do motor (15):** todas `SECURITY DEFINER`, **`authenticated` NÃO tem EXECUTE** (canônico: `auth_can_exec=false`, `srv_can_exec=true`) — `transition_multiplix_dispatch`, `claim_multiplix_recipient`, `complete_multiplix_*`, `record_*`, `persist_*`, `release_*`, `reschedule_*`, `sweep_multiplix_stuck_recipients`, `trigger_pending_multiplix_dispatches`, `multiplix_create_draft`, `multiplix_connection_daily_usage`, `multiplix_dispatch_window_is_open`. Migration `20260926180000…:456-474` faz `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role`. → **não** são caminho `authenticated`.
- **Edge functions:** `multiplix-send/index.ts:76` (`SUPABASE_SERVICE_ROLE_KEY`) e `multiplix-audience/index.ts:104,128` (`SUPABASE_SERVICE_ROLE_KEY` + `EXTERNAL_…`) → conectam como **`service_role`** (`current_user=service_role`) → **dispensadas** pelo fail-closed.
- **pg_cron:** **TODOS os 11 jobs rodam como `postgres`** (canônico `cron.job`: `username='postgres'` em todos, inclusive `multiplix-send-trigger` → `SELECT public.trigger_pending_multiplix_dispatches()`) → `current_user='postgres'` → **dispensados**.
- **Front-end:** **não escreve** direto nas tabelas — só SELECT (`useMultiplixDispatches.ts:39,54,70`) e mutações via edge (`useMultiplixDispatches.ts:135-136` → `createMultiplixDraft` → edge `multiplix-audience` → RPC `multiplix_create_draft`; `invokeMultiplixSend` → edge `multiplix-send`).
- **Trigger de outra tabela escrevendo as tabelas como `authenticated`:** varredura no canônico (`pg_proc.prosrc ILIKE '%multiplix_dispatches%' OR '%multiplix_recipients%'`) retorna 16 funções — os 15 RPCs/guards + os próprios guards (trigger, `secdef=false`, que **não escrevem**). Nenhuma dispara escrita nessas tabelas a partir de uma sessão `authenticated` sem claim.
- `authenticated` **ainda tem** INSERT/UPDATE/DELETE em `multiplix_dispatches` (e DELETE/SELECT em `multiplix_recipients`; INSERT/UPDATE já revogados por `20260929850000`) — mas PostgREST **sempre** injeta `request.jwt.claim.role`, então `auth.role()` fica definido e o guard aplica a regra (comportamento inalterado pelo #1267).

**Conclusão (#1267):** **não encontrei caminho legítimo que execute como `authenticated` sem a claim.** O único estado que passa a ser barrado é justamente `authenticated` sem a GUC — indistinguível de ataque. `postgres` (migrations/backfill/cron) e `service_role` (worker/RPCs) são dispensados pelo `current_user` e **não** perdem escrita. → **NÃO é achado de over-closing**; o fail-closed do #1314 não barra caminho legítimo identificável.

---

## Veredito rápido
| Item | Achado | Severidade |
|---|---|---|
| #1265/#1309 over-closing (não-membro reagir) | **Não reproduzível via app**: listagem e SELECT de mensagens/reações exigem vínculo; sem bypass de admin | Nenhum (falso-positivo de over-closing) |
| RPC `toggle_team_reaction` `removed` para ex-membro | Estreitamento real (bloqueia apagar reação própria após sair), **sem consumidor no app** | BAIXO (latente) |
| #1266 `get_team_messages_page` | Defeito **latente**, sem chamador; risco funcional latente | BAIXO |
| #1266 `tcm_select_own` recursiva (42P17) | **Alcançável** (quebra lista de conversas); sanado por #1313 | MÉDIO |
| #1267 fail-closed | Sem caminho legítimo `authenticated` sem claim; cron/edge/RPCs são `postgres`/`service_role` | Nenhum (falso-positivo de over-closing) |
| DELETE/UPDATE de reação | DELETE só do autor (2 policies own-only); **sem policy de UPDATE** → update negado; sem admin | OK (sem escalada) |

## Comandos-chave usados (raw)
- `git fetch origin -q; git rev-parse origin/main` → `92e884eef21d86ec05ba5659feb8e63c4f2799f4`
- `git grep -n <token> origin/main -- src supabase scripts` (inventário acima)
- `git show origin/main:<migration>` (20260930260000, 20260930280000, 20260929590000, 20260402130912, 20260404172933, 20260928580000, 20260926180000)
- `zapp_db.py "SELECT … FROM pg_policies WHERE tablename IN (...)"; "SELECT … pg_get_functiondef …"; "SELECT jobname, username FROM cron.job"; "SELECT proname, prosecdef, has_function_privilege('authenticated',oid,'EXECUTE') … FROM pg_proc"`
- `gh pr view 1309/1313/1314`; `gh issue view 1267`; `gh pr diff 1314`
