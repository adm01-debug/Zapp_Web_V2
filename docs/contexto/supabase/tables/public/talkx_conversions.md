# public.talkx_conversions

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
| 2 | `campaign_id` | `uuid` | não |  |  |  |
| 3 | `recipient_id` | `uuid` | sim |  |  |  |
| 4 | `link_id` | `uuid` | sim |  |  |  |
| 5 | `value` | `numeric(12,2)` | sim |  |  |  |
| 6 | `source` | `text` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `external_ref` | `text` | sim |  |  |  |
| 9 | `occurred_at` | `timestamp with time zone` | não | `now()` |  |  |
| 10 | `currency` | `text` | não | `'BRL'::text` |  |  |
| 11 | `attribution` | `jsonb` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_conversions_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_conversions_link_id_fkey | FOREIGN KEY | `FOREIGN KEY (link_id) REFERENCES talkx_links(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_conversions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_conversions_recipient_id_fkey | FOREIGN KEY | `FOREIGN KEY (recipient_id) REFERENCES talkx_recipients(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_conversions_source_check | CHECK | `CHECK (source IS NULL OR (source = ANY (ARRAY['whatsapp'::text, 'manual'::text, 'import'::text, 'api'::text, 'checkout'::text, 'deal'::text])))` |  |  | sim |
| talkx_conversions_value_check | CHECK | `CHECK (value IS NULL OR value >= 0::numeric)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_conversions_camp | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_conversions_camp ON public.talkx_conversions USING btree (campaign_id)` |
| idx_talkx_conversions_link_id | btree | link_id | não | sim |  | `CREATE INDEX idx_talkx_conversions_link_id ON public.talkx_conversions USING btree (link_id)` |
| idx_talkx_conversions_recipient_id | btree | recipient_id | não | sim |  | `CREATE INDEX idx_talkx_conversions_recipient_id ON public.talkx_conversions USING btree (recipient_id)` |
| talkx_conversions_dedupe_key | btree | campaign_id, source, external_ref | sim | sim | `((external_ref IS NOT NULL) AND (source IS NOT NULL))` | `CREATE UNIQUE INDEX talkx_conversions_dedupe_key ON public.talkx_conversions USING btree (campaign_id, source, external_ref) WHERE ((external_ref IS NOT NULL) AND (source IS NOT NULL))` |
| talkx_conversions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_conversions_pkey ON public.talkx_conversions USING btree (id)` |


## Policies (RLS)

### `talkx_conversions_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((campaign_id IN ( SELECT tc.id    FROM talkx_campaigns tc   WHERE (tc.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
