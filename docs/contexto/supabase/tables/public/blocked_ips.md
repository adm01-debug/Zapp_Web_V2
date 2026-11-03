# public.blocked_ips

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
| 2 | `ip_address` | `text` | não |  |  |  |
| 3 | `reason` | `text` | não |  |  |  |
| 4 | `blocked_by` | `uuid` | sim |  |  |  |
| 5 | `blocked_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `expires_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `is_permanent` | `boolean` | sim | `false` |  |  |
| 8 | `request_count` | `integer` | sim | `0` |  |  |
| 9 | `last_attempt_at` | `timestamp with time zone` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| blocked_ips_blocked_by_fkey | FOREIGN KEY | `FOREIGN KEY (blocked_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| blocked_ips_ip_address_key | UNIQUE | `UNIQUE (ip_address)` |  |  | sim |
| blocked_ips_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| blocked_ips_ip_address_key | btree | ip_address | sim | sim |  | `CREATE UNIQUE INDEX blocked_ips_ip_address_key ON public.blocked_ips USING btree (ip_address)` |
| blocked_ips_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX blocked_ips_pkey ON public.blocked_ips USING btree (id)` |
| idx_blocked_ips_blocked_by | btree | blocked_by | não | sim |  | `CREATE INDEX idx_blocked_ips_blocked_by ON public.blocked_ips USING btree (blocked_by)` |
| idx_blocked_ips_expires | btree | expires_at | não | sim |  | `CREATE INDEX idx_blocked_ips_expires ON public.blocked_ips USING btree (expires_at)` |


## Policies (RLS)

### `Admins can delete blocked IPs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert blocked IPs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin(auth.uid())` |

### `Admins can update blocked IPs`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `Only admins can view blocked IPs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((EXISTS ( SELECT 1    FROM user_roles   WHERE ((user_roles.user_id = auth.uid()) AND (user_roles.role = 'admin'::app_role)))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
