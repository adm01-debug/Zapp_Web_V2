# public.ai_conversation_tags

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.ai_conversation_tags (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 tag_name text NOT NULL
4 confidence numeric NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 source text NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
ai_conversation_tags_source_known: CHECK (source IS NULL OR (source = ANY (ARRAY['ai'::text, 'human'::text, 'manual'::text])))
ai_conversation_tags_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id)
ai_conversation_tags_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete ai tags" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can update ai tags" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Agents can delete tags on assigned contacts" [command=DELETE; roles=authenticated; PERMISSIVE]
"Authenticated can view ai tags" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can insert ai tags for assigned contacts" [command=INSERT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 5 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `tag_name` | `text` | não |  |  |  |
| 4 | `confidence` | `numeric` | sim | `0.0` |  |  |
| 5 | `source` | `text` | sim | `'ai'::text` |  |  |
| 6 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| ai_conversation_tags_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| ai_conversation_tags_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| ai_conversation_tags_source_known | CHECK | `CHECK (source IS NULL OR (source = ANY (ARRAY['ai'::text, 'human'::text, 'manual'::text])))` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| ai_conversation_tags_contact_tag_uidx | btree | contact_id, tag_name | sim | sim |  | `CREATE UNIQUE INDEX ai_conversation_tags_contact_tag_uidx ON public.ai_conversation_tags USING btree (contact_id, tag_name)` |
| ai_conversation_tags_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX ai_conversation_tags_pkey ON public.ai_conversation_tags USING btree (id)` |
| idx_ai_conversation_tags_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_ai_conversation_tags_contact_id ON public.ai_conversation_tags USING btree (contact_id)` |


## Policies (RLS)

### `Admins can delete ai tags`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Admins can update ai tags`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Agents can delete tags on assigned contacts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((EXISTS ( SELECT 1    FROM (contacts c      JOIN profiles p ON ((p.id = c.assigned_to)))   WHERE ((c.id = ai_conversation_tags.contact_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |

### `Authenticated can view ai tags`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_contact_visible_to_user(contact_id, ( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can insert ai tags for assigned contacts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT profiles.id            FROM profiles           WHERE (profiles.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |


## Triggers

_nenhum_


## Grants

_nenhum_
