# ops.hermes_change_log

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
| 1 | `id` | `bigint` | não | `nextval('ops.hermes_change_log_id_seq'::regclass)` |  |  |
| 2 | `run_id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 3 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 4 | `finished_at` | `timestamp with time zone` | sim |  |  |  |
| 5 | `origem` | `text` | não |  |  |  |
| 6 | `solicitante` | `text` | sim |  |  |  |
| 7 | `pedido` | `text` | não |  |  |  |
| 8 | `status` | `text` | não | `'planejado'::text` |  |  |
| 9 | `risco` | `text` | sim |  |  |  |
| 10 | `alvos` | `text[]` | sim |  |  |  |
| 11 | `planner_model` | `text` | sim |  |  |  |
| 12 | `reviewer_model` | `text` | sim |  |  |  |
| 13 | `executor_model` | `text` | sim |  |  |  |
| 14 | `plano` | `jsonb` | sim |  |  |  |
| 15 | `parecer` | `jsonb` | sim |  |  |  |
| 16 | `simulacao` | `jsonb` | sim |  |  |  |
| 17 | `execucao` | `jsonb` | sim |  |  |  |
| 18 | `verificacao` | `jsonb` | sim |  |  |  |
| 19 | `rollback` | `text` | sim |  |  |  |
| 20 | `repo` | `text` | sim |  |  |  |
| 21 | `branch` | `text` | sim |  |  |  |
| 22 | `commit_sha` | `text` | sim |  |  |  |
| 23 | `pr_url` | `text` | sim |  |  |  |
| 24 | `custo_usd` | `numeric(10,4)` | sim |  |  |  |
| 25 | `erro` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| hermes_change_log_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| hermes_change_log_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX hermes_change_log_pkey ON ops.hermes_change_log USING btree (id)` |
| idx_hermes_change_log_created | btree | created_at | não | sim |  | `CREATE INDEX idx_hermes_change_log_created ON ops.hermes_change_log USING btree (created_at DESC)` |
| idx_hermes_change_log_run | btree | run_id | não | sim |  | `CREATE INDEX idx_hermes_change_log_run ON ops.hermes_change_log USING btree (run_id)` |
| idx_hermes_change_log_status | btree | status | não | sim |  | `CREATE INDEX idx_hermes_change_log_status ON ops.hermes_change_log USING btree (status)` |


## Policies (RLS)

### `service_role_full_hermes_change_log`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
