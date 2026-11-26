# public.webhook_failures

> Dead-letter dos webhooks (endpoint, evento, payload truncado, erro, retries). ACL restrita a service_role.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.webhook_failures (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 endpoint text NOT NULL
3 event_type text NULLABLE
4 instance text NULLABLE
5 payload_truncated jsonb NULLABLE
6 payload_sha256 text NULLABLE
7 error_message text NOT NULL
8 error_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 retry_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 resolved boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 resolved_at timestamp with time zone NULLABLE
Constraints:
webhook_failures_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
service_role_full [command=ALL; roles=service_role; PERMISSIVE]

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `endpoint` | `text` | não |  |  |  |
| 3 | `event_type` | `text` | sim |  |  |  |
| 4 | `instance` | `text` | sim |  |  |  |
| 5 | `payload_truncated` | `jsonb` | sim |  |  |  |
| 6 | `payload_sha256` | `text` | sim |  |  |  |
| 7 | `error_message` | `text` | não |  |  |  |
| 8 | `error_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `retry_count` | `integer` | não | `0` |  |  |
| 10 | `resolved` | `boolean` | não | `false` |  |  |
| 11 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `external_id` | `text` | sim |  |  | Id do evento no provedor (key.id). Chave de idempotencia do replay contra ux_messages_dedup. |
| 13 | `replay_payload` | `jsonb` | sim |  |  | Argumentos validados do ingest_inbound_message para reprocessar o evento. Contem telefone, TEXTO (p_content) e URL de midia (p_media_url) — acesso restrito a service_role; anon/authenticated sem privilegio. Ao resolver, a linha e mantida para auditoria (somente resolved/resolved_at mudam); sem purga automatica nesta change. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| webhook_failures_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| webhook_failures_endpoint_idx | btree | endpoint, error_at | não | sim |  | `CREATE INDEX webhook_failures_endpoint_idx ON public.webhook_failures USING btree (endpoint, error_at DESC)` |
| webhook_failures_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX webhook_failures_pkey ON public.webhook_failures USING btree (id)` |
| webhook_failures_replay_pendente_idx | btree | endpoint, error_at | não | sim | `((NOT resolved) AND (replay_payload IS NOT NULL))` | `CREATE INDEX webhook_failures_replay_pendente_idx ON public.webhook_failures USING btree (endpoint, error_at) WHERE ((NOT resolved) AND (replay_payload IS NOT NULL))` |
| webhook_failures_resolved_idx | btree | resolved, error_at | não | sim | `(NOT resolved)` | `CREATE INDEX webhook_failures_resolved_idx ON public.webhook_failures USING btree (resolved, error_at DESC) WHERE (NOT resolved)` |


## Policies (RLS)

### `service_role_full`

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
