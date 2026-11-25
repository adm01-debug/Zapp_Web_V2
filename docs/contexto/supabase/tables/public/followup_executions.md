# public.followup_executions

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.followup_executions (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 sequence_id uuid NOT NULL
3 contact_id uuid NOT NULL
4 current_step integer NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 status text NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 started_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
7 next_step_at timestamp with time zone NULLABLE
8 completed_at timestamp with time zone NULLABLE
9 created_at timestamp with time zone NULLABLE [DEFAULT/EXPRESSION DEFINED]
Constraints:
followup_executions_contact_id_fkey: FOREIGN KEY (contact_id) REFERENCES contacts(id)
followup_executions_sequence_id_fkey: FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id)
followup_executions_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage followup executions" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated can view followup executions" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `sequence_id` | `uuid` | não |  |  |  |
| 3 | `contact_id` | `uuid` | não |  |  |  |
| 4 | `current_step` | `integer` | sim | `0` |  |  |
| 5 | `status` | `text` | não | `'pending'::text` |  |  |
| 6 | `started_at` | `timestamp with time zone` | sim | `now()` |  |  |
| 7 | `next_step_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `completed_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `created_at` | `timestamp with time zone` | sim | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| followup_executions_contact_id_fkey | FOREIGN KEY | `FOREIGN KEY (contact_id) REFERENCES contacts(id)` | NO ACTION | NO ACTION | sim |
| followup_executions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| followup_executions_sequence_id_fkey | FOREIGN KEY | `FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| followup_executions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX followup_executions_pkey ON public.followup_executions USING btree (id)` |
| idx_followup_executions_contact_id | btree | contact_id | não | sim |  | `CREATE INDEX idx_followup_executions_contact_id ON public.followup_executions USING btree (contact_id)` |
| idx_followup_executions_sequence_id | btree | sequence_id | não | sim |  | `CREATE INDEX idx_followup_executions_sequence_id ON public.followup_executions USING btree (sequence_id)` |


## Policies (RLS)

### `Admins can manage followup executions`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated can view followup executions`

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
