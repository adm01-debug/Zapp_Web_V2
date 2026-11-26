# public.whatsapp_templates

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.whatsapp_templates (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 category text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 language text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 content text NOT NULL
6 header_text text NULLABLE
7 footer_text text NULLABLE
8 buttons jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 variables text[] NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 whatsapp_connection_id uuid NULLABLE
12 created_by uuid NULLABLE
13 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
14 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
whatsapp_templates_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)
whatsapp_templates_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage templates" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated users can view templates" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `category` | `text` | não | `'utility'::text` |  |  |
| 4 | `language` | `text` | não | `'pt_BR'::text` |  |  |
| 5 | `content` | `text` | não |  |  |  |
| 6 | `header_text` | `text` | sim |  |  |  |
| 7 | `footer_text` | `text` | sim |  |  |  |
| 8 | `buttons` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 9 | `variables` | `text[]` | sim | `'{}'::text[]` |  |  |
| 10 | `status` | `text` | não | `'draft'::text` |  |  |
| 11 | `whatsapp_connection_id` | `uuid` | sim |  |  |  |
| 12 | `created_by` | `uuid` | sim |  |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 14 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| whatsapp_templates_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| whatsapp_templates_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_whatsapp_templates_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_whatsapp_templates_whatsapp_connection_id ON public.whatsapp_templates USING btree (whatsapp_connection_id)` |
| whatsapp_templates_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX whatsapp_templates_pkey ON public.whatsapp_templates USING btree (id)` |


## Policies (RLS)

### `Admins can insert templates`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage templates`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Authenticated users can view templates`

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
| update_whatsapp_templates_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
