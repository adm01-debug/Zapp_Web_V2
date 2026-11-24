# public.sales_pipeline_stages

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.sales_pipeline_stages (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 color text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 "position" integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 is_active boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
sales_pipeline_stages_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage pipeline stages" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated can view pipeline stages" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `color` | `text` | não | `'#3b82f6'::text` |  |  |
| 4 | `position` | `integer` | não | `0` |  |  |
| 5 | `is_active` | `boolean` | sim | `true` |  |  |
| 6 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| sales_pipeline_stages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.sales_deals | sales_deals_stage_id_fkey | stage_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| sales_pipeline_stages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX sales_pipeline_stages_pkey ON public.sales_pipeline_stages USING btree (id)` |


## Policies (RLS)

### `Admins can manage pipeline stages`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated can view pipeline stages`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_pipeline_stages_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
