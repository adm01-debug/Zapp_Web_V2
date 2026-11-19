# public.feature_flags

> Feature flags globais (key -> enabled). Leitura por qualquer usuario autenticado, escrita apenas admin via RLS. Consumido por useFeatureFlag no front.

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
| 1 | `key` | `text` | não |  |  |  |
| 2 | `enabled` | `boolean` | não | `false` |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `updated_by` | `uuid` | sim |  |  |  |
| 6 | `rollout_percentage` | `integer` | não | `100` |  | Percentual estável (0..100) do rollout. Avaliado por hash de (user_id \|\| key) mod 100 em public.evaluate_feature_flags. |
| 7 | `allowed_roles` | `text[]` | não | `'{}'::text[]` |  | Papéis (app_role::text) com acesso garantido. Vazio = todos os papéis passam pelo portão de papel. |
| 8 | `allowed_user_ids` | `uuid[]` | não | `'{}'::uuid[]` |  | UUIDs com acesso sempre garantido (vencem papel e percentual). NUNCA exposta ao cliente comum. |
| 9 | `blocked_user_ids` | `uuid[]` | não | `'{}'::uuid[]` |  | UUIDs sempre barrados (vencem permitidos). NUNCA exposta ao cliente comum. |
| 10 | `expires_at` | `timestamp with time zone` | sim |  |  | Quando preenchida no passado, a flag deixa de valer. NULL = sem expiração. |
| 11 | `metadata` | `jsonb` | não | `'{}'::jsonb` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| feature_flags_key_check | CHECK | `CHECK (key ~ '^[a-z0-9][a-z0-9_.-]{0,63}$'::text)` |  |  | sim |
| feature_flags_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |
| feature_flags_rollout_percentage_check | CHECK | `CHECK (rollout_percentage >= 0 AND rollout_percentage <= 100)` |  |  | sim |
| feature_flags_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| feature_flags_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX feature_flags_pkey ON public.feature_flags USING btree (key)` |
| idx_feature_flags_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_feature_flags_updated_by ON public.feature_flags USING btree (updated_by)` |


## Policies (RLS)

### `feature_flags_delete_admin`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK |  |

### `feature_flags_insert_admin`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin(auth.uid())` |

### `feature_flags_select_admin_supervisor`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `feature_flags_update_admin`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK | `is_admin(auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| feature_flags_set_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
