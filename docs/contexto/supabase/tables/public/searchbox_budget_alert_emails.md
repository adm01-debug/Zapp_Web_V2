# public.searchbox_budget_alert_emails

> [RLS-sem-policy: intencional] Destinatários dos alertas de budget. Só service_role via edge function searchbox-budget-alert.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.searchbox_budget_alert_emails (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 mes text NOT NULL
2 sessoes integer NOT NULL
3 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 attempt_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 request_id bigint NULLABLE — id do request devolvido por net.http_post (pg_net), para conciliacao do envio.
6 http_status integer NULLABLE
7 last_error text NULLABLE
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
searchbox_budget_alert_emails_attempt_count_check: CHECK (attempt_count >= 0)
searchbox_budget_alert_emails_mes_check: CHECK (mes ~ '^[0-9]{4}-[0-9]{2}$'::text)
searchbox_budget_alert_emails_sessoes_check: CHECK (sessoes >= 0)
searchbox_budget_alert_emails_status_check: CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text, 'uncertain'::text]))
searchbox_budget_alert_emails_pkey: PRIMARY KEY (mes)
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
