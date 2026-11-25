# public.email_labels

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.email_labels (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 gmail_account_id uuid NOT NULL
3 gmail_label_id text NOT NULL
4 name text NOT NULL
5 label_type text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 color text NULLABLE
7 message_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 unread_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
email_labels_gmail_account_id_fkey: FOREIGN KEY (gmail_account_id) REFERENCES gmail_accounts(id) ON DELETE CASCADE
email_labels_pkey: PRIMARY KEY (id)
email_labels_gmail_account_id_gmail_label_id_key: UNIQUE (gmail_account_id, gmail_label_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Users can manage labels of own accounts" [command=ALL; roles=authenticated; PERMISSIVE]
"Users can view labels of own accounts" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_labels.gmail_account_id) AND (ga.user_id = ( SELECT auth.uid() AS uid)))))` |
| WITH CHECK |  |

### `Users can view labels of own accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM gmail_accounts ga   WHERE ((ga.id = email_labels.gmail_account_id) AND ((ga.user_id = ( SELECT auth.uid() AS uid)) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid))))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
