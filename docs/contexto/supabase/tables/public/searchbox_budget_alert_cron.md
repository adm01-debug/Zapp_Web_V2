# public.searchbox_budget_alert_cron

> [RLS-sem-policy: intencional] Controle de execução do cron searchbox-budget-alert. Só service_role via pg_cron.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `boolean` | não | `true` |  |  |
| 2 | `url` | `text` | não |  |  |  |
| 3 | `previous_command` | `text` | não |  |  |  |
| 4 | `captured_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| searchbox_budget_alert_cron_id_check | CHECK | `CHECK (id)` |  |  | sim |
| searchbox_budget_alert_cron_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| searchbox_budget_alert_cron_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX searchbox_budget_alert_cron_pkey ON public.searchbox_budget_alert_cron USING btree (id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
