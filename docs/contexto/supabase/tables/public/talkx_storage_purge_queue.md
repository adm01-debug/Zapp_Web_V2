# public.talkx_storage_purge_queue

> [RLS-sem-policy: intencional] Fila de purge de storage do TalkX. Gerenciada pela edge function talkx-storage-purge (service_role).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_storage_purge_queue (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 bucket_id text NOT NULL
3 object_name text NOT NULL
4 object_id uuid NULLABLE
5 reason text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 enqueued_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 attempts integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 last_error text NULLABLE
9 processed_at timestamp with time zone NULLABLE
Constraints:
talkx_storage_purge_queue_attempts_check: CHECK (attempts >= 0)
talkx_storage_purge_queue_pkey: PRIMARY KEY (id)
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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `bucket_id` | `text` | não |  |  |  |
| 3 | `object_name` | `text` | não |  |  |  |
| 4 | `object_id` | `uuid` | sim |  |  |  |
| 5 | `reason` | `text` | não | `'talkx_media_orphan'::text` |  |  |
| 6 | `enqueued_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `attempts` | `integer` | não | `0` |  |  |
| 8 | `last_error` | `text` | sim |  |  |  |
| 9 | `processed_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_storage_purge_queue_attempts_check | CHECK | `CHECK (attempts >= 0)` |  |  | sim |
| talkx_storage_purge_queue_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_storage_purge_queue_pending_dedup | btree | bucket_id, object_name | sim | sim | `(processed_at IS NULL)` | `CREATE UNIQUE INDEX talkx_storage_purge_queue_pending_dedup ON public.talkx_storage_purge_queue USING btree (bucket_id, object_name) WHERE (processed_at IS NULL)` |
| talkx_storage_purge_queue_pending_idx | btree | enqueued_at | não | sim | `(processed_at IS NULL)` | `CREATE INDEX talkx_storage_purge_queue_pending_idx ON public.talkx_storage_purge_queue USING btree (enqueued_at) WHERE (processed_at IS NULL)` |
| talkx_storage_purge_queue_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_storage_purge_queue_pkey ON public.talkx_storage_purge_queue USING btree (id)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
