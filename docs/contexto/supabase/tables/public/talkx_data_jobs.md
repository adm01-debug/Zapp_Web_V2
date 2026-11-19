# public.talkx_data_jobs

> Talk X · trilha de dados: catálogo dos jobs (X036). Leitura só admin/supervisor; escrita só service_role.

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
| 1 | `job` | `text` | não |  |  |  |
| 2 | `interval_minutes` | `integer` | não | `1440` |  |  |
| 3 | `enabled` | `boolean` | não | `true` |  |  |
| 4 | `last_started_at` | `timestamp with time zone` | sim |  |  |  |
| 5 | `last_finished_at` | `timestamp with time zone` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_data_jobs_pkey | PRIMARY KEY | `PRIMARY KEY (job)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_data_jobs_pkey | btree | job | sim | sim |  | `CREATE UNIQUE INDEX talkx_data_jobs_pkey ON public.talkx_data_jobs USING btree (job)` |


## Policies (RLS)

### `talkx_data_jobs_select`

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
