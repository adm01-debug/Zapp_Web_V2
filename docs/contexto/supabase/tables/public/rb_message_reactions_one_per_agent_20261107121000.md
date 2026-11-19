# public._rb_message_reactions_one_per_agent_20261107121000

> Rollback privado das duplicatas de reação removidas ao instalar a unicidade por agente/mensagem.

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
| 1 | `id` | `uuid` | não |  |  |  |
| 2 | `message_id` | `uuid` | não |  |  |  |
| 3 | `user_id` | `uuid` | sim |  |  |  |
| 4 | `contact_id` | `uuid` | sim |  |  |  |
| 5 | `emoji` | `text` | não |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| _rb_message_reactions_one_per_agent_20261107121000_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| _rb_message_reactions_one_per_agent_20261107121000_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX _rb_message_reactions_one_per_agent_20261107121000_pkey ON public._rb_message_reactions_one_per_agent_20261107121000 USING btree (id)` |


## Policies (RLS)

### `No client access to reaction rollback backup`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | anon, authenticated |
| USING | `false` |
| WITH CHECK | `false` |


## Triggers

_nenhum_


## Grants

_nenhum_
