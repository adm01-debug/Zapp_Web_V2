# public.copilot_objection_catalog

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_objection_catalog (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 conversation_id uuid NOT NULL
3 objection_type text NOT NULL
4 treatment_text text NOT NULL
5 submitted_by uuid NOT NULL
6 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_objection_catalog_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_objection_catalog_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_objection_catalog_select [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 3 | `objection_type` | `text` | não |  |  |  |
| 4 | `treatment_text` | `text` | não |  |  |  |
| 5 | `submitted_by` | `uuid` | não |  |  |  |
| 6 | `status` | `text` | não | `'pending_review'::text` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_objection_catalog_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_objection_catalog_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX copilot_objection_catalog_pkey ON public.copilot_objection_catalog USING btree (id)` |


## Policies (RLS)

### `copilot_objection_catalog_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(submitted_by = ( SELECT auth.uid() AS uid))` |

### `copilot_objection_catalog_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
