# public.email_messages

> Mensagens de e-mail de uma email_thread (corpo texto/HTML sanitizado no front por src/lib/emailHtml.ts).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 2 |
| realtime (publication) | sim |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `thread_id` | `uuid` | não |  |  |  |
| 3 | `gmail_message_id` | `text` | não |  |  |  |
| 4 | `gmail_account_id` | `uuid` | não |  |  |  |
| 5 | `from_address` | `text` | não | `''::text` |  |  |
| 6 | `from_name` | `text` | sim |  |  |  |
| 7 | `to_addresses` | `text[]` | não | `'{}'::text[]` |  |  |
| 8 | `cc_addresses` | `text[]` | não | `'{}'::text[]` |  |  |
| 9 | `bcc_addresses` | `text[]` | não | `'{}'::text[]` |  |  |
| 10 | `reply_to_address` | `text` | sim |  |  |  |
| 11 | `subject` | `text` | não | `''::text` |  |  |
| 12 | `body_text` | `text` | não | `''::text` |  |  |
| 13 | `body_html` | `text` | não | `''::text` |  |  |
| 14 | `snippet` | `text` | não | `''::text` |  |  |
| 15 | `label_ids` | `text[]` | não | `'{}'::text[]` |  |  |
| 16 | `is_read` | `boolean` | não | `false` |  |  |
| 17 | `is_starred` | `boolean` | não | `false` |  |  |
| 18 | `has_attachments` | `boolean` | não | `false` |  |  |
| 19 | `in_reply_to` | `text` | sim |  |  |  |
| 20 | `references_header` | `text` | sim |  |  |  |
| 21 | `internal_date` | `timestamp with time zone` | não | `now()` |  |  |
| 22 | `direction` | `text` | não | `'inbound'::text` |  |  |
| 23 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 24 | `message_id_header` | `text` | sim |  |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| email_messages_direction_check | CHECK | `CHECK (direction = ANY (ARRAY['inbound'::text, 'outbound'::text]))` |  |  | sim |
| email_messages_from_format | CHECK | `CHECK (from_address ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text)` |  |  | sim |
| email_messages_gmail_account_id_fkey | FOREIGN KEY | `FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| email_messages_gmail_account_id_gmail_message_id_key | UNIQUE | `UNIQUE (gmail_account_id, gmail_message_id)` |  |  | sim |
| email_messages_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| email_messages_thread_id_fkey | FOREIGN KEY | `FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.email_attachments | email_attachments_email_message_id_fkey | email_message_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| email_messages_body_text_trgm_idx | gin | body_text | não | sim |  | `CREATE INDEX email_messages_body_text_trgm_idx ON public.email_messages USING gin (body_text extensions.gin_trgm_ops)` |
| email_messages_gmail_account_id_gmail_message_id_key | btree | gmail_account_id, gmail_message_id | sim | sim |  | `CREATE UNIQUE INDEX email_messages_gmail_account_id_gmail_message_id_key ON public.email_messages USING btree (gmail_account_id, gmail_message_id)` |
| email_messages_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX email_messages_pkey ON public.email_messages USING btree (id)` |
| idx_email_messages_date | btree | internal_date | não | sim |  | `CREATE INDEX idx_email_messages_date ON public.email_messages USING btree (internal_date DESC)` |
| idx_email_messages_gmail_account_id | btree | gmail_account_id | não | sim |  | `CREATE INDEX idx_email_messages_gmail_account_id ON public.email_messages USING btree (gmail_account_id)` |
| idx_email_messages_thread_date | btree | thread_id, internal_date | não | sim |  | `CREATE INDEX idx_email_messages_thread_date ON public.email_messages USING btree (thread_id, internal_date)` |
| idx_email_messages_thread_id | btree | thread_id | não | sim |  | `CREATE INDEX idx_email_messages_thread_id ON public.email_messages USING btree (thread_id)` |


## Policies (RLS)

### `Users can update messages of own accounts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |

### `Users can view messages of own accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_messages.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_sync_thread_last_sender | AFTER | INSERT OR UPDATE | ROW | enabled | public.sync_thread_last_sender |


## Grants

_nenhum_
