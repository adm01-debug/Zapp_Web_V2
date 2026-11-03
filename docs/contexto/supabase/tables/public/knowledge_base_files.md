# public.knowledge_base_files

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
| 2 | `article_id` | `uuid` | sim |  |  |  |
| 3 | `file_name` | `text` | não |  |  |  |
| 4 | `file_url` | `text` | não |  |  |  |
| 5 | `file_type` | `text` | sim |  |  |  |
| 6 | `file_size` | `integer` | sim |  |  |  |
| 7 | `processing_status` | `text` | sim | `'pending'::text` |  |  |
| 8 | `extracted_text` | `text` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| knowledge_base_files_article_id_fkey | FOREIGN KEY | `FOREIGN KEY (article_id) REFERENCES knowledge_base_articles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| knowledge_base_files_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_knowledge_base_files_article_id | btree | article_id | não | sim |  | `CREATE INDEX idx_knowledge_base_files_article_id ON public.knowledge_base_files USING btree (article_id)` |
| knowledge_base_files_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX knowledge_base_files_pkey ON public.knowledge_base_files USING btree (id)` |


## Policies (RLS)

### `Admins can manage kb files`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Users can view knowledge base files`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((article_id IN ( SELECT a.id    FROM knowledge_base_articles a   WHERE (a.is_published = true))) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
