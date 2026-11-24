# public.copilot_outcomes

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_outcomes (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 conversation_id uuid NOT NULL
3 contact_id uuid NOT NULL
4 seller_id uuid NOT NULL
5 outcome text NOT NULL
6 deal_value numeric NULLABLE
7 segment text NULLABLE
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_outcomes_outcome_check: CHECK (outcome = ANY (ARRAY['closed'::text, 'lost'::text]))
copilot_outcomes_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_outcomes_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_outcomes_select [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `conversation_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `seller_id` | `uuid` | não |  |  |  |
| 5 | `outcome` | `text` | não |  |  |  |
| 6 | `deal_value` | `numeric` | sim |  |  |  |
| 7 | `segment` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_outcomes_outcome_check | CHECK | `CHECK (outcome = ANY (ARRAY['closed'::text, 'lost'::text]))` |  |  | sim |
| copilot_outcomes_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_outcomes_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_outcomes_pkey ON public.copilot_outcomes USING btree (id)` |


## Policies (RLS)

### `copilot_outcomes_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(seller_id = ( SELECT auth.uid() AS uid))` |

### `copilot_outcomes_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(seller_id = ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
