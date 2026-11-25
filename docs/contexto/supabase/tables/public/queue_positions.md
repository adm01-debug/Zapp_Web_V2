# public.queue_positions

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.queue_positions (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 contact_id uuid NOT NULL
3 queue_id uuid NOT NULL
4 "position" integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 estimated_wait_minutes integer NULLABLE
6 entered_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 notified boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
8 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
queue_positions_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id)
queue_positions_queue_id_fkey: FOREIGN KEY (queue_id) REFERENCES queues(id)
queue_positions_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage queue positions" [command=ALL; roles=authenticated; PERMISSIVE]
"Users can view queue positions" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `contact_id` | `uuid` | não |  |  |  |
| 3 | `queue_id` | `uuid` | não |  |  |  |
| 4 | `position` | `integer` | não | `0` |  |  |
| 5 | `estimated_wait_minutes` | `integer` | sim |  |  |  |
| 6 | `entered_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 7 | `notified` | `boolean` | sim | `false` |  |  |
| 8 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| queue_positions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| queue_positions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| queue_positions_queue_id_fkey | FOREIGN KEY | `FOREIGN KEY (queue_id) REFERENCES queues(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_queue_positions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_queue_positions_contact_id ON public.queue_positions USING btree (contact_id)` |
| idx_queue_positions_queue_id | btree | queue_id | não | sim |  | `CREATE INDEX idx_queue_positions_queue_id ON public.queue_positions USING btree (queue_id)` |
| queue_positions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX queue_positions_pkey ON public.queue_positions USING btree (id)` |


## Policies (RLS)

### `Admins can manage queue positions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Users can view queue positions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `((contact_id IN ( SELECT c.id    FROM contacts c   WHERE (c.assigned_to IN ( SELECT p.id            FROM profiles p           WHERE (p.user_id = ( SELECT auth.uid() AS uid)))))) OR is_admin_or_supervisor(( SELECT auth.uid() AS uid)))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
