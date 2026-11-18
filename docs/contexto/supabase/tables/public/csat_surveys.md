# public.csat_surveys

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `rating` | `integer` | sim |  |  |  |
| 5 | `feedback` | `text` | sim |  |  |  |
| 6 | `conversation_resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `status` | `text` | não | `'scheduled'::text` |  |  |
| 9 | `send_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `responded_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `conversation_id` | `uuid` | sim |  |  |  |
| 12 | `message_text` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| csat_surveys_agent_id_fkey | FOREIGN KEY | `FOREIGN KEY (agent_id) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| csat_surveys_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| csat_surveys_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| csat_surveys_rating_range | CHECK | `CHECK (rating IS NULL OR rating >= 1 AND rating <= 5)` |  |  | sim |
| csat_surveys_responded_consistency | CHECK | `CHECK ((status = 'responded'::text) = (responded_at IS NOT NULL))` |  |  | sim |
| csat_surveys_status_check | CHECK | `CHECK (status = ANY (ARRAY['scheduled'::text, 'sent'::text, 'responded'::text, 'failed'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| csat_surveys_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX csat_surveys_pkey ON public.csat_surveys USING btree (id)` |
| idx_csat_surveys_agent_id | btree | agent_id | não | sim |  | `CREATE INDEX idx_csat_surveys_agent_id ON public.csat_surveys USING btree (agent_id)` |
| idx_csat_surveys_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_csat_surveys_contact_id ON public.csat_surveys USING btree (contact_id)` |
| idx_csat_surveys_contact_invites | btree | contact_id, created_at | não | sim | `(status = ANY (ARRAY['sent'::text, 'responded'::text]))` | `CREATE INDEX idx_csat_surveys_contact_invites ON public.csat_surveys USING btree (contact_id, created_at) WHERE (status = ANY (ARRAY['sent'::text, 'responded'::text]))` |
| idx_csat_surveys_created_at_agent | btree | created_at, agent_id | não | sim | `(agent_id IS NOT NULL)` | `CREATE INDEX idx_csat_surveys_created_at_agent ON public.csat_surveys USING btree (created_at, agent_id) WHERE (agent_id IS NOT NULL)` |
| idx_csat_surveys_dispatch | btree | send_at | não | sim | `(status = 'scheduled'::text)` | `CREATE INDEX idx_csat_surveys_dispatch ON public.csat_surveys USING btree (send_at) WHERE (status = 'scheduled'::text)` |
| uq_csat_surveys_conversation | btree | conversation_id | sim | sim | `(conversation_id IS NOT NULL)` | `CREATE UNIQUE INDEX uq_csat_surveys_conversation ON public.csat_surveys USING btree (conversation_id) WHERE (conversation_id IS NOT NULL)` |


## Policies (RLS)

### `Service role manages CSAT surveys`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |

### `Users can insert CSAT surveys`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((agent_id IS NULL) OR (agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |

### `Users can view own CSAT surveys`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((agent_id IN ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = auth.uid()))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
