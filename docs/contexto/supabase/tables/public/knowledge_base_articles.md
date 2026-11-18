# public.knowledge_base_articles

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
| 2 | `title` | `text` | não |  |  |  |
| 3 | `content` | `text` | não |  |  |  |
| 4 | `category` | `text` | sim | `'general'::text` |  |  |
| 5 | `tags` | `text[]` | sim | `'{}'::text[]` |  |  |
| 6 | `is_published` | `boolean` | sim | `true` |  |  |
| 7 | `embedding_status` | `text` | sim | `'pending'::text` |  |  |
| 8 | `created_by` | `uuid` | sim |  |  |  |
| 9 | `updated_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 10 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 11 | `search_vector` | `tsvector` | sim | `((setweight(to_tsvector('portuguese'::regconfig, COALESCE(title, ''::text)), 'A'::"char") \|\| setweight(to_tsvector('portuguese'::regconfig, COALESCE(category, ''::text)), 'B'::"char")) \|\| setweight(to_tsvector('portuguese'::regconfig, COALESCE(content, ''::text)), 'C'::"char"))` | s |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| knowledge_base_articles_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| knowledge_base_articles_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.knowledge_base_files | knowledge_base_files_article_id_fkey | article_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_kb_articles_search | gin | search_vector | não | sim |  | `CREATE INDEX idx_kb_articles_search ON public.knowledge_base_articles USING gin (search_vector)` |
| idx_knowledge_base_articles_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_knowledge_base_articles_created_by ON public.knowledge_base_articles USING btree (created_by)` |
| knowledge_base_articles_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX knowledge_base_articles_pkey ON public.knowledge_base_articles USING btree (id)` |


## Policies (RLS)

### `Admins can manage knowledge base`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(auth.uid())` |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Authenticated can view knowledge base`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((is_published = true) OR is_admin_or_supervisor(auth.uid()))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_kb_articles_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
