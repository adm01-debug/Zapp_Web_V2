# public.talkx_suppression_reasons

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `code` | `text` | não |  |  |  |
| 2 | `label` | `text` | não |  |  |  |
| 3 | `tone` | `text` | não | `'informativo'::text` |  |  |
| 4 | `is_system` | `boolean` | não | `false` |  |  |
| 5 | `active` | `boolean` | não | `true` |  |  |
| 6 | `sort_order` | `integer` | não | `100` |  |  |
| 7 | `created_by` | `uuid` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_suppression_reasons_code_check | CHECK | `CHECK (code = lower(code) AND code ~ '^[a-z_]+$'::text)` |  |  | sim |
| talkx_suppression_reasons_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_suppression_reasons_pkey | PRIMARY KEY | `PRIMARY KEY (code)` |  |  | sim |
| talkx_suppression_reasons_tone_check | CHECK | `CHECK (tone = ANY (ARRAY['informativo'::text, 'alerta'::text, 'crítico'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.talkx_blacklist | talkx_blacklist_reason_code_fk | reason_code | RESTRICT |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_suppression_reasons_pkey | btree | code | sim | sim |  | `CREATE UNIQUE INDEX talkx_suppression_reasons_pkey ON public.talkx_suppression_reasons USING btree (code)` |


## Policies (RLS)

### `talkx_suppression_reasons_read`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `talkx_suppression_reasons_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `talkx_suppression_reasons_write`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| talkx_suppression_reasons_guard_trigger | BEFORE | INSERT OR UPDATE | ROW | enabled | public.talkx_suppression_reasons_guard |


## Grants

_nenhum_
