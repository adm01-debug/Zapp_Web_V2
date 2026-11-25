# public.searchbox_budget_alert_cron

> [RLS-sem-policy: intencional] Controle de execução do cron searchbox-budget-alert. Só service_role via pg_cron.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.searchbox_budget_alert_cron (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 url text NOT NULL
3 previous_command text NOT NULL
4 captured_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
searchbox_budget_alert_cron_id_check: CHECK (id)
searchbox_budget_alert_cron_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
(RLS habilitada sem política; verificar se o acesso restrito é intencional)

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
