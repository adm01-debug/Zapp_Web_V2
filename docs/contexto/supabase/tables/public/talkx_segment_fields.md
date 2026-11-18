# public.talkx_segment_fields

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `field` | `text` | não |  |  |  |
| 2 | `category` | `text` | não |  |  |  |
| 3 | `source` | `text` | não | `'contacts'::text` |  |  |
| 4 | `expr` | `text` | não |  |  |  |
| 5 | `kind` | `text` | não |  |  |  |
| 6 | `ops` | `text[]` | não |  |  |  |
| 7 | `enabled` | `boolean` | não | `true` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_segment_fields_kind_check | CHECK | `CHECK (kind = ANY (ARRAY['text'::text, 'array'::text, 'number'::text, 'date'::text, 'enum'::text, 'uuid'::text]))` |  |  | sim |
| talkx_segment_fields_pkey | PRIMARY KEY | `PRIMARY KEY (field)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_segment_fields_pkey | btree | field | sim | sim |  | `CREATE UNIQUE INDEX talkx_segment_fields_pkey ON public.talkx_segment_fields USING btree (field)` |


## Policies (RLS)

### `talkx_segment_fields_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `talkx_segment_fields_service_role_write`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | service_role |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
