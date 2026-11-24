# public.conversation_memory

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.conversation_memory (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 facts jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 objections_handled jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 promises_made jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 pending_items jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 commercial_summary text NULLABLE
8 cumulative_summary text NULLABLE
9 updated_by uuid NULLABLE
10 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
conversation_memory_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
conversation_memory_updated_by_fkey: FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL
conversation_memory_pkey: PRIMARY KEY (id)
conversation_memory_contact_id_key: UNIQUE (contact_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Agents can insert memory for their contacts" [command=INSERT; roles=authenticated; PERMISSIVE]
"Agents can update memory for their contacts" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Agents or admins can view memory" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `facts` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 4 | `objections_handled` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 5 | `promises_made` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 6 | `pending_items` | `jsonb` | sim | `'[]'::jsonb` |  |  |
| 7 | `commercial_summary` | `text` | sim |  |  |  |
| 8 | `cumulative_summary` | `text` | sim |  |  |  |
| 9 | `updated_by` | `uuid` | sim |  |  |  |
| 10 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 11 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| conversation_memory_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| conversation_memory_contact_id_key | UNIQUE | `UNIQUE (contact_id)` |  |  | sim |
| conversation_memory_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| conversation_memory_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| conversation_memory_contact_id_key | btree | contact_id | sim | sim |  | `CREATE UNIQUE INDEX conversation_memory_contact_id_key ON public.conversation_memory USING btree (contact_id)` |
| conversation_memory_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX conversation_memory_pkey ON public.conversation_memory USING btree (id)` |
| idx_conversation_memory_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_conversation_memory_updated_by ON public.conversation_memory USING btree (updated_by)` |


## Policies (RLS)

### `Agents can insert memory for their contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid))` |

### `Agents can update memory for their contacts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Agents or admins can view memory`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_conversation_memory_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
