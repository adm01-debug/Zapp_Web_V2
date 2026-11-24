# public.whatsapp_flows

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.whatsapp_flows (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 description text NULLABLE
4 flow_json jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 screens jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 status text NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 whatsapp_flow_id text NULLABLE
8 whatsapp_connection_id uuid NULLABLE
9 created_by uuid NULLABLE
10 published_at timestamp with time zone NULLABLE
11 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
12 updated_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
whatsapp_flows_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
whatsapp_flows_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL
whatsapp_flows_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage whatsapp flows" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated can view whatsapp flows" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `flow_json` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 5 | `screens` | `jsonb` | não | `'[]'::jsonb` |  |  |
| 6 | `status` | `text` | sim | `'draft'::text` |  |  |
| 7 | `whatsapp_flow_id` | `text` | sim |  |  |  |
| 8 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `published_at` | `timestamp with time zone` | sim |  |  |  |
| 11 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_flows_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| whatsapp_flows_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_flows_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whatsapp_flows_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_whatsapp_flows_created_by ON public.whatsapp_flows USING btree (created_by)` |
| idx_whatsapp_flows_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_whatsapp_flows_whatsapp_connection_id ON public.whatsapp_flows USING btree (whatsapp_connection_id)` |
| whatsapp_flows_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_flows_pkey ON public.whatsapp_flows USING btree (id)` |


## Policies (RLS)

### `Admins can manage whatsapp flows`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated can view whatsapp flows`

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
| update_whatsapp_flows_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
