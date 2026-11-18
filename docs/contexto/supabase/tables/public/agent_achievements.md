# public.agent_achievements

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `achievement_type` | `text` | não |  |  |  |
| 4 | `achievement_name` | `text` | não |  |  |  |
| 5 | `achievement_description` | `text` | sim |  |  |  |
| 6 | `xp_earned` | `integer` | não | `0` |  |  |
| 7 | `earned_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_achievements_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| agent_achievements_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_achievements_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX agent_achievements_pkey ON public.agent_achievements USING btree (id)` |
| idx_agent_achievements_earned_at | btree | earned_at | não | sim |  | `CREATE INDEX idx_agent_achievements_earned_at ON public.agent_achievements USING btree (earned_at)` |
| idx_agent_achievements_profile | btree | profile_id | não | sim |  | `CREATE INDEX idx_agent_achievements_profile ON public.agent_achievements USING btree (profile_id)` |
| ux_agent_achievements_one_time | btree | profile_id, achievement_type | sim | sim | `(achievement_type <> ALL (ARRAY['daily_goal'::text, 'streak'::text, 'message_milestone'::text, 'resolution'::text, 'resolution_milestone'::text]))` | `CREATE UNIQUE INDEX ux_agent_achievements_one_time ON public.agent_achievements USING btree (profile_id, achievement_type) WHERE (achievement_type <> ALL (ARRAY['daily_goal'::text, 'streak'::text, 'message_milestone'::text, 'resolution'::text, 'resolution_milestone'::text]))` |


## Policies (RLS)

### `Only admins can insert achievements directly`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Users can view own or admin all achievements`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
