# public.talkx_blacklist

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | sim |
| replica identity | default |
| vem de extensão | não |
| usada por views | public.talkx_campaign_optouts |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `reason` | `text` | sim | `'Solicitação do cliente'::text` |  |  |
| 4 | `blocked_by` | `uuid` | sim |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `origin` | `text` | não | `'manual'::text` |  |  |
| 7 | `campaign_id` | `uuid` | sim |  |  |  |
| 8 | `phone` | `text` | sim |  |  |  |
| 9 | `reason_code` | `text` | sim |  |  |  |
| 10 | `expires_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `source_message_id` | `uuid` | sim |  |  |  |
| 12 | `removed_by` | `uuid` | sim |  |  |  |
| 13 | `removed_at` | `timestamp with time zone` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_blacklist_blocked_by_fkey | FOREIGN KEY | `FOREIGN KEY (blocked_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_blacklist_campaign_id_fkey | FOREIGN KEY | `FOREIGN KEY (campaign_id) REFERENCES talkx_campaigns(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_blacklist_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| talkx_blacklist_origin_check | CHECK | `CHECK (origin = ANY (ARRAY['manual'::text, 'optout'::text, 'system'::text, 'lgpd'::text, 'list'::text, 'auto_optout'::text]))` |  |  | sim |
| talkx_blacklist_phone_or_contact | CHECK | `CHECK (phone IS NOT NULL OR contact_id IS NOT NULL)` |  |  | sim |
| talkx_blacklist_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| talkx_blacklist_reason_code_fk | FOREIGN KEY | `FOREIGN KEY (reason_code) REFERENCES talkx_suppression_reasons(code) ON UPDATE CASCADE ON DELETE RESTRICT` | RESTRICT | CASCADE | sim |
| talkx_blacklist_removed_by_fkey | FOREIGN KEY | `FOREIGN KEY (removed_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_blacklist_source_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (source_message_id) REFERENCES messages(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_blacklist_blocked_by | btree | blocked_by | não | sim |  | `CREATE INDEX idx_talkx_blacklist_blocked_by ON public.talkx_blacklist USING btree (blocked_by)` |
| idx_talkx_blacklist_campaign_id | btree | campaign_id | não | sim |  | `CREATE INDEX idx_talkx_blacklist_campaign_id ON public.talkx_blacklist USING btree (campaign_id)` |
| idx_talkx_blacklist_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_talkx_blacklist_contact_id ON public.talkx_blacklist USING btree (contact_id)` |
| idx_talkx_blacklist_created_at_desc | btree | created_at | não | sim |  | `CREATE INDEX idx_talkx_blacklist_created_at_desc ON public.talkx_blacklist USING btree (created_at DESC)` |
| idx_talkx_blacklist_expires_at | btree | expires_at | não | sim | `(expires_at IS NOT NULL)` | `CREATE INDEX idx_talkx_blacklist_expires_at ON public.talkx_blacklist USING btree (expires_at) WHERE (expires_at IS NOT NULL)` |
| idx_talkx_blacklist_phone | btree | phone | não | sim | `(phone IS NOT NULL)` | `CREATE INDEX idx_talkx_blacklist_phone ON public.talkx_blacklist USING btree (phone) WHERE (phone IS NOT NULL)` |
| idx_talkx_blacklist_removed_by | btree | removed_by | não | sim |  | `CREATE INDEX idx_talkx_blacklist_removed_by ON public.talkx_blacklist USING btree (removed_by)` |
| idx_talkx_blacklist_source_message_id | btree | source_message_id | não | sim |  | `CREATE INDEX idx_talkx_blacklist_source_message_id ON public.talkx_blacklist USING btree (source_message_id)` |
| talkx_blacklist_contact_active_unique | btree | contact_id | sim | sim | `((contact_id IS NOT NULL) AND (removed_at IS NULL))` | `CREATE UNIQUE INDEX talkx_blacklist_contact_active_unique ON public.talkx_blacklist USING btree (contact_id) WHERE ((contact_id IS NOT NULL) AND (removed_at IS NULL))` |
| talkx_blacklist_phone_active_unique | btree | phone | sim | sim | `((phone IS NOT NULL) AND (removed_at IS NULL))` | `CREATE UNIQUE INDEX talkx_blacklist_phone_active_unique ON public.talkx_blacklist USING btree (phone) WHERE ((phone IS NOT NULL) AND (removed_at IS NULL))` |
| talkx_blacklist_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_blacklist_pkey ON public.talkx_blacklist USING btree (id)` |


## Policies (RLS)

### `Admins can add to blacklist`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can remove from blacklist`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Only admins can view blacklist`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `talkx_blacklist_no_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `talkx_blacklist_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_talkx_blacklist_reason_active | BEFORE | INSERT OR UPDATE | ROW | enabled | public.talkx_blacklist_reason_active_guard |


## Grants

_nenhum_
