# public.multiplix_voice_grants

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | sim |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `voice_id` | `text` | não |  |  |  |
| 3 | `titular` | `text` | não |  |  |  |
| 4 | `roles` | `app_role[]` | sim |  |  |  |
| 5 | `perfis` | `uuid[]` | sim |  |  |  |
| 6 | `origem` | `text` | sim |  |  |  |
| 7 | `revoked_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `created_by` | `uuid` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| multiplix_voice_grants_alvo_obrigatorio | CHECK | `CHECK (roles IS NOT NULL OR perfis IS NOT NULL)` |  |  | sim |
| multiplix_voice_grants_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_multiplix_voice_grants_voice_id | btree | voice_id | não | sim | `(revoked_at IS NULL)` | `CREATE INDEX idx_multiplix_voice_grants_voice_id ON public.multiplix_voice_grants USING btree (voice_id) WHERE (revoked_at IS NULL)` |
| multiplix_voice_grants_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX multiplix_voice_grants_pkey ON public.multiplix_voice_grants USING btree (id)` |


## Policies (RLS)

### `Admins read every voice grant`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Callers read their own voice grants`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((revoked_at IS NULL) AND (((roles IS NOT NULL) AND (EXISTS ( SELECT 1    FROM unnest(multiplix_voice_grants.roles) r(r)   WHERE has_role(auth.uid(), r.r)))) OR ((perfis IS NOT NULL) AND (EXISTS ( SELECT 1    FROM profiles p   WHERE ((p.user_id = auth.uid()) AND (p.id = ANY (multiplix_voice_grants.perfis))))))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
