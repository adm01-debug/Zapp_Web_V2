# public.agent_skills

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
| 2 | `profile_id` | `uuid` | não |  |  |  |
| 3 | `skill_name` | `text` | não |  |  |  |
| 4 | `skill_level` | `integer` | sim | `1` |  |  |
| 5 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_skills_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| agent_skills_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| agent_skills_profile_id_skill_name_key | UNIQUE | `UNIQUE (profile_id, skill_name)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_skills_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX agent_skills_pkey ON public.agent_skills USING btree (id)` |
| agent_skills_profile_id_skill_name_key | btree | profile_id, skill_name | sim | sim |  | `CREATE UNIQUE INDEX agent_skills_profile_id_skill_name_key ON public.agent_skills USING btree (profile_id, skill_name)` |
| idx_agent_skills_profile_id | btree | profile_id | não | sim |  | `CREATE INDEX idx_agent_skills_profile_id ON public.agent_skills USING btree (profile_id)` |


## Policies (RLS)

### `Admins can manage skills`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can view own or admin all skills`

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
