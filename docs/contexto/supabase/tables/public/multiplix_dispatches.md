# public.multiplix_dispatches

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.multiplix_dispatches (tabela). RLS habilitada: t; RLS forçada: t.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 message_template text NOT NULL
4 media_url text NULLABLE
5 media_type text NULLABLE
6 status multiplix_dispatch_status NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 audience_filters jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 typing_delay_min integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 typing_delay_max integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
10 send_interval_min integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 send_interval_max integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 send_window_start time without time zone NULLABLE
13 send_window_end time without time zone NULLABLE
14 business_hours_only boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
15 schedule_timezone text NOT NULL [DEFAULT/EXPRESSION DEFINED]
16 speed_profile text NOT NULL [DEFAULT/EXPRESSION DEFINED]
17 whatsapp_connection_id uuid NULLABLE
18 total_recipients integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
19 sent_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
20 failed_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
21 delivered_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
22 scheduled_at timestamp with time zone NULLABLE
23 started_at timestamp with time zone NULLABLE
24 paused_at timestamp with time zone NULLABLE
25 pause_reason text NULLABLE
26 completed_at timestamp with time zone NULLABLE
27 created_by uuid NOT NULL
28 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
29 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
30 outcome_unknown_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
31 client_request_id uuid NULLABLE
32 dispatch_version integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
33 audience_version integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
34 origin text NULLABLE
Constraints:
multiplix_dispatches_origin_check: CHECK (origin = ANY (ARRAY['manual'::text, 'audience'::text, 'crm360'::text, 'contacts'::text]))
multiplix_dispatches_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL
multiplix_dispatches_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view all dispatches" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can delete own draft dispatches" [command=DELETE; roles=authenticated; PERMISSIVE]
"Users can view own dispatches" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `message_template` | `text` | não |  |  |  |
| 4 | `media_url` | `text` | sim |  |  |  |
| 5 | `media_type` | `text` | sim |  |  |  |
| 6 | `status` | `multiplix_dispatch_status` | não | `'draft'::multiplix_dispatch_status` |  |  |
| 7 | `audience_filters` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 8 | `typing_delay_min` | `integer` | não | `1500` |  |  |
| 9 | `typing_delay_max` | `integer` | não | `4000` |  |  |
| 10 | `send_interval_min` | `integer` | não | `5000` |  |  |
| 11 | `send_interval_max` | `integer` | não | `15000` |  |  |
| 12 | `send_window_start` | `time without time zone` | sim |  |  |  |
| 13 | `send_window_end` | `time without time zone` | sim |  |  |  |
| 14 | `business_hours_only` | `boolean` | não | `false` |  |  |
| 15 | `schedule_timezone` | `text` | não | `'America/Sao_Paulo'::text` |  |  |
| 16 | `speed_profile` | `text` | não | `'moderate'::text` |  |  |
| 17 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 18 | `total_recipients` | `integer` | não | `0` |  |  |
| 19 | `sent_count` | `integer` | não | `0` |  |  |
| 20 | `failed_count` | `integer` | não | `0` |  |  |
| 21 | `delivered_count` | `integer` | não | `0` |  |  |
| 22 | `scheduled_at` | `timestamp with time zone` | sim |  |  |  |
| 23 | `started_at` | `timestamp with time zone` | sim |  |  |  |
| 24 | `paused_at` | `timestamp with time zone` | sim |  |  |  |
| 25 | `pause_reason` | `text` | sim |  |  |  |
| 26 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 27 | `created_by` | `uuid` | não |  |  |  |
| 28 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 29 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 30 | `outcome_unknown_count` | `integer` | não | `0` |  |  |
| 31 | `client_request_id` | `uuid` | sim |  |  |  |
| 32 | `dispatch_version` | `integer` | não | `1` |  |  |
| 33 | `audience_version` | `integer` | não | `1` |  |  |
| 34 | `origin` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_dispatches_origin_check | CHECK | `CHECK (origin = ANY (ARRAY['manual'::text, 'audience'::text, 'crm360'::text, 'contacts'::text]))` |  |  | sim |
| multiplix_dispatches_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| multiplix_dispatches_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.multiplix_blocks | multiplix_blocks_dispatch_id_fkey | dispatch_id | CASCADE |
| public.multiplix_delivery_items | multiplix_delivery_items_dispatch_id_fkey | dispatch_id | CASCADE |
| public.multiplix_events | multiplix_events_dispatch_id_fkey | dispatch_id | RESTRICT |
| public.multiplix_recipients | multiplix_recipients_dispatch_id_fkey | dispatch_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_dispatches_client_request_id | btree | client_request_id | sim | sim | `(client_request_id IS NOT NULL)` | `CREATE UNIQUE INDEX idx_multiplix_dispatches_client_request_id ON public.multiplix_dispatches USING btree (client_request_id) WHERE (client_request_id IS NOT NULL)` |
| idx_multiplix_dispatches_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_multiplix_dispatches_created_by ON public.multiplix_dispatches USING btree (created_by)` |
| idx_multiplix_dispatches_created_by_created_at | btree | created_by, created_at | não | sim |  | `CREATE INDEX idx_multiplix_dispatches_created_by_created_at ON public.multiplix_dispatches USING btree (created_by, created_at DESC)` |
| idx_multiplix_dispatches_status | btree | status | não | sim |  | `CREATE INDEX idx_multiplix_dispatches_status ON public.multiplix_dispatches USING btree (status)` |
| idx_multiplix_dispatches_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_multiplix_dispatches_whatsapp_connection_id ON public.multiplix_dispatches USING btree (whatsapp_connection_id)` |
| multiplix_dispatches_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_dispatches_pkey ON public.multiplix_dispatches USING btree (id)` |


## Policies (RLS)

### `Admins can view all dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can delete own draft dispatches`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) AND (created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1)) AND (status = 'draft'::multiplix_dispatch_status))` |
| WITH CHECK |  |

### `Users can view own dispatches`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(created_by = ( SELECT profiles.id    FROM profiles   WHERE (profiles.user_id = ( SELECT auth.uid() AS uid))  LIMIT 1))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| enforce_multiplix_dispatch_mutability | BEFORE | INSERT OR DELETE OR UPDATE | ROW | enabled | public.enforce_multiplix_dispatch_mutability |
| trg_multiplix_bump_version_on_dispatch_edit | BEFORE | UPDATE | ROW | enabled | public.multiplix_bump_version_on_dispatch_edit |
| update_multiplix_dispatches_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
