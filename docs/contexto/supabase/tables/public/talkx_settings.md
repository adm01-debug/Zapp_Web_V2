# public.talkx_settings

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
| 1 | `key` | `text` | não |  |  |  |
| 2 | `value` | `jsonb` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_settings_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_settings_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX talkx_settings_pkey ON public.talkx_settings USING btree (key)` |


## Policies (RLS)

### `authenticated_read_talkx_settings`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `talkx_settings_admin_write`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |


## Triggers

_nenhum_


## Grants

_nenhum_
