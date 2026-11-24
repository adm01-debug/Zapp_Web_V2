# public.user_devices

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.user_devices (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 user_id uuid NOT NULL
3 device_fingerprint text NOT NULL
4 device_name text NULLABLE
5 browser text NULLABLE
6 os text NULLABLE
7 ip_address text NULLABLE
8 city text NULLABLE
9 country text NULLABLE
10 is_trusted boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
11 first_seen_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 last_seen_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
13 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
user_devices_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
user_devices_pkey: PRIMARY KEY (id)
user_devices_user_id_device_fingerprint_key: UNIQUE (user_id, device_fingerprint)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view all user devices" [command=SELECT; roles=authenticated; PERMISSIVE]
"Users can delete their own devices" [command=DELETE; roles=authenticated; PERMISSIVE]
"Users can insert their own devices" [command=INSERT; roles=authenticated; PERMISSIVE]
"Users can update their own devices" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Users can view their own devices" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 3 | `device_fingerprint` | `text` | não |  |  |  |
| 4 | `device_name` | `text` | sim |  |  |  |
| 5 | `browser` | `text` | sim |  |  |  |
| 6 | `os` | `text` | sim |  |  |  |
| 7 | `ip_address` | `text` | sim |  |  |  |
| 8 | `city` | `text` | sim |  |  |  |
| 9 | `country` | `text` | sim |  |  |  |
| 10 | `is_trusted` | `boolean` | sim | `false` |  |  |
| 11 | `first_seen_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `last_seen_at` | `timestamp with time zone` | não | `now()` |  |  |
| 13 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| user_devices_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| user_devices_user_id_device_fingerprint_key | UNIQUE | `UNIQUE (user_id, device_fingerprint)` |  |  | sim |
| user_devices_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.user_sessions | user_sessions_device_id_fkey | device_id | SET NULL |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_user_devices_fingerprint | btree | device_fingerprint | não | sim |  | `CREATE INDEX idx_user_devices_fingerprint ON public.user_devices USING btree (device_fingerprint)` |
| user_devices_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX user_devices_pkey ON public.user_devices USING btree (id)` |
| user_devices_user_id_device_fingerprint_key | btree | user_id, device_fingerprint | sim | sim |  | `CREATE UNIQUE INDEX user_devices_user_id_device_fingerprint_key ON public.user_devices USING btree (user_id, device_fingerprint)` |


## Policies (RLS)

### `Admins can view all user devices`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Users can delete their own devices`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |

### `Users can insert their own devices`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `Users can update their own devices`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `Users can view their own devices`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| on_device_update_last_seen | BEFORE | UPDATE | ROW | enabled | public.update_device_last_seen |


## Grants

_nenhum_
