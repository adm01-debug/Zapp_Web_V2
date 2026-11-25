# public.user_service_accounts

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.user_service_accounts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 user_id uuid NOT NULL
3 service_type service_account_type NOT NULL
4 account_email text NOT NULL
5 is_active boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
user_service_accounts_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
user_service_accounts_pkey: PRIMARY KEY (id)
user_service_accounts_user_id_service_type_key: UNIQUE (user_id, service_type)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view all service accounts" [command=SELECT; roles=authenticated; PERMISSIVE]
"Only admins can delete service accounts" [command=DELETE; roles=authenticated; PERMISSIVE]
"Only admins can insert service accounts" [command=INSERT; roles=authenticated; PERMISSIVE]
"Only admins can update service accounts" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can view own service accounts" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `user_id` | `uuid` | não |  |  |  |
| 3 | `service_type` | `service_account_type` | não |  |  |  |
| 4 | `account_email` | `text` | não |  |  |  |
| 5 | `is_active` | `boolean` | não | `true` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_service_accounts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_service_accounts_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| user_service_accounts_user_id_service_type_key | UNIQUE | `UNIQUE (user_id, service_type)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| user_service_accounts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_service_accounts_pkey ON public.user_service_accounts USING btree (id)` |
| user_service_accounts_user_id_service_type_key | btree | user_id, service_type | sim | sim |  | `CREATE UNIQUE INDEX user_service_accounts_user_id_service_type_key ON public.user_service_accounts USING btree (user_id, service_type)` |


## Policies (RLS)

### `Admins can view all service accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Only admins can delete service accounts`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Only admins can insert service accounts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Only admins can update service accounts`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can view own service accounts`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(( SELECT auth.uid() AS uid) = user_id)` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_user_service_accounts_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
