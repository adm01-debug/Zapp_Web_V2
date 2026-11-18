# public.email_attachments

> Anexos de email_messages (unico por mensagem+attachment_id).

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
| 2 | `email_message_id` | `uuid` | não |  |  |  |
| 3 | `gmail_attachment_id` | `text` | não |  |  |  |
| 4 | `filename` | `text` | sim |  |  |  |
| 5 | `mime_type` | `text` | sim |  |  |  |
| 6 | `size_bytes` | `bigint` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| email_attachments_email_message_id_fkey | FOREIGN KEY | `FOREIGN KEY (email_message_id) REFERENCES email_messages(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| email_attachments_msg_att_key | UNIQUE | `UNIQUE (email_message_id, gmail_attachment_id)` |  |  | sim |
| email_attachments_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| email_attachments_filename_trgm_idx | gin | filename | não | sim |  | `CREATE INDEX email_attachments_filename_trgm_idx ON public.email_attachments USING gin (filename extensions.gin_trgm_ops)` |
| email_attachments_msg_att_key | btree | email_message_id, gmail_attachment_id | sim | sim |  | `CREATE UNIQUE INDEX email_attachments_msg_att_key ON public.email_attachments USING btree (email_message_id, gmail_attachment_id)` |
| email_attachments_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX email_attachments_pkey ON public.email_attachments USING btree (id)` |
| idx_email_attachments_email_message_id | btree | email_message_id | não | sim |  | `CREATE INDEX idx_email_attachments_email_message_id ON public.email_attachments USING btree (email_message_id)` |


## Policies (RLS)

### `Users can view attachments of own accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM (email_messages em      JOIN gmail_accounts ga ON ((ga.id = em.gmail_account_id)))   WHERE ((em.id = email_attachments.email_message_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |

### `service_role inserts email attachments`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | service_role |
| USING |  |
| WITH CHECK | `true` |


## Triggers

_nenhum_


## Grants

_nenhum_
