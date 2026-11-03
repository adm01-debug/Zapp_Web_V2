# public.copilot_conversation_scores

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
| 1 | `conversation_id` | `uuid` | não |  |  |  |
| 2 | `score` | `integer` | não |  |  |  |
| 3 | `scored_by` | `uuid` | não |  |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_conversation_scores_pkey | PRIMARY KEY | `PRIMARY KEY (conversation_id)` |  |  | sim |
| copilot_conversation_scores_score_check | CHECK | `CHECK (score >= 1 AND score <= 5)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_conversation_scores_pkey | btree | conversation_id | sim | sim |  | `CREATE UNIQUE INDEX copilot_conversation_scores_pkey ON public.copilot_conversation_scores USING btree (conversation_id)` |


## Policies (RLS)

### `copilot_conversation_scores_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `true` |

### `copilot_conversation_scores_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `copilot_conversation_scores_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
