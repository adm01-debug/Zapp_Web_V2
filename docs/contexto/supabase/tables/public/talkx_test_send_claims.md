# public.talkx_test_send_claims

> [RLS-sem-policy: intencional] Claims para envios de teste do TalkX. Só service_role via talkx-send.

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `request_key` | `text` | não |  |  |  |
| 3 | `provider_message_id` | `text` | sim |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `sent_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_test_send_claims_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_test_send_claims_request_key_key | UNIQUE | `UNIQUE (request_key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_test_send_claims_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_test_send_claims_pkey ON public.talkx_test_send_claims USING btree (id)` |
| talkx_test_send_claims_request_key_key | btree | request_key | sim | sim |  | `CREATE UNIQUE INDEX talkx_test_send_claims_request_key_key ON public.talkx_test_send_claims USING btree (request_key)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
