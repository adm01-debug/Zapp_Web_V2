# public.talkx_link_clicks

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
| 2 | `link_id` | `uuid` | não |  |  |  |
| 3 | `recipient_id` | `uuid` | sim |  |  |  |
| 4 | `clicked_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `ua` | `text` | sim |  |  |  |
| 6 | `ip_hash` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_link_clicks_link_id_fkey | FOREIGN KEY | `FOREIGN KEY (link_id) REFERENCES talkx_links(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_link_clicks_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_link_clicks_recipient_id_fkey | FOREIGN KEY | `FOREIGN KEY (recipient_id) REFERENCES talkx_recipients(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_link_clicks_link | btree | link_id, clicked_at | não | sim |  | `CREATE INDEX idx_talkx_link_clicks_link ON public.talkx_link_clicks USING btree (link_id, clicked_at DESC)` |
| idx_talkx_link_clicks_link_id | btree | link_id | não | sim |  | `CREATE INDEX idx_talkx_link_clicks_link_id ON public.talkx_link_clicks USING btree (link_id)` |
| idx_talkx_link_clicks_recipient_id | btree | recipient_id | não | sim |  | `CREATE INDEX idx_talkx_link_clicks_recipient_id ON public.talkx_link_clicks USING btree (recipient_id)` |
| talkx_link_clicks_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_link_clicks_pkey ON public.talkx_link_clicks USING btree (id)` |


## Policies (RLS)

### `Users can view clicks of own campaigns`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((link_id IN ( SELECT tl.id    FROM (talkx_links tl      JOIN talkx_campaigns tc ON ((tc.id = tl.campaign_id)))   WHERE (tc.created_by = ( SELECT p.id            FROM profiles p           WHERE (p.user_id = auth.uid())          LIMIT 1)))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
