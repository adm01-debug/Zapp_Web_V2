# public.queue_goals

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.queue_goals (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 queue_id uuid NOT NULL
3 max_waiting_contacts integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
4 max_avg_wait_minutes integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 min_assignment_rate integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
6 max_messages_pending integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 alerts_enabled boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
queue_goals_queue_id_fkey: FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE
queue_goals_pkey: PRIMARY KEY (id)
queue_goals_queue_id_key: UNIQUE (queue_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage queue goals" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated users can view queue goals" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `queue_id` | `uuid` | não |  |  |  |
| 3 | `max_waiting_contacts` | `integer` | sim | `10` |  |  |
| 4 | `max_avg_wait_minutes` | `integer` | sim | `15` |  |  |
| 5 | `min_assignment_rate` | `integer` | sim | `80` |  |  |
| 6 | `max_messages_pending` | `integer` | sim | `50` |  |  |
| 7 | `alerts_enabled` | `boolean` | sim | `true` |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queue_goals_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| queue_goals_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| queue_goals_queue_id_key | UNIQUE | `UNIQUE (queue_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| queue_goals_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queue_goals_pkey ON public.queue_goals USING btree (id)` |
| queue_goals_queue_id_key | btree | queue_id | sim | sim |  | `CREATE UNIQUE INDEX queue_goals_queue_id_key ON public.queue_goals USING btree (queue_id)` |


## Policies (RLS)

### `Admins can manage queue goals`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated users can view queue goals`

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
| update_queue_goals_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
