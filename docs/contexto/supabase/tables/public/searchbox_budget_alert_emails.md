# public.searchbox_budget_alert_emails

> [RLS-sem-policy: intencional] Destinatários dos alertas de budget. Só service_role via edge function searchbox-budget-alert.

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
| 1 | `mes` | `text` | não |  |  |  |
| 2 | `sessoes` | `integer` | não |  |  |  |
| 3 | `status` | `text` | não | `'pending'::text` |  |  |
| 4 | `attempt_count` | `integer` | não | `0` |  |  |
| 5 | `request_id` | `bigint` | sim |  |  | id do request devolvido por net.http_post (pg_net), para conciliacao do envio. |
| 6 | `http_status` | `integer` | sim |  |  |  |
| 7 | `last_error` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| searchbox_budget_alert_emails_attempt_count_check | CHECK | `CHECK (attempt_count >= 0)` |  |  | sim |
| searchbox_budget_alert_emails_mes_check | CHECK | `CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'::text)` |  |  | sim |
| searchbox_budget_alert_emails_pkey | PRIMARY KEY | `PRIMARY KEY (mes)` |  |  | sim |
| searchbox_budget_alert_emails_sessoes_check | CHECK | `CHECK (sessoes >= 0)` |  |  | sim |
| searchbox_budget_alert_emails_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'uncertain'::text]))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| searchbox_budget_alert_emails_pkey | btree | mes | sim | sim |  | `CREATE UNIQUE INDEX searchbox_budget_alert_emails_pkey ON public.searchbox_budget_alert_emails USING btree (mes)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
