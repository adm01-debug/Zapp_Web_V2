# public.warroom_alerts

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `alert_type` | `text` | não | `'warning'::text` |  |  |
| 3 | `title` | `text` | não |  |  |  |
| 4 | `message` | `text` | não |  |  |  |
| 5 | `source` | `text` | sim |  |  |  |
| 6 | `is_read` | `boolean` | sim | `false` |  |  |
| 7 | `dismissed_by` | `uuid` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 9 | `dedupe_key` | `text` | sim |  |  | R2-MOD-074: chave idempotente do incidente que originou o alerta (ux_warroom_alerts_dedupe_key, unico parcial). Reexecucao do mesmo incidente cai em 23505 e nao gera novo alerta. |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| warroom_alerts_dismissed_by_fkey | FOREIGN KEY | `FOREIGN KEY (dismissed_by) REFERENCES profiles(id)` | NO ACTION | NO ACTION | sim |
| warroom_alerts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_warroom_alerts_dismissed_by | btree | dismissed_by | não | sim |  | `CREATE INDEX idx_warroom_alerts_dismissed_by ON public.warroom_alerts USING btree (dismissed_by)` |
| ux_warroom_alerts_dedupe_key | btree | dedupe_key | sim | sim | `(dedupe_key IS NOT NULL)` | `CREATE UNIQUE INDEX ux_warroom_alerts_dedupe_key ON public.warroom_alerts USING btree (dedupe_key) WHERE (dedupe_key IS NOT NULL)` |
| warroom_alerts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX warroom_alerts_pkey ON public.warroom_alerts USING btree (id)` |


## Policies (RLS)

### `Admins can delete warroom alerts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can insert alerts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can update alerts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK |  |

### `Admins can view warroom alerts`

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
