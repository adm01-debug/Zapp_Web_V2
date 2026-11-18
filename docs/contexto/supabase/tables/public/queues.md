# public.queues

> Filas de atendimento (prioridade, tempo maximo de espera) usadas na distribuicao de contatos.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `color` | `text` | não | `'#3B82F6'::text` |  |  |
| 5 | `is_active` | `boolean` | sim | `true` |  |  |
| 6 | `max_wait_time_minutes` | `integer` | sim | `30` |  |  |
| 7 | `priority` | `integer` | sim | `0` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `distribution` | `text` | não | `'least_busy'::text` |  |  |
| 11 | `overflow_queue_id` | `uuid` | sim |  |  |  |
| 12 | `max_per_agent` | `integer` | sim |  |  |  |
| 13 | `sticky_enabled` | `boolean` | não | `false` |  |  |
| 14 | `paused` | `boolean` | não | `false` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queues_distribution_check | CHECK | `CHECK (distribution = ANY (ARRAY['round_robin'::text, 'least_busy'::text, 'skill'::text]))` |  |  | sim |
| queues_max_per_agent_check | CHECK | `CHECK (max_per_agent IS NULL OR max_per_agent >= 1)` |  |  | sim |
| queues_overflow_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (overflow_queue_id) REFERENCES queues(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| queues_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.channel_routing_rules | channel_routing_rules_queue_id_fkey | queue_id | NO ACTION |
| public.contacts | contacts_queue_id_fkey | queue_id | SET NULL |
| public.conversation_events | conversation_events_from_queue_id_fkey | from_queue_id | NO ACTION |
| public.conversation_events | conversation_events_to_queue_id_fkey | to_queue_id | NO ACTION |
| public.goals_configurations | goals_configurations_queue_id_fkey | queue_id | CASCADE |
| public.queue_goals | queue_goals_queue_id_fkey | queue_id | CASCADE |
| public.queue_members | queue_members_queue_id_fkey | queue_id | CASCADE |
| public.queue_positions | queue_positions_queue_id_fkey | queue_id | NO ACTION |
| public.queue_skill_requirements | queue_skill_requirements_queue_id_fkey | queue_id | CASCADE |
| public.queues | queues_overflow_queue_id_fkey | overflow_queue_id | SET NULL |
| public.sla_alert_events | sla_alert_events_queue_id_fkey | queue_id | SET NULL |
| public.sla_rules | sla_rules_queue_id_fkey | queue_id | CASCADE |
| public.whatsapp_connection_queues | whatsapp_connection_queues_queue_id_fkey | queue_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_queues_overflow_queue_id | btree | overflow_queue_id | não | sim |  | `CREATE INDEX idx_queues_overflow_queue_id ON public.queues USING btree (overflow_queue_id)` |
| queues_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queues_pkey ON public.queues USING btree (id)` |


## Policies (RLS)

### `Admins can manage queues`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated users can view queues`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| audit_queues_config | AFTER | INSERT OR DELETE OR UPDATE | ROW | enabled | public.audit_operational_config |
| queues_prevent_overflow_cycle | BEFORE | INSERT OR UPDATE | ROW | enabled | public.queues_prevent_overflow_cycle |
| update_queues_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
