# public.nps_surveys

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `score` | `integer` | não |  |  |  |
| 5 | `feedback` | `text` | sim |  |  |  |
| 6 | `survey_type` | `text` | não | `'manual'::text` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| nps_surveys_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| nps_surveys_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| nps_surveys_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| nps_surveys_score_check | CHECK | `CHECK (score >= 0 AND score <= 10)` |  |  | sim |
| nps_surveys_survey_type_check | CHECK | `CHECK (survey_type = ANY (ARRAY['periodic'::text, 'post_resolution'::text, 'manual'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_nps_surveys_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_nps_surveys_agent_id ON public.nps_surveys USING btree (agent_id)` |
| idx_nps_surveys_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_nps_surveys_contact ON public.nps_surveys USING btree (contact_id)` |
| idx_nps_surveys_created | btree | created_at | não | sim |  | `CREATE INDEX idx_nps_surveys_created ON public.nps_surveys USING btree (created_at DESC)` |
| nps_surveys_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX nps_surveys_pkey ON public.nps_surveys USING btree (id)` |


## Policies (RLS)

### `Admins and own agents can view NPS surveys`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR (agent_id = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid())  LIMIT 1)))` |
| WITH CHECK |  |

### `Admins can delete NPS surveys`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can update NPS surveys`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Users can create own NPS surveys`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((agent_id IS NOT NULL) AND (agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))))` |


## Triggers

_nenhum_


## Grants

_nenhum_
