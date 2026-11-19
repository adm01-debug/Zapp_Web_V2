# public.goals_configurations

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `profile_id` | `uuid` | sim |  |  |  |
| 3 | `queue_id` | `uuid` | sim |  |  |  |
| 4 | `goal_type` | `text` | não |  |  |  |
| 5 | `daily_target` | `integer` | não | `0` |  |  |
| 6 | `weekly_target` | `integer` | não | `0` |  |  |
| 7 | `monthly_target` | `integer` | não | `0` |  |  |
| 8 | `is_active` | `boolean` | sim | `true` |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| goal_owner_check | CHECK | `CHECK (profile_id IS NOT NULL AND queue_id IS NULL OR profile_id IS NULL AND queue_id IS NOT NULL)` |  |  | sim |
| goals_configurations_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| goals_configurations_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| goals_configurations_profile_id_goal_type_key | UNIQUE | `UNIQUE (profile_id, goal_type)` |  |  | sim |
| goals_configurations_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| goals_configurations_queue_id_goal_type_key | UNIQUE | `UNIQUE (queue_id, goal_type)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| goals_configurations_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX goals_configurations_pkey ON public.goals_configurations USING btree (id)` |
| goals_configurations_profile_id_goal_type_key | btree | profile_id, goal_type | sim | sim |  | `CREATE UNIQUE INDEX goals_configurations_profile_id_goal_type_key ON public.goals_configurations USING btree (profile_id, goal_type)` |
| goals_configurations_queue_id_goal_type_key | btree | queue_id, goal_type | sim | sim |  | `CREATE UNIQUE INDEX goals_configurations_queue_id_goal_type_key ON public.goals_configurations USING btree (queue_id, goal_type)` |
| idx_goals_configurations_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_goals_configurations_profile_id ON public.goals_configurations USING btree (profile_id)` |
| idx_goals_configurations_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_goals_configurations_queue_id ON public.goals_configurations USING btree (queue_id)` |


## Policies (RLS)

### `Users can manage their own goals`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK | `((profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |

### `Users can view their own goals`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((profile_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_goals_configurations_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
