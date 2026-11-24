# public.business_hours

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.business_hours (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 whatsapp_connection_id uuid NOT NULL
3 day_of_week integer NOT NULL
4 is_open boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 open_time time without time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 close_time time without time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
8 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
business_hours_day_of_week_check: CHECK (day_of_week >= 0 AND day_of_week <= 6)
business_hours_whatsapp_connection_id_fkey: FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE
business_hours_pkey: PRIMARY KEY (id)
business_hours_whatsapp_connection_id_day_of_week_key: UNIQUE (whatsapp_connection_id, day_of_week)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage business hours" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated users can view business hours" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `whatsapp_connection_id` | `uuid` | não |  |  |  |
| 3 | `day_of_week` | `integer` | não |  |  |  |
| 4 | `is_open` | `boolean` | sim | `true` |  |  |
| 5 | `open_time` | `time without time zone` | sim | `'09:00:00'::time without time zone` |  |  |
| 6 | `close_time` | `time without time zone` | sim | `'18:00:00'::time without time zone` |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| business_hours_day_of_week_check | CHECK | `CHECK (day_of_week >= 0 AND day_of_week <= 6)` |  |  | sim |
| business_hours_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| business_hours_whatsapp_connection_id_day_of_week_key | UNIQUE | `UNIQUE (whatsapp_connection_id, day_of_week)` |  |  | sim |
| business_hours_whatsapp_connection_id_fkey | FOREIGN KEY | `FOREIGN KEY (whatsapp_connection_id) REFERENCES whatsapp_connections(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| business_hours_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX business_hours_pkey ON public.business_hours USING btree (id)` |
| business_hours_whatsapp_connection_id_day_of_week_key | btree | whatsapp_connection_id, day_of_week | sim | sim |  | `CREATE UNIQUE INDEX business_hours_whatsapp_connection_id_day_of_week_key ON public.business_hours USING btree (whatsapp_connection_id, day_of_week)` |
| idx_business_hours_whatsapp_connection_id | btree | whatsapp_connection_id | não | sim |  | `CREATE INDEX idx_business_hours_whatsapp_connection_id ON public.business_hours USING btree (whatsapp_connection_id)` |


## Policies (RLS)

### `Admins can manage business hours`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated users can view business hours`

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
| update_business_hours_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
