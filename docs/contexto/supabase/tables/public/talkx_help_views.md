# public.talkx_help_views

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
| 1 | `id` | `bigint` | não |  | a |  |
| 2 | `article_id` | `text` | não |  |  |  |
| 3 | `user_id` | `uuid` | não | `auth.uid()` |  |  |
| 4 | `viewed_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_help_views_article_id_check | CHECK | `CHECK (length(article_id) >= 1 AND length(article_id) <= 200)` |  |  | sim |
| talkx_help_views_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_talkx_help_views_viewed_at_article | btree | viewed_at, article_id | não | sim |  | `CREATE INDEX idx_talkx_help_views_viewed_at_article ON public.talkx_help_views USING btree (viewed_at DESC, article_id)` |
| talkx_help_views_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX talkx_help_views_pkey ON public.talkx_help_views USING btree (id)` |


## Policies (RLS)

### `talkx_help_views_insert_own`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = auth.uid())` |

### `talkx_help_views_select_own`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = auth.uid())` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
