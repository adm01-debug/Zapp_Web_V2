# public.campaign_ab_variants

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `campaign_id` | `uuid` | não |  |  |  |
| 3 | `variant_name` | `text` | não | `'A'::text` |  |  |
| 4 | `message_content` | `text` | não |  |  |  |
| 5 | `media_url` | `text` | sim |  |  |  |
| 6 | `send_count` | `integer` | sim | `0` |  |  |
| 7 | `delivered_count` | `integer` | sim | `0` |  |  |
| 8 | `read_count` | `integer` | sim | `0` |  |  |
| 9 | `response_count` | `integer` | sim | `0` |  |  |
| 10 | `is_winner` | `boolean` | sim | `false` |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| campaign_ab_variants_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| campaign_ab_variants_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| campaign_ab_variants_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX campaign_ab_variants_pkey ON public.campaign_ab_variants USING btree (id)` |
| idx_campaign_ab_variants_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_campaign_ab_variants_campaign_id ON public.campaign_ab_variants USING btree (campaign_id)` |


## Policies (RLS)

### `Authenticated can view AB variants`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(auth.uid() IS NOT NULL)` |
| WITH CHECK |  |

### `Campaign owners or admins can delete AB variants`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM campaigns c   WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |

### `Campaign owners or admins can insert AB variants`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(EXISTS ( SELECT 1    FROM campaigns c   WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |

### `Campaign owners or admins can update AB variants`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM campaigns c   WHERE ((c.id = campaign_ab_variants.campaign_id) AND ((c.created_by = get_profile_id_for_user(auth.uid())) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
