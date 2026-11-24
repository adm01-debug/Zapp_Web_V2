# public.contact_custom_fields

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.contact_custom_fields (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 field_name text NOT NULL
4 field_value text NULLABLE
5 field_type text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
contact_custom_fields_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
contact_custom_fields_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Authenticated can delete own custom fields" [command=DELETE; roles=authenticated; PERMISSIVE]
"Authenticated can update own custom fields" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Authenticated can view custom fields" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can insert custom fields for assigned contacts" [command=INSERT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `field_name` | `text` | não |  |  |  |
| 4 | `field_value` | `text` | sim |  |  |  |
| 5 | `field_type` | `text` | não | `'text'::text` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_custom_fields_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| contact_custom_fields_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_custom_fields_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_custom_fields_pkey ON public.contact_custom_fields USING btree (id)` |
| idx_contact_custom_fields_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_contact_custom_fields_contact_id ON public.contact_custom_fields USING btree (contact_id)` |
| idx_contact_custom_fields_unique | btree | contact_id, field_name | sim | sim |  | `CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields USING btree (contact_id, field_name)` |


## Policies (RLS)

### `Authenticated can delete own custom fields`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Authenticated can update own custom fields`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Authenticated can view custom fields`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Users can insert custom fields for assigned contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_contact_custom_fields_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
