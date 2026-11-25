# public.contact_notes

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.contact_notes (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 author_id uuid NOT NULL
4 content text NOT NULL
5 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 category text NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 is_done boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 due_date timestamp with time zone NULLABLE
10 is_pinned boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
contact_notes_category_check: CHECK (category = ANY (ARRAY['note'::text, 'fact'::text, 'objection'::text, 'promise'::text]))
contact_notes_author_id_fkey: FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE
contact_notes_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
contact_notes_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
contact_notes_delete_policy [command=DELETE; roles=authenticated; PERMISSIVE]
contact_notes_insert_policy [command=INSERT; roles=authenticated; PERMISSIVE]
contact_notes_select_policy [command=SELECT; roles=authenticated; PERMISSIVE]
contact_notes_update_policy [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 3 | `author_id` | `uuid` | não |  |  |  |
| 4 | `content` | `text` | não |  |  |  |
| 5 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 6 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `category` | `text` | não | `'note'::text` |  |  |
| 8 | `is_done` | `boolean` | não | `false` |  |  |
| 9 | `due_date` | `timestamp with time zone` | sim |  |  |  |
| 10 | `is_pinned` | `boolean` | não | `false` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_notes_author_id_fkey | FOREIGN KEY | `FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| contact_notes_category_check | CHECK | `CHECK (category = ANY (ARRAY['note'::text, 'fact'::text, 'objection'::text, 'promise'::text]))` |  |  | sim |
| contact_notes_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| contact_notes_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_notes_pinned_idx | btree | contact_id, created_at, id | não | sim | `is_pinned` | `CREATE INDEX contact_notes_pinned_idx ON public.contact_notes USING btree (contact_id, created_at DESC, id DESC) WHERE is_pinned` |
| contact_notes_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_notes_pkey ON public.contact_notes USING btree (id)` |
| idx_contact_notes_author_id | btree | author_id | não | sim |  | `CREATE INDEX idx_contact_notes_author_id ON public.contact_notes USING btree (author_id)` |
| idx_contact_notes_contact_category | btree | contact_id, category | não | sim |  | `CREATE INDEX idx_contact_notes_contact_category ON public.contact_notes USING btree (contact_id, category)` |
| idx_contact_notes_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_contact_notes_contact_id ON public.contact_notes USING btree (contact_id)` |


## Policies (RLS)

### `contact_notes_delete_policy`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((author_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `contact_notes_insert_policy`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((author_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)))` |

### `contact_notes_select_policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `contact_notes_update_policy`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((author_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)))` |
| WITH CHECK | `((author_id = get_profile_id_for_user(( SELECT auth.uid() AS uid))) AND is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid)))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| guard_contact_note_identity | BEFORE | UPDATE | ROW | enabled | public.guard_contact_note_identity |
| update_contact_notes_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
