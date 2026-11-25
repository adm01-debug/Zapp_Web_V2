# public.number_reputation

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.number_reputation (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 whatsapp_connection_id uuid NOT NULL
3 health_score integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 messages_sent_today integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 failures_today integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 complaints_count integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 warmup_status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 warmup_day integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 daily_limit integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 last_reset_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
11 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
number_reputation_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE
number_reputation_pkey: PRIMARY KEY (id)
number_reputation_whatsapp_connection_id_key: UNIQUE (whatsapp_connection_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can insert reputation" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins can update reputation" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Authenticated can view reputation" [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 3 | `health_score` | `integer` | não | `100` |  |  |
| 4 | `messages_sent_today` | `integer` | não | `0` |  |  |
| 5 | `failures_today` | `integer` | não | `0` |  |  |
| 6 | `complaints_count` | `integer` | não | `0` |  |  |
| 7 | `warmup_status` | `text` | não | `'none'::text` |  |  |
| 8 | `warmup_day` | `integer` | sim | `0` |  |  |
| 9 | `daily_limit` | `integer` | sim | `200` |  |  |
| 10 | `last_reset_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| number_reputation_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| number_reputation_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| number_reputation_whatsapp_connection_id_key | UNIQUE | `UNIQUE (whatsapp_connection_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| number_reputation_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX number_reputation_pkey ON public.number_reputation USING btree (id)` |
| number_reputation_whatsapp_connection_id_key | btree | whatsapp_connection_id | sim | sim |  | `CREATE UNIQUE INDEX number_reputation_whatsapp_connection_id_key ON public.number_reputation USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can insert reputation`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Admins can update reputation`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Authenticated can view reputation`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_number_reputation_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
