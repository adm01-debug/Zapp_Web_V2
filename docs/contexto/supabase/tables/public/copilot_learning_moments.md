# public.copilot_learning_moments

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
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `message_id` | `text` | não |  |  |  |
| 4 | `tag` | `text` | não |  |  |  |
| 5 | `notes` | `text` | sim |  |  |  |
| 6 | `tagged_by` | `uuid` | não |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_learning_moments_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| copilot_learning_moments_tag_check | CHECK | `CHECK (tag = ANY (ARRAY['exemplar'::text, 'anti_pattern'::text, 'objection_win'::text, 'closing_technique'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_learning_moments_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_learning_moments_pkey ON public.copilot_learning_moments USING btree (id)` |


## Policies (RLS)

### `copilot_learning_moments_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `true` |

### `copilot_learning_moments_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
