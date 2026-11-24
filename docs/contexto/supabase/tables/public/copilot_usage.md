# public.copilot_usage

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_usage (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 conversation_id uuid NOT NULL
3 seller_id uuid NOT NULL
4 tokens integer NOT NULL
5 estimated_cost_usd numeric NOT NULL
6 endpoint text NOT NULL
7 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_usage_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_usage_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_usage_select [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 3 | `seller_id` | `uuid` | não |  |  |  |
| 4 | `tokens` | `integer` | não |  |  |  |
| 5 | `estimated_cost_usd` | `numeric` | não |  |  |  |
| 6 | `endpoint` | `text` | não |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_usage_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_usage_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_usage_pkey ON public.copilot_usage USING btree (id)` |


## Policies (RLS)

### `copilot_usage_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `copilot_usage_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
