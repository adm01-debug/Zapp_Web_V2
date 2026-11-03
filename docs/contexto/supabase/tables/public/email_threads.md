# public.email_threads

> Threads do Gmail sincronizadas por conta (gmail_accounts), com contato associado, atribuicao e remetente da ultima mensagem.

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `gmail_account_id` | `uuid` | não |  |  |  |
| 3 | `gmail_thread_id` | `text` | não |  |  |  |
| 4 | `contact_id` | `uuid` | sim |  |  |  |
| 5 | `subject` | `text` | não | `''::text` |  |  |
| 6 | `snippet` | `text` | não | `''::text` |  |  |
| 7 | `label_ids` | `text[]` | não | `'{}'::text[]` |  |  |
| 8 | `message_count` | `integer` | não | `0` |  |  |
| 9 | `is_unread` | `boolean` | não | `true` |  |  |
| 10 | `is_starred` | `boolean` | não | `false` |  |  |
| 11 | `is_important` | `boolean` | não | `false` |  |  |
| 12 | `last_message_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `assigned_to` | `uuid` | sim |  |  |  |
| 14 | `status` | `text` | não | `'open'::text` |  |  |
| 15 | `priority` | `text` | não | `'medium'::text` |  |  |
| 16 | `tags` | `text[]` | não | `'{}'::text[]` |  |  |
| 17 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 18 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |
| 19 | `last_from_name` | `text` | sim |  |  |  |
| 20 | `last_from_address` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| email_threads_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| email_threads_gmail_account_id_fkey | FOREIGN KEY | `FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| email_threads_gmail_account_id_gmail_thread_id_key | UNIQUE | `UNIQUE (gmail_account_id, gmail_thread_id)` |  |  | sim |
| email_threads_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.email_messages | email_messages_thread_id_fkey | thread_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| email_threads_gmail_account_id_gmail_thread_id_key | btree | gmail_account_id, gmail_thread_id | sim | sim |  | `CREATE UNIQUE INDEX email_threads_gmail_account_id_gmail_thread_id_key ON public.email_threads USING btree (gmail_account_id, gmail_thread_id)` |
| email_threads_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX email_threads_pkey ON public.email_threads USING btree (id)` |
| idx_email_threads_account_date | btree | gmail_account_id, last_message_at | não | sim |  | `CREATE INDEX idx_email_threads_account_date ON public.email_threads USING btree (gmail_account_id, last_message_at DESC)` |
| idx_email_threads_contact | btree | contact_id | não | sim |  | `CREATE INDEX idx_email_threads_contact ON public.email_threads USING btree (contact_id)` |
| idx_email_threads_gmail_account_id | btree | gmail_account_id | não | sim |  | `CREATE INDEX idx_email_threads_gmail_account_id ON public.email_threads USING btree (gmail_account_id)` |
| idx_email_threads_last_message | btree | last_message_at | não | sim |  | `CREATE INDEX idx_email_threads_last_message ON public.email_threads USING btree (last_message_at DESC)` |


## Policies (RLS)

### `Users can delete threads of own accounts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |

### `Users can update threads of own accounts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |

### `Users can view threads of own accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_threads.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_email_threads_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
