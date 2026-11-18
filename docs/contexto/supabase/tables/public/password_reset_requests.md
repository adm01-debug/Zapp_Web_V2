# public.password_reset_requests

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | não |
| replica identity | full |
| vem de extensão | não |
| usada por views | public.password_reset_requests_safe |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `email` | `text` | não |  |  |  |
| 4 | `reason` | `text` | sim |  |  |  |
| 5 | `status` | `text` | não | `'pending'::text` |  |  |
| 6 | `reviewed_by` | `uuid` | sim |  |  |  |
| 7 | `reviewed_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `rejection_reason` | `text` | sim |  |  |  |
| 10 | `token_expires_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `ip_address` | `text` | sim |  |  |  |
| 12 | `user_agent` | `text` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| password_reset_requests_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| password_reset_requests_reviewed_by_fkey | FOREIGN KEY | `FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |
| password_reset_requests_status_check | CHECK | `CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))` |  |  | sim |
| password_reset_requests_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_password_reset_requests_reviewed_by | btree | reviewed_by | não | sim |  | `CREATE INDEX idx_password_reset_requests_reviewed_by ON public.password_reset_requests USING btree (reviewed_by)` |
| idx_password_reset_requests_status | btree | status | não | sim |  | `CREATE INDEX idx_password_reset_requests_status ON public.password_reset_requests USING btree (status)` |
| idx_password_reset_requests_user | btree | user_id | não | sim |  | `CREATE INDEX idx_password_reset_requests_user ON public.password_reset_requests USING btree (user_id)` |
| password_reset_requests_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX password_reset_requests_pkey ON public.password_reset_requests USING btree (id)` |


## Policies (RLS)

### `Admins can delete password reset requests`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can update reset requests without token access`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK | `has_role(auth.uid(), 'admin'::app_role)` |

### `Admins can view reset requests`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(auth.uid(), 'admin'::app_role)` |
| WITH CHECK |  |

### `Anon can file a password reset request`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | anon |
| USING |  |
| WITH CHECK | `((user_id IS NOT NULL) AND (status = 'pending'::text) AND (reviewed_by IS NULL) AND (reviewed_at IS NULL) AND (rejection_reason IS NULL) AND (token_expires_at IS NULL))` |

### `Users can request own password reset`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| sanitize_reset_request_trigger | BEFORE | INSERT | ROW | enabled | public.sanitize_reset_request |
| trg_rate_limit_reset | BEFORE | INSERT | ROW | enabled | public.rate_limit_reset_requests |


## Grants

_nenhum_
