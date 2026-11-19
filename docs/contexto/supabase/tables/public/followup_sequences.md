# public.followup_sequences

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `trigger_event` | `text` | não | `'ticket_resolved'::text` |  |  |
| 4 | `is_active` | `boolean` | sim | `true` |  |  |
| 5 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 6 | `created_by` | `uuid` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| followup_sequences_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| followup_sequences_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| followup_sequences_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.followup_executions | followup_executions_sequence_id_fkey | sequence_id | NO ACTION |
| public.followup_steps | followup_steps_sequence_id_fkey | sequence_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| followup_sequences_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX followup_sequences_pkey ON public.followup_sequences USING btree (id)` |
| idx_followup_sequences_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_followup_sequences_created_by ON public.followup_sequences USING btree (created_by)` |
| idx_followup_sequences_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_followup_sequences_whatsapp_connection_id ON public.followup_sequences USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage followup sequences`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can view followup sequences`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
