# public.security_alerts

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.security_alerts (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 alert_type text NOT NULL
3 severity text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 title text NOT NULL
5 description text NULLABLE
6 ip_address text NULLABLE
7 user_id uuid NULLABLE
8 metadata jsonb NULLABLE [DEFAULT/EXPRESSION DEFINED]
9 is_resolved boolean NULLABLE [DEFAULT/EXPRESSION DEFINED]
10 resolved_by uuid NULLABLE
11 resolved_at timestamp with time zone NULLABLE
12 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
security_alerts_resolved_by_fkey: FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL
security_alerts_user_id_fkey: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL
security_alerts_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage security alerts" [command=ALL; roles=authenticated; PERMISSIVE]
security_alerts_self_select [command=SELECT; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 3 |
| realtime (publication) | não |
| replica identity | full |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `alert_type` | `text` | não |  |  |  |
| 3 | `severity` | `text` | não | `'medium'::text` |  |  |
| 4 | `title` | `text` | não |  |  |  |
| 5 | `description` | `text` | sim |  |  |  |
| 6 | `ip_address` | `text` | sim |  |  |  |
| 7 | `user_id` | `uuid` | sim |  |  |  |
| 8 | `metadata` | `jsonb` | sim | `'{}'::jsonb` |  |  |
| 9 | `is_resolved` | `boolean` | sim | `false` |  |  |
| 10 | `resolved_by` | `uuid` | sim |  |  |  |
| 11 | `resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 12 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| security_alerts_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| security_alerts_resolved_by_fkey | FOREIGN KEY | `FOREIGN KEY (resolved_by) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| security_alerts_user_id_fkey | FOREIGN KEY | `FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_security_alerts_created | btree | created_at | não | sim |  | `CREATE INDEX idx_security_alerts_created ON public.security_alerts USING btree (created_at)` |
| idx_security_alerts_resolved_by | btree | resolved_by | não | sim |  | `CREATE INDEX idx_security_alerts_resolved_by ON public.security_alerts USING btree (resolved_by)` |
| idx_security_alerts_user_id | btree | user_id | não | sim |  | `CREATE INDEX idx_security_alerts_user_id ON public.security_alerts USING btree (user_id)` |
| security_alerts_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX security_alerts_pkey ON public.security_alerts USING btree (id)` |


## Policies (RLS)

### `Admins can insert security alerts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `is_admin_or_supervisor(auth.uid())` |

### `Admins can manage security alerts`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `security_alerts_self_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
