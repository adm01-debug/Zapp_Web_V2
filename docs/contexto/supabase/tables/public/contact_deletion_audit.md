# public.contact_deletion_audit

> Trilha append-only de exclusao/restauracao/purge de contato. Gravada por trigger em public.contacts; escrita so via SECURITY DEFINER; leitura so admin/supervisor.

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
| 1 | `id` | `bigint` | não |  | a |  |
| 2 | `contact_id` | `uuid` | não |  |  | id de public.contacts no momento do evento. Sem FK de proposito: purga nao pode apagar/rebaixar a trilha. |
| 3 | `operation` | `text` | não |  |  | delete = soft-delete (NULL -> ts); restore = ts -> NULL; update_marker = ts trocado por outro ts (adulteracao); purge = DELETE fisico. |
| 4 | `deleted_at_from` | `timestamp with time zone` | sim |  |  | contacts.deleted_at ANTES da mudanca (NULL = contato vivo). Valor gravado pelo CHAMADOR (relogio do cliente) — nao serve como tempo confiavel; use performed_at. |
| 5 | `deleted_at_to` | `timestamp with time zone` | sim |  |  | contacts.deleted_at DEPOIS da mudanca (NULL = contato vivo). Mesma ressalva de relogio do de-from. |
| 6 | `performed_by` | `uuid` | sim |  |  | auth.uid() (claim `sub`) do chamador. NULL em TODO purge (DELETE fisico): quem apaga e service_role/postgres/dashboard_user e nenhum carrega `sub`. A autoria desses casos esta em performed_by_db_role. |
| 7 | `performed_by_profile` | `uuid` | sim |  |  | public.profiles.id correspondente a performed_by, resolvido na hora do evento. |
| 8 | `performed_by_db_role` | `text` | não | `SESSION_USER` |  | session_user da conexao que executou a mudanca (R3). Sempre preenchido, inclusive no purge — e o unico autor da trilha quando performed_by e NULL. |
| 9 | `performed_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_deletion_audit_operation_check | CHECK | `CHECK (operation = ANY (ARRAY['delete'::text, 'restore'::text, 'update_marker'::text, 'purge'::text]))` |  |  | sim |
| contact_deletion_audit_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| contact_deletion_audit_shape_check | CHECK | `CHECK (operation = 'delete'::text AND deleted_at_from IS NULL AND deleted_at_to IS NOT NULL OR operation = 'restore'::text AND deleted_at_from IS NOT NULL AND deleted_at_to IS NULL OR operation = 'purge'::text AND NOT deleted_at_from IS DISTINCT FROM deleted_at_to OR operation = 'update_marker'::text AND deleted_at_from IS NOT NULL AND deleted_at_to IS NOT NULL AND deleted_at_from IS DISTINCT FROM deleted_at_to)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_deletion_audit_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_deletion_audit_pkey ON public.contact_deletion_audit USING btree (id)` |
| idx_contact_deletion_audit_contact | btree | contact_id, performed_at | não | sim |  | `CREATE INDEX idx_contact_deletion_audit_contact ON public.contact_deletion_audit USING btree (contact_id, performed_at DESC)` |
| idx_contact_deletion_audit_recent | btree | performed_at | não | sim |  | `CREATE INDEX idx_contact_deletion_audit_recent ON public.contact_deletion_audit USING btree (performed_at DESC)` |


## Policies (RLS)

### `contact_deletion_audit_block_authenticated_delete`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK |  |

### `contact_deletion_audit_block_authenticated_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |

### `contact_deletion_audit_block_authenticated_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `false` |
| WITH CHECK | `false` |

### `contact_deletion_audit_select_admin_supervisor`

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
