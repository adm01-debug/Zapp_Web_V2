# public.contact_block_audit

> Trilha append-only do bloqueio/desbloqueio de contatos (substitui a etiqueta textual Bloqueado). Escrita apenas pelo trigger audit_contact_block_change.

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `operation` | `text` | não |  |  | block = NULL->ts; unblock = ts->NULL; update_marker = ts->ts (marcador reescrito). |
| 4 | `blocked_at_from` | `timestamp with time zone` | sim |  |  |  |
| 5 | `blocked_at_to` | `timestamp with time zone` | sim |  |  |  |
| 6 | `performed_by` | `uuid` | sim |  |  | auth.uid() (claim `sub`) do chamador. NULL no backfill da migration e nas escritas de papel sem `sub`. A autoria desses casos esta em performed_by_db_role. |
| 7 | `performed_by_profile` | `uuid` | sim |  |  | public.profiles.id correspondente a performed_by, resolvido na hora do evento. |
| 8 | `performed_by_db_role` | `text` | não | `SESSION_USER` |  | session_user da conexao que executou a mudanca. Sempre preenchido — e o unico autor da trilha quando performed_by e NULL. |
| 9 | `performed_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_block_audit_operation_check | CHECK | `CHECK (operation = ANY (ARRAY['block'::text, 'unblock'::text, 'update_marker'::text]))` |  |  | sim |
| contact_block_audit_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| contact_block_audit_shape_check | CHECK | `CHECK (operation = 'block'::text AND blocked_at_from IS NULL AND blocked_at_to IS NOT NULL OR operation = 'unblock'::text AND blocked_at_from IS NOT NULL AND blocked_at_to IS NULL OR operation = 'update_marker'::text AND blocked_at_from IS NOT NULL AND blocked_at_to IS NOT NULL AND blocked_at_from IS DISTINCT FROM blocked_at_to)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_block_audit_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_block_audit_pkey ON public.contact_block_audit USING btree (id)` |
| idx_contact_block_audit_contact | btree | contact_id, performed_at | não | sim |  | `CREATE INDEX idx_contact_block_audit_contact ON public.contact_block_audit USING btree (contact_id, performed_at DESC)` |
| idx_contact_block_audit_recent | btree | performed_at | não | sim |  | `CREATE INDEX idx_contact_block_audit_recent ON public.contact_block_audit USING btree (performed_at DESC)` |


## Policies (RLS)

### `contact_block_audit_block_authenticated_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `contact_block_audit_block_authenticated_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `contact_block_audit_block_authenticated_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK | `false` |

### `contact_block_audit_select_admin_supervisor`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
