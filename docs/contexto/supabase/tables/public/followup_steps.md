# public.followup_steps

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
| 2 | `sequence_id` | `uuid` | não |  |  |  |
| 3 | `step_order` | `integer` | não | `1` |  |  |
| 4 | `delay_hours` | `integer` | não | `24` |  |  |
| 5 | `message_template` | `text` | não |  |  |  |
| 6 | `message_type` | `text` | não | `'text'::text` |  |  |
| 7 | `is_active` | `boolean` | sim | `true` |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| followup_steps_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| followup_steps_sequence_id_fkey | FOREIGN KEY | `FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| followup_steps_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX followup_steps_pkey ON public.followup_steps USING btree (id)` |
| idx_followup_steps_sequence_id | btree | sequence_id | não | sim |  | `CREATE INDEX idx_followup_steps_sequence_id ON public.followup_steps USING btree (sequence_id)` |


## Policies (RLS)

### `Admins can manage followup steps`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can view followup steps`

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
