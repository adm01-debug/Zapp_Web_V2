# public.talkx_optout_keywords

> Talk X (X029): palavras de opt-out configuraveis. match_mode exact = mensagem inteira; contains = palavra em qualquer posicao.

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
| 1 | `keyword` | `text` | não |  |  |  |
| 2 | `match_mode` | `text` | não | `'exact'::text` |  |  |
| 3 | `active` | `boolean` | não | `true` |  |  |
| 4 | `created_by` | `uuid` | sim |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_optout_keywords_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| talkx_optout_keywords_match_mode_check | CHECK | `CHECK (match_mode = ANY (ARRAY['exact'::text, 'contains'::text]))` |  |  | sim |
| talkx_optout_keywords_pkey | PRIMARY KEY | `PRIMARY KEY (keyword)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_optout_keywords_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_talkx_optout_keywords_created_by ON public.talkx_optout_keywords USING btree (created_by)` |
| talkx_optout_keywords_pkey | btree | keyword | sim | sim |  | `CREATE UNIQUE INDEX talkx_optout_keywords_pkey ON public.talkx_optout_keywords USING btree (keyword)` |


## Policies (RLS)

### `talkx_optout_keywords_admin_write`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK | `is_admin(auth.uid())` |

### `talkx_optout_keywords_select`

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
