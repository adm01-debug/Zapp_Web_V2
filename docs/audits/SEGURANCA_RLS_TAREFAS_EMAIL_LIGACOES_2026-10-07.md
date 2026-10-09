# Auditoria de segurança (LEITURA) — RLS e GRANTs de tarefas, notas, propostas, e-mail, ligações e analytics

- **Data:** 2026-10-07
- **Autor:** worker (banco/SQL) — revisão **somente leitura**
- **Cartão:** Y25 / plano `docs/plans/PLANO_QUALIDADE_PARALELA_AGENTES_29_CARTOES_2026-10-07.md`
- **Escopo:** policies, RLS e grants de `conversation_tasks`, `contact_notes`, `sales_deals`, `deal_activities`,
  `email_threads`, `email_messages`, `gmail_accounts`, `calls`, `conversation_analyses`, `user_settings`.
- **Nada foi alterado.** Não houve DDL/DML, migration, nem acesso a banco de produção. As "correções sugeridas"
  são propostas — não aplicadas.

## URGENTE (P0/P1)

Um achado **P0** (escrita indevida explorável por usuário autenticado, conforme o critério literal do cartão) e nenhum
achado P1:

- **SEC-RLS_TAREFAS_EMAIL_LIGACOES-01 (P0 — URGENTE)** — `deal_activities`: policy de INSERT não amarra o
  `deal_id`, então **qualquer usuário autenticado grava atividade (trilha de auditoria de negócio) em negócio de
  outro agente/equipe**. É escrita indevida por usuário autenticado (o critério literal de P0 do cartão para
  escrita). Observação de impacto: afeta integridade de trilha, não vazamento nem destruição, mas a severidade é
  **P0** pela definição do cartão.

## Resumo dos achados

| ID | Sev | Tabela(s) | Assunto |
|----|-----|-----------|---------|
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-01 | **P0** | deal_activities, calls, conversation_tasks | INSERT grava registro de histórico apontando para recurso (`deal_id`/`contact_id`) fora do escopo do chamador |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-02 | P2 | gmail_accounts | Colunas de token OAuth (`*_encrypted`) legíveis pelo cliente autenticado via tabela base |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-03 | P3 | 8 das 10 tabelas | Grants residuais de `anon` (ALL/TABLE incl. TRUNCATE) e de `authenticated`/`service_role` (TRUNCATE/TRIGGER/REFERENCES/MAINTAIN) |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-04 | P3 | gmail_accounts | Policies "Block authenticated gmail …" são **permissivas** com `false` (não `AS RESTRICTIVE`) |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-05 | P3 | todas as 10 | Privilégio admin/supervisor é **global** — nenhuma policy é escopada por departamento/equipe |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-06 | P3 | email_threads, email_messages | Ramo `OR is_admin_or_supervisor(...)` é **inerte** (a subconsulta em `gmail_accounts` roda sob a RLS do chamador) — divergência entre a intenção do texto e o efeito real |
| SEC-RLS_TAREFAS_EMAIL_LIGACOES-07 | P3 | helpers usados pelas policies | `SET search_path` de SECURITY DEFINER sem `pg_temp` |

## Metodologia (como isto foi verificado)

1. **Estado efetivo, não histórico.** As migrations reescrevem policies várias vezes (DROP + CREATE). O estado
   corrente de policies/RLS/grants foi lido de `supabase/schema-manifest.json` (snapshot `generated_at`
   `2026-10-05T21:05:03Z`, gerado por `scripts/db-audit/manifest.sql`) — é a fonte autoritativa da lista de
   policies por tabela, do flag de RLS e de `relation_grants`/`column_grants`.
2. **Texto de cada policy.** Para cada uma das ~30 policies correntes das 10 tabelas, localizei a migration que a
   criou (`rg -n "POLICY \"<nome>\"|POLICY <nome>" supabase/migrations`) e li o SQL (USING/WITH CHECK/TO).
3. **Migrations posteriores ao snapshot.** Conferi as 5 migrations mais novas (`>= 20261005`) para descartar
   mudança de policy/coluna nas 10 tabelas: só há mudanças aditivas de coluna em `user_settings`
   (`20261006155916`) e inserts em `conversation_analyses` por RPC (`20261006160117`) — nenhuma altera as policies.
4. **RLS efetiva nos grants.** Cruzei `relation_grants` (tabela x papel x verbo) com as policies para saber se o
   grant é alcançável. `anon` tem grant em 8 tabelas mas **nenhuma policy é `TO anon`/`TO PUBLIC`** — logo a RLS
   nega (0 linhas / erro). `column_grants` não tem nenhuma entrada para as 10 tabelas (não há REVOKE de coluna).
5. **Semântica do Postgres.** A afirmação do achado -06 (subconsulta em policy avalia sob a RLS do chamador) foi
   **provada em sandbox** com um Postgres 17 descartável, schema mínimo e papel real (`SET ROLE`), sem tocar
   nenhum objeto do Zapp Web V2. Ver o SQL em `.tmp/rls_subquery_semantics.sql` (não versionado).

## Achados

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-01 — P0 — INSERT grava histórico apontando para recurso de outro escopo

**Evidência.** A policy de INSERT de `deal_activities` valida só a autoria, nunca o `deal_id`:

`supabase/migrations/20260317222442_f3acf46c-cd94-44ae-9757-1ac21e2aeefa.sql:124-130`
```sql
DROP POLICY IF EXISTS "Authenticated users can manage deal activities" ON public.deal_activities;
CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    performed_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR public.is_admin_or_supervisor(auth.uid())
  );
```
`deal_activities.deal_id` é `NOT NULL REFERENCES sales_deals(id)` e **não há gatilho** em `deal_activities`
(`20260315203210_e3fc9cb2-…sql:33-40`). Não existe policy de UPDATE/DELETE → o cliente não pode corrigir a linha.
Mesma família (o mesmo padrão de "valida o autor, não o alvo"), confirmada por `git grep`:
- `calls` — `20260317222534_cc94813a-…sql:94` (`WITH CHECK ( agent_id IN (…) OR is_admin_or_supervisor )`):
  `contact_id` livre; `supabase/migrations/20260926800000_calls_telefonia_v2.sql:296-368` (`upsert_my_call`)
  também aceita `p_contact_id` arbitrário.
- `conversation_tasks` — `20260928140000_tasks_unify_reminders_kanban.sql:139-143` (`WITH CHECK` só sobre
  `created_by`): o gatilho `trg_prevent_conversation_task_field_forgery`
  (`20260924110946_…sql:48-56`) é `BEFORE UPDATE` apenas — o INSERT fica sem checagem de `contact_id`.

**Cenário de exploração (≤3 passos).**
1. Agente comum (não admin) obtém o `id` de um negócio da equipe B (o id circula em exports/logs/RPCs legítimos;
   não é preciso poder **ler** o negócio).
2. `POST /rest/v1/deal_activities` com `{ "deal_id": "<id de B>", "activity_type": "note",
   "description": "…", "performed_by": "<id do perfil próprio>" }`.
3. HTTP 201: a linha entra na trilha do negócio de B (visível ao dono de B e a admins) e não pode ser removida
   pelo cliente. Idem `calls.contact_id` e `conversation_tasks.contact_id` com o mesmo passo.

**Correção sugerida (NÃO aplicada).**
```sql
-- deal_activities: só grava em negócio do próprio agente (ou admin/supervisor)
DROP POLICY "Authenticated can insert deal activities" ON public.deal_activities;
CREATE POLICY "Authenticated can insert deal activities" ON public.deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin_or_supervisor(auth.uid())
    OR (
      performed_by = public.get_profile_id_for_user(auth.uid())
      AND deal_id IN (
        SELECT sd.id FROM public.sales_deals sd
        WHERE sd.assigned_to = public.get_profile_id_for_user(auth.uid())
      )
    )
  );

-- calls / conversation_tasks: mesmo predicado de contato usado em contact_notes
-- (is_contact_visible_to_user), via WITH CHECK ou gatilho BEFORE INSERT OR UPDATE.
```
**Esforço:** baixo (1 migration + prova com papel real). Migrar só depois de conferir consumidores legítimos
que hoje gravam `deal_activities`/`calls.contact_id` (o filtro precisa usar a MESMA noção de visibilidade de
contato do resto do sistema, senão quebra o fluxo legítimo).

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-02 — P2 — tokens Gmail (`*_encrypted`) chegam ao cliente

**Evidência.** A `SELECT` de `gmail_accounts` libera a **linha inteira** do dono e os grants são de tabela
(não há REVOKE de coluna):

`supabase/migrations/20260412171141_a898bf78-…sql:2-6`
```sql
CREATE POLICY "Users can view their own gmail accounts"
ON public.gmail_accounts FOR SELECT TO authenticated
USING (user_id = auth.uid());
```
`supabase/schema-manifest.json` → `relation_grants` traz `r:public.gmail_accounts|authenticated|SELECT|grantor=postgres`
e `column_grants` não tem nenhuma entrada de `gmail_accounts` (nenhuma coluna foi revogada). As colunas
`access_token_encrypted`/`refresh_token_encrypted` existem em `supabase/schema-catalog.json` (colunas de
`gmail_accounts`). Contraste com a intenção registrada no próprio repo: a view `gmail_accounts_safe`
(`supabase/migrations/20260411110341_…sql:4-8`, `security_invoker=on`) existe só para omitir essas colunas, e
`get_gmail_tokens`/`store_gmail_tokens` estão `REVOKE … FROM authenticated`
(`20260827210100_gmail_token_rpcs.sql:61-65`, comentário "o front NUNCA chama direto (tokens nao vao ao cliente)").

**Cenário de exploração (≤3 passos).**
1. Qualquer usuário autenticado faz `GET /rest/v1/gmail_accounts?select=access_token_encrypted,refresh_token_encrypted&user_id=eq.<seu uid>`.
2. Recebe o ciphertext (bytea em hex) das colunas de token.
3. Hoje o ciphertext é inútil sem a chave do Vault (que nunca sai do banco) — **não é** vazamento de credencial
   utilizável. O risco é a superfície: um segredo de longa duração (refresh token OAuth) sai da infra e chega ao
   navegador, contrariando a intenção documentada.

**Correção sugerida (NÃO aplicada).**
```sql
REVOKE SELECT (access_token_encrypted, refresh_token_encrypted)
  ON public.gmail_accounts FROM anon, authenticated;
-- e garantir que todo cliente use gmail_accounts_safe / get_own_gmail_accounts()
-- (com o REVOKE, um `select=*` do PostgREST passa a falhar por permissão).
```
**Esforço:** baixo (1 REVOKE + varredura de consumidores). Já verificado em `src/`: o front usa
`supabase.rpc('get_own_gmail_accounts')` (`src/hooks/integrations/useGmail.ts:45`,
`src/components/admin/GmailWebhookMonitor.tsx:48`) — não lê a tabela base.

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-03 — P3 — grants residuais de `anon`/`authenticated`

**Evidência.** Em 8 das 10 tabelas (`calls`, `conversation_tasks`, `deal_activities`, `email_messages`,
`email_threads`, `gmail_accounts`, `sales_deals`, `user_settings`) o `anon` ainda tem `SELECT/INSERT/UPDATE/DELETE`
**e** `TRUNCATE/TRIGGER/REFERENCES/MAINTAIN`; o `authenticated`/`service_role` ainda têm
`TRUNCATE/TRIGGER/REFERENCES/MAINTAIN`. Fonte: `supabase/schema-manifest.json` → `relation_grants`
(ex.: `r:public.conversation_tasks|anon|TRUNCATE|grantor=postgres`) e o baseline
`scripts/db-audit/grants-baseline.json` (`anon_table_select` inclui as 8). `contact_notes` e
`conversation_analyses` já foram limpas e servem de padrão:
`20260909200000_harden_inbox_contact_authorization.sql:128-132` e `20260930100000_…sql:46`.

**Exploração.** Nenhuma pelo PostgREST: `anon` não tem policy em nenhuma das 10 (RLS nega), e `TRUNCATE` não é
exposto pela API REST. É dívida de menor privilégio (defesa em profundidade) — vale fechar pelo mesmo motivo que
as outras duas tabelas foram fechadas.

**Correção sugerida (NÃO aplicada).**
```sql
REVOKE ALL PRIVILEGES ON TABLE public.calls, public.conversation_tasks, public.deal_activities,
  public.email_messages, public.email_threads, public.gmail_accounts, public.sales_deals, public.user_settings
  FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE <as mesmas> FROM authenticated, service_role;
```
**Esforço:** baixo.

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-04 — P3 — "Block authenticated gmail …" é permissiva com `false`

**Evidência.** `supabase/migrations/20260404174826_2a7cc468-…sql:3-19` cria três policies `TO authenticated`
com `WITH CHECK (false)` / `USING (false)` e nomes "Block …". Hoje **funcionam** (o Postgres exige ≥1 policy
permissiva satisfeita, e não existe outra permissiva de INSERT/UPDATE/DELETE em `gmail_accounts`), mas como são
**permissivas** elas se somam por OR: no dia em que uma policy permissiva nova de DML entrar, o `false` deixa de
bloquear.

**Correção sugerida (NÃO aplicada).** Recriá-las `AS RESTRICTIVE` (bloqueio verdadeiro, que não é anulado por OR).
**Esforço:** baixo.

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-05 — P3 — admin/supervisor sem escopo de departamento/equipe

**Evidência.** Todas as dez tabelas decidem visão ampla por `public.is_admin_or_supervisor(auth.uid())`
(`supabase/migrations/20251215025014_…sql:31-38` — só olha `user_roles`). Nenhuma policy das 10 tabelas
referencia `departments`, `queue_members` ou `team_conversation_members` (confirmado por `git grep` sobre
`supabase/migrations`). Ou seja: um supervisor lê/escreve dados de qualquer departamento/equipe.

**Exploração.** Não é falha isolada, é decisão de autorização (amplitude do papel). Fica registrado porque o
cartão pede explicitamente o recorte "outro departamento/equipe" e porque `is_admin_or_supervisor` é o único
predicado de amplitude do sistema — se o modelo de negócio exige recorte por departamento, hoje ele não existe.

**Correção sugerida (NÃO aplicada).** Se houver recorte por departamento: trocar o ramo global por um helper
`can_view_department(auth.uid(), <depto do recurso>)`. Requer decisão de produto — não é só SQL.
**Esforço:** alto (mudança de modelo).

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-06 — P3 — ramo admin inerte em `email_threads`/`email_messages`

**Evidência.** `supabase/migrations/20260403105341_f342fbf7-…sql:69-74, 83-95, 135-140, 149-154`:
```sql
CREATE POLICY "Users can view threads of own accounts" ON public.email_threads FOR SELECT
TO authenticated USING (EXISTS (
  SELECT 1 FROM public.gmail_accounts ga
  WHERE ga.id = gmail_account_id
    AND (ga.user_id = auth.uid() OR public.is_admin_or_supervisor(auth.uid()))));
```
A subconsulta em `gmail_accounts` roda sob a **RLS do chamador**, e a única policy de SELECT dessa tabela é
`USING (user_id = auth.uid())` (`20260412171141_…sql:2-6`). Logo a linha da conta de terceiro é filtrada antes do
`EXISTS` e o ramo `OR is_admin_or_supervisor` nunca é alcançado para conta alheia.

**Prova (sandbox Postgres 17, schema mínimo, papel real via `SET ROLE`; nada do Zapp foi tocado):**
`.tmp/rls_subquery_semantics.sql`. Com RLS ligada na tabela pai, o papel com `is_admin=true` vê **só** a linha do
próprio dono (1 linha: `10`); desligando a RLS da tabela pai, o mesmo papel vê as duas (`10` e `20`).
Conclusão: **não é vazamento** — é over-restrição (o admin hoje não enxerga e-mail de outra conta, ao contrário do
que o texto da policy sugere). O achado existe para não deixar a divergência silenciosa.

**Correção sugerida (NÃO aplicada).** Se a intenção é mesmo o admin ver tudo, o predicado deve consultar a conta
sem depender da RLS do chamador — ex.: helper SECURITY DEFINER `owns_or_admins_gmail_account(uuid)` (idioma de
`get_profile_id_for_user`). Se a intenção é "só o dono", apagar o ramo morto e ajustar o comentário/nome.
**Esforço:** baixo.

### SEC-RLS_TAREFAS_EMAIL_LIGACOES-07 — P3 — `search_path` de SECURITY DEFINER sem `pg_temp`

**Evidência.** `supabase/migrations/20251215025014_fcc5bc79-…sql:31-38` (`is_admin_or_supervisor`) e
`supabase/migrations/20260828210000_get_own_gmail_accounts_filter_active.sql:27` (`get_own_gmail_accounts`) usam
`SET search_path TO 'public'`, sem `pg_temp` — diferente do padrão da casa (`SET search_path = public, pg_temp`,
ex.: `20260909200000_…sql:11,30,63`). Sem `pg_temp` no fim da lista, um objeto temporário de mesmo nome pode
sombrear um objeto de `public` em resolução não qualificada.

**Correção sugerida (NÃO aplicada).** `ALTER FUNCTION … SET search_path = public, pg_temp;`
**Esforço:** baixo.

## Verificado e SEM problema (cobertura)

Leitura por tabela (SELECT — nenhuma permite ler dado de outro usuário fora do escopo):
- **conversation_tasks** — `tasks_select_own`/`tasks_update_own`/`tasks_delete_own` = `created_by` próprio **ou**
  admin/supervisor; `tasks_insert_own` exige `created_by = current_profile_id()`
  (`20260928140000_…sql:131-163`). Nenhuma policy `TO anon`/`PUBLIC`. RLS ligada.
- **contact_notes** — as 4 policies são `TO authenticated` e passam por
  `is_contact_visible_to_user(contact_id, auth.uid())`; escrita exige `author_id = get_profile_id_for_user(auth.uid())`
  (`20260909200000_…sql:154-189`). `anon` revogado e `TRUNCATE/TRIGGER/REFERENCES/MAINTAIN` removidos. Gatilho
  torna `contact_id`/`author_id` imutáveis.
- **sales_deals** — SELECT = negócio atribuído a mim **ou** admin (`20260401001811_…sql:6-11`); UPDATE idem
  (`20260317222442_…sql:203-208`); DELETE só admin; o antigo `FOR ALL USING (true)` foi derrubado
  (`20260317222442_…sql:198`).
- **deal_activities** — SELECT escopado (atividades dos meus negócios ou que eu executei, `20260404155608_…sql:2-13`;
  ramo admin `20260318121108_…sql:43-45`); o antigo `USING (true)` foi derrubado. Só o INSERT tem o defeito -01.
  Sem policy de UPDATE/DELETE.
- **email_threads / email_messages** — há policy de SELECT/UPDATE/DELETE para o dono e **não** existe policy de
  INSERT (as de insert foram derrubadas em `20260829030000_drop_insert_policies_email.sql`). O resultado prático é
  dono-só (achado -06). Nenhuma policy `TO anon`.
- **gmail_accounts** — SELECT só do dono (`user_id = auth.uid()`); INSERT/UPDATE/DELETE bloqueados para
  `authenticated` (service_role grava) — `20260404174826_…sql:3-19`. Tokens cifrados no Vault e inservíveis sem a
  chave; `get_gmail_tokens`/`store_gmail_tokens`/`encrypt`/`decrypt` são service_role-only
  (`20260827210000_…sql:78-81`, `20260827210100_…sql:62-65`); a view `gmail_accounts_safe` é `security_invoker`.
- **calls** — SELECT = `agent_id` próprio **ou** admin (`20260317223223_…sql:78`); UPDATE exige `agent_id` próprio;
  **não** há policy de DELETE para o cliente. `search_my_calls`/`my_calls_kpi` são `SECURITY INVOKER` e decidem o
  escopo dentro do banco (`20260926800000_…sql:123-293`); `set_call_agent_notes` é DEFINER com guarda dono/admin.
- **conversation_analyses** — SELECT por visibilidade de contato (`20260930140000_…sql:28-32`); INSERT exige
  `analyzed_by` próprio **e** contato visível (`20260930100000_…sql:36-44`); `anon` revogado. Sem policy de
  UPDATE/DELETE (o cliente não edita/apaga análise).
- **user_settings** — SELECT/INSERT/UPDATE restritos a `user_id = auth.uid()`; sem policy de DELETE
  (`20260317222728_…sql:274-288`). Nenhuma coluna sensível (tema, sons, horários, TTS, thresholds).

Fora do conjunto, mas verificado porque toca o escopo:
- **`notify_due_tasks`** e **`dashboard_sentiment_alerts`** têm guarda interna de papel
  (`20260930141000_…sql:25-27`, `20260925194151_…sql:34`) — não são caminho de bypass.
- **`record_incoming_call_event`** (a única RPC anon-executável que gravava em `calls`/`notifications`) está
  fechada: `REVOKE … FROM PUBLIC, anon, authenticated` + `DROP` do overload morto + `ALTER DEFAULT PRIVILEGES`
  em `20261004172554_fecha_record_incoming_call_event.sql` (achado M-DB-02/R2-DB-001, já corrigido).
- **Nenhuma view** do schema consulta as 10 tabelas além de `gmail_accounts_safe` (que é `security_invoker`).
- **RLS ligada** nas dez tabelas (`supabase/schema-manifest.json` → `rls`), e nenhuma é `FORCE ROW LEVEL SECURITY`.

## Limites desta revisão

- Evidência é **estática** (arquivos do repositório: migrations, `schema-manifest.json`, `schema-catalog.json`,
  `grants-baseline.json`, `src/`), conforme as regras do cartão. Não houve reprodução contra o banco do projeto.
- O snapshot `schema-manifest.json` é de **2026-10-05**; conferi as migrations posteriores (até `20261006160117`) e
  nenhuma altera policy/RLS/grant das dez tabelas. Se entrar migration nova mexendo nessas policies, refazer a
  leitura do `relation_grants`/`policies` do snapshot.
- `recording_url` (gravações de chamada) está sob a mesma RLS de `calls` (dono/admin) e o bucket de gravação não
  existe (`20260926800000_…sql:109-114`), então não há exposição hoje; ao ligar a gravação, **é obrigatório** criar
  a policy de Storage junto (o cliente hoje busca a URL por Edge `get-call-recording`, não pelo campo).
- Não reproduzi o achado -01 contra o banco (o cartão proíbe aplicar qualquer coisa); a prova é o texto da policy
  + ausência de gatilho/coluna de escopo, o que basta para o vetor de INSERT.
