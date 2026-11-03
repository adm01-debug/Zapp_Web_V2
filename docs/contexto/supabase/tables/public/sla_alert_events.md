# public.sla_alert_events

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `alert_type` | `text` | não |  |  |  |
| 4 | `severity` | `text` | não |  |  |  |
| 5 | `queue_id` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `resolved_by` | `uuid` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sla_alert_events_alert_type_check | CHECK | `CHECK (alert_type = ANY (ARRAY['first_response'::text, 'resolution'::text]))` |  |  | sim |
| sla_alert_events_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| sla_alert_events_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| sla_alert_events_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| sla_alert_events_resolved_by_fkey | FOREIGN KEY | `FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| sla_alert_events_resolved_consistente | CHECK | `CHECK (resolved_at IS NOT NULL OR resolved_by IS NULL)` |  |  | sim |
| sla_alert_events_severity_check | CHECK | `CHECK (severity = ANY (ARRAY['warning'::text, 'breached'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_sla_alert_events_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_sla_alert_events_queue_id ON public.sla_alert_events USING btree (queue_id)` |
| idx_sla_alert_events_resolved_by | btree | resolved_by | não | sim |  | `CREATE INDEX idx_sla_alert_events_resolved_by ON public.sla_alert_events USING btree (resolved_by)` |
| sla_alert_events_ativos_unicos | btree | contact_id, alert_type, severity | sim | sim | `(resolved_at IS NULL)` | `CREATE UNIQUE INDEX sla_alert_events_ativos_unicos ON public.sla_alert_events USING btree (contact_id, alert_type, severity) WHERE (resolved_at IS NULL)` |
| sla_alert_events_contact_id_idx | btree | contact_id | não | sim |  | `CREATE INDEX sla_alert_events_contact_id_idx ON public.sla_alert_events USING btree (contact_id)` |
| sla_alert_events_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX sla_alert_events_pkey ON public.sla_alert_events USING btree (id)` |


## Policies (RLS)

### `sla_alert_events_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(auth.uid()) OR is_contact_visible_to_user(contact_id, auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
