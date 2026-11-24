# public.talkx_ai_requests

> X076 — trilha de toda chamada de IA do Talk X: teto mensal, limite diario e cache de 24 h. cost_usd NULO = sem tarifa em ai_model_prices, nunca zero.

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
| 2 | `kind` | `text` | não |  |  |  |
| 3 | `entity_type` | `text` | sim |  |  |  |
| 4 | `entity_id` | `text` | sim |  |  |  |
| 5 | `input_hash` | `text` | não |  |  | SHA-256 do kind + entrada canonica. Mesmo hash dentro de 24 h devolve o output do cache sem pagar de novo. |
| 6 | `output` | `jsonb` | sim |  |  |  |
| 7 | `model` | `text` | sim |  |  |  |
| 8 | `tokens_in` | `integer` | não | `0` |  |  |
| 9 | `tokens_out` | `integer` | não | `0` |  |  |
| 10 | `cost_usd` | `numeric(18,8)` | sim |  |  | Custo medido pela tarifa vigente (ai_model_prices). NULO quando o modelo nao tem tarifa — nao somar como zero. |
| 11 | `status` | `text` | não |  |  |  |
| 12 | `created_by` | `uuid` | não |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_ai_requests_cost_usd_check | CHECK | `CHECK (cost_usd IS NULL OR cost_usd >= 0::numeric)` |  |  | sim |
| talkx_ai_requests_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_ai_requests_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['insight_text'::text, 'message_variation'::text, 'segment_suggestion'::text]))` |  |  | sim |
| talkx_ai_requests_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_ai_requests_status_check | CHECK | `CHECK (status = ANY (ARRAY['ok'::text, 'error'::text]))` |  |  | sim |
| talkx_ai_requests_tokens_in_check | CHECK | `CHECK (tokens_in >= 0)` |  |  | sim |
| talkx_ai_requests_tokens_out_check | CHECK | `CHECK (tokens_out >= 0)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_ai_requests_cache_idx | btree | input_hash, created_at | não | sim |  | `CREATE INDEX talkx_ai_requests_cache_idx ON public.talkx_ai_requests USING btree (input_hash, created_at DESC)` |
| talkx_ai_requests_mes_idx | btree | created_at | não | sim |  | `CREATE INDEX talkx_ai_requests_mes_idx ON public.talkx_ai_requests USING btree (created_at)` |
| talkx_ai_requests_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_ai_requests_pkey ON public.talkx_ai_requests USING btree (id)` |
| talkx_ai_requests_usuario_dia_idx | btree | created_by, created_at | não | sim |  | `CREATE INDEX talkx_ai_requests_usuario_dia_idx ON public.talkx_ai_requests USING btree (created_by, created_at DESC)` |


## Policies (RLS)

### `talkx_ai_requests_admin_read`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `COALESCE(is_admin_or_supervisor(( SELECT auth.uid() AS uid)), false)` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
