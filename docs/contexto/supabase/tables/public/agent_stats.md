# public.agent_stats

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `xp` | `bigint` | não | `0` |  |  |
| 4 | `level` | `integer` | não | `1` |  |  |
| 5 | `achievements_count` | `integer` | não | `0` |  |  |
| 6 | `messages_sent` | `bigint` | não | `0` |  |  |
| 7 | `messages_received` | `bigint` | não | `0` |  |  |
| 8 | `conversations_resolved` | `integer` | não | `0` |  |  |
| 9 | `avg_response_time_seconds` | `integer` | sim |  |  |  |
| 10 | `customer_satisfaction_score` | `numeric(3,2)` | sim | `0` |  |  |
| 11 | `current_streak` | `integer` | não | `0` |  |  |
| 12 | `best_streak` | `integer` | não | `0` |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 15 | `last_active_date` | `date` | sim |  |  | Ultimo dia (America/Sao_Paulo) com atividade do agente (mensagem enviada ou conversa encerrada). Base da sequencia current_streak em DIAS. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_stats_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| agent_stats_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| agent_stats_profile_id_key | UNIQUE | `UNIQUE (profile_id)` |  |  | sim |
| chk_level_min_one | CHECK | `CHECK (level >= 1)` |  |  | sim |
| chk_xp_non_negative | CHECK | `CHECK (xp >= 0)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_stats_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX agent_stats_pkey ON public.agent_stats USING btree (id)` |
| agent_stats_profile_id_key | btree | profile_id | sim | sim |  | `CREATE UNIQUE INDEX agent_stats_profile_id_key ON public.agent_stats USING btree (profile_id)` |
| idx_agent_stats_xp | btree | xp | não | sim |  | `CREATE INDEX idx_agent_stats_xp ON public.agent_stats USING btree (xp DESC)` |


## Policies (RLS)

### `Only admins can update agent stats`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can insert own stats`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(((profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid())) AND (is_admin_or_supervisor(auth.uid()) OR ((xp = 0) AND (level = 1) AND (achievements_count = 0))))` |

### `Users can view agent stats`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id IN ( SELECT p.id    FROM profiles p   WHERE (p.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| on_agent_stats_update_level | BEFORE | UPDATE | ROW | enabled | public.update_agent_level |
| update_agent_stats_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |
| update_level_on_xp_insert | BEFORE | INSERT | ROW | enabled | public.update_agent_level |


## Grants

_nenhum_
