# A5 — RED TEAM DE NÚMEROS (Onda 3 / Multiplix guards)

**Alvo:** afirmações que o coordenador pretende publicar sobre o PR #1314 (`20260930300000_multiplix_guards_fail_closed`).
**Repositório (referência, somente leitura):** `/home/joaquim_ataides/projetos/Zapp_Web_V2` — `git fetch origin -q` antes de cada verificação.
**`origin/main` no MOMENTO DA AUDITORIA:** começou em `d3ed11cba198bbdaa96b12c08145aa84c12ae7f0` e avançou para **`3393b540c8eff4f12fe73ed0eff42e789584cff1`** (`fix(ci): fila de deploy de edge por funcao (#1315)`) durante a janela. **Todos os números abaixo foram RE-CHECADOS em `3393b540` e não mudaram** (o PR #1315 só altera CI; nenhuma migration nova além das listadas).
**Banco canônico:** `tnnnlkbymytvtqngbbqh`, somente leitura via `python3 ~/projetos/mcp-clone-bwwbey/zapp_db.py`.
**Método:** `git grep`/`git ls-tree`/`git log` em `origin/main`; catálogo via `pg_proc`/`pg_policies`/`pg_trigger`/`cron.job`/`supabase_migrations.schema_migrations`.
Nenhuma escrita em repo, banco, nem execução de suíte. Nenhum valor de segredo impresso.

Legenda de veredito: **CONFIRMADA** / **REFUTADA** / **PARCIAL** / **NÃO VERIFICÁVEL**.

---

## ATAQUE 1 — "Das funções Multiplix que citam auth.role(), 13 são FAIL-CLOSE e só 2 (os triggers enforce_multiplix_*) eram FAIL-OPEN"

**Comandos**
```
python3 zapp_db.py "SELECT count(*) ... WHERE p.prosrc ILIKE '%auth.role()%'"        -- todas as funções
python3 zapp_db.py "SELECT proname, secdef, <linhas com auth.role()> FROM pg_proc
                    WHERE proname LIKE '%multiplix%'"                                -- 15 linhas
python3 zapp_db.py "SELECT proname,count(*) FROM pg_proc WHERE proname LIKE '%multiplix%' GROUP BY 1 HAVING count(*)>1"
```
**Saída crua (resumo)**

- Total de funções em `public` que citam `auth.role()`: **57** (nenhuma em outro schema).
- Delas, com `multiplix` no nome: **15**, sem nenhuma sobrecarga (`HAVING count(*)>1` → 0 linhas).
- **13** têm o predicado exatamente
  `IF COALESCE(auth.role(), '') <> 'service_role' THEN` → `RAISE EXCEPTION 'service_role_required' USING ERRCODE='42501'`
  (`claim_multiplix_recipient`, `complete_multiplix_dispatch_if_drained`, `complete_multiplix_recipient`,
  `mark_multiplix_recipient_dispatch_started`, `multiplix_connection_daily_usage`, `multiplix_create_draft`,
  `persist_multiplix_recipient_message_snapshot`, `record_multiplix_recipient_delivered`, `record_multiplix_recipient_sent`,
  `release_multiplix_recipient_claim`, `reschedule_multiplix_recipient`, `sweep_multiplix_stuck_recipients`,
  `transition_multiplix_dispatch`). Com a GUC ausente: `COALESCE→''`, `'' <> 'service_role'` = **TRUE → RAISE**. **FAIL-CLOSE.** ✔
- **2** são os triggers `enforce_multiplix_dispatch_mutability` / `enforce_multiplix_recipient_mutability`, hoje já **fail-close**:
  ```
  IF current_user <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF auth.role() IS NULL THEN RAISE EXCEPTION 'multiplix_guard_auth_role_undefined' USING ERRCODE='42501'; END IF;
  IF auth.role() <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;
  ```
  (é a versão de `20260930300000` — a migration **está aplicada**, ver Ataque 3)

**Veredito: CONFIRMADA (com a ressalva do total).**
13 FAIL-CLOSE + 2 FAIL-OPEN = **15 funções** — bate com o catálogo.
O que **não** fecha é o corpo do PR: **"17 funções Multiplix / 15 fail-close" NÃO se reproduz** — via marcação de módulo (`multiplix` no nome) o catálogo tem 15, não 17; não há sobrecargas e não há 2 funções Multiplix extras citando `auth.role()` em outro schema.
👉 **Não publique "17". O número certo é 15 (13 fail-close + 2 guards).** A frase sob ataque (13/2) está correta.

*Ressalva de fundo (honesta, não muda a contagem):* os 13 "fail-close" confiam em `auth.role()`, que lê a GUC do JWT — não no papel real da sessão. O caminho legítimo é serviço/worker via `service_role`, e a GUC não é escrita pelo cliente pelo PostgREST; mas o desenho ainda depende de uma GUC e não de `current_user` (o padrão que o próprio #1267 adotou nos dois guards). Não é furo demonstrado — é inconsistência de padrão.

---

## ATAQUE 2 — "O padrão fail-open `COALESCE(auth.role(` se repete em ~24 migrations que não são Multiplix, com ~63 ocorrências no repo"

**Comandos**
```
git grep -c  'COALESCE(auth\.role(' origin/main -- 'supabase/migrations/*.sql'   # case-sensitive
git grep -o  'COALESCE(auth\.role(' origin/main -- 'supabase/migrations/*.sql' | wc -l
git grep -l  'COALESCE(auth\.role(' origin/main -- 'supabase/migrations/*.sql' | grep -vi multiplix | wc -l
git grep -o -i 'coalesce(auth\.role(' origin/main -- 'supabase/migrations/*.sql' | wc -l
```
**Saída crua**

| métrica | valor real (origin/main) |
|---|---|
| `COALESCE(auth.role(` **case-sensitive**, migrations | **32 arquivos / 65 ocorrências** |
| idem, excluindo arquivos com `multiplix` no nome | **24 arquivos / 44 ocorrências** |
| `coalesce(auth.role(` case-insensitive, migrations | 40 arquivos / 77 ocorrências |
| idem, não-Multiplix | 32 arquivos / 56 ocorrências |

**Classificação dos predicados (leitura de cada ocorrência + contexto, e confronto com o catálogo vivo):**

- **FAIL-CLOSE (ruído para a alegação de "fail-open")** — a forma dominante, 39 das 44 ocorrências não-Multiplix:
  - `IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'service_role_required'` — GUC ausente ⇒ `'' <> 'service_role'` ⇒ **RAISE**.
  - `IF COALESCE(auth.role(), '') <> 'authenticated' OR auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication_required'` — idem, **RAISE**.
  - `coalesce(auth.role(), session_user) IN ('service_role','postgres','supabase_admin')` (clear_login_attempts, is_privileged_contact_caller) — fallback explícito p/ `session_user`.
  - `COALESCE(auth.role(),'') <> 'service_role' AND COALESCE(is_admin_or_supervisor(auth.uid()),false) IS NOT TRUE THEN RAISE` (CRM outbox) — **RAISE**.
- **FAIL-OPEN REAL (texto de migration)** — a forma `... <> 'authenticated' THEN RETURN ...` aparece em **5 ocorrências não-Multiplix, em 5 arquivos, todas do Talk X**:
  `20260911140000_harden_talkx_campaign_state_transitions.sql:107`, `20260911160000_...:13`,
  `20260911190000_...:13`, `20260911200000_...:66`, `20260930180000_talkx_update_campaign_limits_rpc.sql:20`.
  (+ a mesma forma em `20260929590000_multiplix_mutability_guard.sql:27/108`, já substituída por `20260930300000`.)
  Mais 2 ocorrências de restrição-condicional (`= 'authenticated' AND … THEN RAISE`) em `20260911140000:147` e `20260911160000:78` — inofensivas quando a GUC existe; desaparecem sem a GUC.
- **Catálogo VIVO (o que importa): sobram exatamente 2 funções fail-open**, ambas triggers irmãs dos guards corrigidos:
  - `enforce_talkx_campaign_mutability` → `IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN COALESCE(NEW, OLD); END IF;` — **fail-open literal**.
  - `enforce_talkx_recipient_snapshot_mutability` → `IF COALESCE(auth.role(), '') = 'authenticated' AND current_setting('app.talkx_recipient_snapshot_write',true) IS DISTINCT FROM 'on' THEN RAISE …` — sem a GUC a restrição **desaparece** (fail-open).

**Veredito: PARCIAL/REFUTADA.**
- "~24 migrations que não são Multiplix" — **reproduz** (24 é exatamente o nº de arquivos não-Multiplix, padrão case-sensitive).
- "~63 ocorrências **em migrations que não são Multiplix**" — **ERRADO**: o valor é **44**. Os ~63–65 são o **total incluindo as migrations Multiplix** (65 hoje). A frase mistura dois escopos e infla o pé não-Multiplix em ~19.
- "o mesmo padrão fail-open" — **impreciso para 39 das 44 ocorrências**, que são FAIL-CLOSE (`RAISE 'service_role_required'/'authentication_required'`).
- **GAP REAL:** 5 arquivos / 5 ocorrências de fail-open (todos Talk X); **vivo = 2 funções** (`enforce_talkx_campaign_mutability`, `enforce_talkx_recipient_snapshot_mutability`). **RUÍDO:** as outras ~39.

👉 Publique: *"o idioma `COALESCE(auth.role(` aparece em 44 ocorrências / 24 migrations não-Multiplix, mas **apenas 2 funções vivas (Talk X) são realmente fail-open**; o resto é `RAISE` (fail-close)"*.

---

## ATAQUE 3 — "O ledger e o repo estão coerentes: a migration 20260930300000 está aplicada e o arquivo está em origin/main"

**Comandos**
```
git ls-tree -r --name-only origin/main -- supabase/migrations        # 701 arquivos
python3 zapp_db.py "SELECT version,name FROM supabase_migrations.schema_migrations
                    WHERE version>='20260930240000' ORDER BY version"
```
**Saída crua**

```
LEDGER >=20260930240000 : 20260930260000 team_reaction_membership_guard
                          20260930280000 team_rpc_ambiguity_and_tcm_recursion
                          20260930290000 talk_me_queue_claim
                          20260930300000 multiplix_guards_fail_closed
                          20260930310000 harden_talk_me_authorization_and_groups
REPO   >=20260930240000 : 20260930240000 cron_secret_dedicado_l5
                          20260930250000 reschedule_cron_secrets_l5
                          20260930260000 20260930280000 20260930290000
                          20260930300000 20260930310000
```
Comparação programática:
- **SO NO REPO (fora do ledger):** `20260930240000_cron_secret_dedicado_l5.sql`, `20260930250000_reschedule_cron_secrets_l5.sql`
- **SO NO LEDGER (sem arquivo no repo):** *(nenhuma)*
- `20260930300000`: ledger **True** / arquivo no repo **True**.

Atribuição dos pendentes (`git log --oneline origin/main -- <arquivo>`):
```
20260930240000_cron_secret_dedicado_l5.sql  -> 33be6b98 fix(seguranca): da credencial dedicada ao cron no lugar da anon key (#1306)
20260930250000_reschedule_cron_secrets_l5.sql -> 33be6b98 (mesmo PR #1306)
```
Ambas são declaradas no próprio cabeçalho como **classe contrato / `PENDENTE_POS_MERGE`** ("só pode rodar DEPOIS do deploy das edges"). Corroboração no canônico: `cron.job` **ainda** autentica com `vault zapp_anon_key` nos jobs 4 (`gmail-incremental-sync`), 8 (`avatars-refresh`) e 12 (`connection-health-check`) — o reagendamento de `20260930250000` **não foi aplicado**.

**Veredito: PARCIAL.**
- A afirmação pontual sobre `20260930300000` → **CONFIRMADA** (ledger e repo, ambos True).
- A afirmação geral "**ledger e repo estão coerentes**" → **REFUTADA** para `>= 20260930240000`: há **2 migrations em `origin/main` que não estão no ledger** (`20260930240000`, `20260930250000`), do PR **#1306**. Não há pendência no sentido inverso.
- Ressalva honesta: essas 2 são pendentes *por desenho* (contrato pós-deploy). Mas então o correto é **nomeá-las**, não afirmar coerência plena.

---

## ATAQUE 4 — "O único username em cron.job é postgres"

**Comando**
```
python3 zapp_db.py "SELECT jobid,jobname,username,schedule FROM cron.job ORDER BY jobid"
```
**Saída crua** — 11 jobs, `row_count=11`:

| jobid | jobname | username | schedule |
|---|---|---|---|
| 1 | cleanup-link-preview-cache | postgres | `0 3 * * *` |
| 4 | gmail-incremental-sync | postgres | `*/5 * * * *` |
| 5 | vacuum-messages-post-expurgo | postgres | `0 3 2 9 *` |
| 6 | vacuum-contacts-daily | postgres | `30 3 * * *` |
| 8 | avatars-refresh | postgres | `0 * * * *` |
| 9 | cleanup-edge-rate-limits | postgres | `*/15 * * * *` |
| 11 | talkx-scheduler-1min | postgres | `* * * * *` |
| 12 | connection-health-check | postgres | `*/5 * * * *` |
| 13 | expire-stale-agent-presence | postgres | `*/2 * * * *` |
| 15 | multiplix-send-trigger | postgres | `*/2 * * * *` |
| 16 | tasks-notify-due | postgres | `* * * * *` |

**Veredito: CONFIRMADA.** Nenhum job com `username <> 'postgres'`. (Observação lateral que **corrige** um número relacionado do PR #1314: os jobs 4, 8 e 12 **ainda usam a anon key** — ver Ataque 3.)

---

## ATAQUE 5 — "Nenhum chamador de get_team_messages_page existe em src/, supabase/functions/ ou scripts/"

**Comandos**
```
git grep -n 'get_team_messages_page' origin/main
git grep -n 'messages_page' origin/main -- src supabase/functions
git grep -n "rpc('get_team" origin/main -- src
```
**Saída crua (o que existe de verdade)**
- `src/integrations/supabase/types.ts:9926` → `get_team_messages_page: {` — **tipo gerado**, não chamada.
- `src/` (código de app): **nenhuma** chamada (`messages_page` em `src` só aparece em `types.ts`).
- `supabase/functions/`: **nenhuma** ocorrência.
- `scripts/db-audit/team-chat-rpc-ambiguity.test.sh` (linhas 149, 188-189, 232-234, 243, 278-313, 331): **define e chama** `public.get_team_messages_page(...)` — em container descartável, é **harness de teste**, não chamador de produção. Não há chamada dinâmica/RPC por nome variável em `src/` (as RPCs `get_team*` chamadas são `get_team_profiles`, `get_team_conversation_previews`, `get_team_unread_counts`).

**Veredito: PARCIAL.**
- Núcleo da alegação (**nenhum chamador de app**) → **CONFIRMADA**: zero em `src/` e `supabase/functions/`.
- Como **escrito** ("nem em `scripts/`") → **REFUTADA**: `scripts/db-audit/team-chat-rpc-ambiguity.test.sh` chama a RPC (é o único call site fora de `src/`).
👉 Reescreva: *"nenhum chamador de aplicação; só o harness `scripts/db-audit/team-chat-rpc-ambiguity.test.sh` a exercita"*.

---

## ATAQUE 6 — "A policy de UPDATE em profiles impede auto-promoção a admin"

**Comandos**
```
python3 zapp_db.py "SELECT policyname,permissive,roles::text,cmd,qual,with_check FROM pg_policies WHERE tablename='profiles'"
python3 zapp_db.py "SELECT tgname,pg_get_triggerdef(t.oid) FROM pg_trigger ... WHERE relname='profiles'"
python3 zapp_db.py "SELECT ... FROM pg_policies WHERE tablename='user_roles'"
```
**Saída crua (essencial)**

Policies de UPDATE em `public.profiles` (todas `roles={authenticated}`):
- `Admins can update any profile` — **PERMISSIVE**, USING/WITH CHECK `is_admin_or_supervisor(auth.uid())`.
- `Users can update own profile` — **PERMISSIVE**, USING/WITH CHECK `auth.uid() = user_id`.
- `Block sensitive field changes by non-admins` — **RESTRICTIVE**, WITH CHECK
  `is_admin_or_supervisor(auth.uid()) OR (role = (SELECT p.role FROM profiles p WHERE p.user_id=auth.uid()) AND access_level = (…) AND permissions = (…) AND is_active = (…))`.

Defesa em profundidade confirmada no canônico: trigger `prevent_privilege_escalation BEFORE UPDATE ON public.profiles` → `prevent_profile_privilege_escalation()` (SECURITY DEFINER) que faz `RAISE 'Only administrators can modify role, permissions, or access_level'` quando `role/permissions/access_level` mudam e `NOT is_admin(auth.uid())` (bypass só com `app.internal_role_sync='true'`).
E o caminho alternativo está fechado: `user_roles` só tem policy de escrita para admin (`has_role(auth.uid(),'admin')`), então o trigger `sync_profile_role` não é auto-serviçável.

**Veredito: CONFIRMADA (por raciocínio sobre o predicado).**
Uma policy **RESTRICTIVE** é **AND**-ada ao OR das permissivas: o UPDATE só passa se `auth.uid()=user_id` **e** (admin **ou** `role`/`access_level`/`permissions`/`is_active` **inalterados**). Não-admin **não** sobe `role` (a subquery lê o valor corrente da própria linha). Sem GUC ausente em jogo aqui.
**Limite de prova:** não executei exploit (escrita no banco é proibida nesta tarefa). Se quiser prova empírica, precisa de um bloco de teste no harness (SET ROLE authenticated + UPDATE role) — hoje **não vi esse teste** para esta policy.

---

## EXTRA — Varredura das SECURITY DEFINER que escrevem em `team_*`

**Comando**
```
python3 zapp_db.py "SELECT proname, chk('is_team_conversation_member'), chk('team_conversation_members'),
                    w_insert('insert into public.team_'), w_update(...), w_delete(...)
                    FROM pg_proc WHERE prosecdef AND prosrc ~* '(insert|update|delete ... public\.team_)'"
```
**Resultado: 9 funções SECURITY DEFINER escrevem em tabelas `team_*`.** Nenhuma usa o helper `is_team_conversation_member` (todas fazem `EXISTS/JOIN` inline em `team_conversation_members`).

| função | escrita | checa vínculo de time? | veredito |
|---|---|---|---|
| `bump_conversation_updated_at` | UPDATE `team_conversations` | **não** | **OK por desenho** — é trigger de `team_messages` (roda sob RLS de INSERT da tabela-mãe); não é RPC chamável. |
| `find_or_create_direct_conversation` | INSERT `team_conversations`, `team_conversation_members` | vínculo **criado** pela própria função | **BAIXO** — cria DM com qualquer `other_profile_id` (não valida mesmo tenant/org). Sem check de vínculo prévio porque é o criador do vínculo. |
| `leave_team_group` | DELETE/UPDATE `team_conversation_members`, DELETE `team_conversations` | **sim** (`v_role IS NULL → RAISE 'not_a_member'`) | OK |
| `mark_team_conversation_read` | INSERT `team_message_receipts`, UPDATE `team_conversation_members` | **NÃO** | **ALTO — mesmo defeito da classe** (detalhe abaixo) |
| `remove_team_member` | DELETE `team_conversation_members` | **sim** (`actor_not_a_member` + checagem de papel owner) | OK |
| `set_team_member_pref` | UPDATE `team_conversation_members` | **sim, implícito** (`WHERE profile_id=v_profile_id`; `IF NOT FOUND → RAISE 'not_member'`) | OK |
| `set_team_member_role` | UPDATE `team_conversation_members` | **sim** (`is_admin_or_supervisor` **ou** caller é `member_role='owner'` da conversa) | OK |
| `toggle_team_reaction` | INSERT/DELETE `team_message_reactions` | **sim** (#1265: vínculo tirado da própria mensagem) | OK |
| `transfer_team_conversation_department` | UPDATE `team_conversations` | **NÃO checa vínculo** — só `role IN ('admin','supervisor')` global | **MÉDIO** (detalhe abaixo) |

**Detalhes dos 2 que merecem atenção**

1. `mark_team_conversation_read` — corpo vivo (canônico):
   ```sql
   IF v_profile_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
   INSERT INTO public.team_message_receipts(message_id, profile_id, status, delivered_at, read_at)
   SELECT m.id, v_profile_id, 'read', v_now, v_now
     FROM public.team_messages m
    WHERE m.conversation_id = p_conversation_id
      AND m.sender_id <> v_profile_id
      AND NOT EXISTS (...);
   UPDATE public.team_conversation_members SET last_read_at = v_now
    WHERE conversation_id = p_conversation_id AND profile_id = v_profile_id;
   ```
   **Não existe `EXISTS (… team_conversation_members WHERE conversation_id=p_conversation_id AND profile_id=v_profile_id)`.** Como a função é SECURITY DEFINER, a RLS de `team_message_receipts`/`team_messages` **não** protege: qualquer `authenticated` marca como **lidas** as mensagens de **qualquer** `p_conversation_id` — inclusive times de que não é membro — gravando recibos de leitura com a própria identidade. (O UPDATE de `last_read_at` fica restrito à própria linha, sem escrita cross-user; o dano é a forja de recibos / contadores de "lido" do remetente.)
2. `transfer_team_conversation_department` — exige `v_profile_id` não nulo e `role IN ('admin','supervisor')` **global**, e conversa `type='department'`; **não** valida que o chamador seja membro da conversa **nem** que `p_to_department_id` exista/faça sentido. Risco contido pelo papel global, mas foge do padrão "papel real **+** vínculo" que o #1265/#1267 estabeleceram.

**Conclusão do EXTRA:** a classe **tem outra ocorrência viva e não corrigida** — `mark_team_conversation_read` (ALTO), além de `transfer_team_conversation_department` (MÉDIO, defendido só por papel global). As outras 6 estão adequadas (ou são trigger, sem superfície RPC).

---

## LISTA DE GAPS (severidade + o que faltaria para provar)

| # | Gap | Severidade | O que faltaria para fechar/provar |
|---|---|---|---|
| G1 | `mark_team_conversation_read` (SECURITY DEFINER) escreve recibo de leitura sem checar vínculo de time | **ALTA** | Adicionar guard `EXISTS(team_conversation_members WHERE conversation_id=p_conversation_id AND profile_id=v_profile_id)`; teste no harness `team-chat-rpc-ambiguity.test.sh` provando `not_member` (hoje ausente). |
| G2 | Triggers irmãos do Talk X **seguem fail-open**: `enforce_talkx_campaign_mutability` (=fixado na Multiplix) e `enforce_talkx_recipient_snapshot_mutability` (restrição some sem GUC) | **ALTA** | Mesma correção de `20260930300000` (papel real primeiro, erro depois) + bloco fail-open/fail-closed no `multiplix-rls.test.sh`/Talk X. |
| G3 | `transfer_team_conversation_department` sem checagem de vínculo (só papel global admin/supervisor) | **MÉDIA** | Definir contrato (vínculo obrigatório?) e testar. |
| G4 | Migrations `20260930240000` e `20260930250000` (#1306) em `origin/main` **fora do ledger**; cron 4/8/12 **ainda usam a anon key** | **MÉDIA** | Aplicar pós-deploy das edges e conferir `cron.job.command` sem `zapp_anon_key`. Hoje: a alegação "ledger×repo coerentes" e o L5 ficam **abertos**. |
| G5 | 13 funções Multiplix "fail-close" confiam em `auth.role()` (GUC), não no papel real — padrão divergente do #1267 | **BAIXA** | Padronizar em `current_user`/`session_user` ou documentar a exceção. |
| G6 | Sem cobertura de teste para a trava de auto-promoção de `profiles` (policy RESTRICTIVE + trigger) | **MÉDIA** | Bloco de teste `SET ROLE authenticated; UPDATE profiles SET role='admin'` esperando erro. Hoje não existe em `scripts/db-audit`. |
| G7 | Cobertura de `anon`/`service_role` nas funções do dia não é sistemática (depende do harness; só algumas RPCs do team chat aparecem com ACL checada) | **MÉDIA** | Varredura por catálogo (`has_function_privilege('anon', fn, 'EXECUTE')`) para toda função criada no dia + asserção no CI. |
| G8 | Próprio número do PR #1314 ("17 funções / 15 fail-close") é inconsistente com o catálogo (15 total) | **BAIXA (reputacional)** | Corrigir o corpo do PR para 15 (13 fail-close + 2 guards) antes de publicar. |
| G9 | Números do Ataque 2 ("~63 ocorrências" não-Multiplix) misturam escopo | **BAIXA (reputacional)** | Publicar 44 (ou 24 arquivos) e separar "fail-open real = 2 funções vivas". |

### Falhas de infraestrutura que atrapalharam esta auditoria
1. **CWD padrão do terminal quebrado.** Toda chamada `terminal` sem `workdir` explícito falhava com
   `bash: line 4: cd: \wsl.localhost\Ubuntu-24.04\home\joaquim_ataides\projetos: No such file or directory` (exit 126), antes de executar o comando. Contornado passando `workdir=/…` em **todas** as chamadas. Se outro agente da onda não souber disso, ele "não consegue rodar nada" e pode reportar NÃO VERIFICÁVEL por engano.
2. **Guard bloqueia redirecionamento com `cd` no repo de referência.** `cd ~/projetos/Zapp_Web_V2 && … > /sandbox/arquivo` disparou `HERMES-GUARD: escrever em ~/projetos/<Projeto> é proibido`, mesmo com o destino fora do repo. Contornado rodando com `workdir` no sandbox e `git -C <repo>`.
3. **Gateway MCP trunca a resposta em 4000 bytes.** `db_query` com `string_agg`/`prosrc` grandes volta cortado e o JSON não parseia; foi preciso quebrar em consultas menores (por função). Não é bloqueio, mas custa rodadas.

### O que NÃO consegui provar (honesto)
- **Exploit real** da auto-promoção (Ataque 6): raciocinei sobre o predicado; a prova exigiria escrita no banco, proibida aqui.
- **"Nenhum chamador" com prova de ausência global**: não há chamada dinâmica por nome em `src/`, mas não é possível provar ausência de chamada por *string montada em runtime* sem executar o app.
- A contagem "17" do PR não é reproduzível por nenhuma definição que eu testei (nome, migrations do módulo, sobrecargas); não achei a origem do número.
