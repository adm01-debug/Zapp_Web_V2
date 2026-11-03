# public.email_labels

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
| 2 | `gmail_account_id` | `uuid` | não |  |  |  |
| 3 | `gmail_label_id` | `text` | não |  |  |  |
| 4 | `name` | `text` | não |  |  |  |
| 5 | `label_type` | `text` | não | `'user'::text` |  |  |
| 6 | `color` | `text` | sim |  |  |  |
| 7 | `message_count` | `integer` | não | `0` |  |  |
| 8 | `unread_count` | `integer` | não | `0` |  |  |
| 9 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| email_labels_gmail_account_id_fkey | FOREIGN KEY | `FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| email_labels_gmail_account_id_gmail_label_id_key | UNIQUE | `UNIQUE (gmail_account_id, gmail_label_id)` |  |  | sim |
| email_labels_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| email_labels_gmail_account_id_gmail_label_id_key | btree | gmail_account_id, gmail_label_id | sim | sim |  | `CREATE UNIQUE INDEX email_labels_gmail_account_id_gmail_label_id_key ON public.email_labels USING btree (gmail_account_id, gmail_label_id)` |
| email_labels_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX email_labels_pkey ON public.email_labels USING btree (id)` |
| idx_email_labels_gmail_account_id | btree | gmail_account_id | não | sim |  | `CREATE INDEX idx_email_labels_gmail_account_id ON public.email_labels USING btree (gmail_account_id)` |


## Policies (RLS)

### `Users can manage labels of own accounts`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = auth.uid()))))` |
| WITH CHECK |  |

### `Users can view labels of own accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = auth.uid()) OR is_admin_or_supervisor(auth.uid())))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
