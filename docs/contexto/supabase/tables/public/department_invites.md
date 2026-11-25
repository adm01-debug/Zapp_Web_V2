# public.department_invites

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.department_invites (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 department_id uuid NOT NULL
3 code text NOT NULL
4 created_by uuid NULLABLE
5 expires_at timestamp with time zone NOT NULL
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
department_invites_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
department_invites_department_id_fkey: FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE
department_invites_pkey: PRIMARY KEY (id)
department_invites_code_key: UNIQUE (code)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
dept_invites_delete_admin [command=DELETE; roles=authenticated; PERMISSIVE]
dept_invites_insert_admin [command=INSERT; roles=authenticated; PERMISSIVE]
dept_invites_select_admin [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `department_id` | `uuid` | não |  |  |  |
| 3 | `code` | `text` | não |  |  |  |
| 4 | `created_by` | `uuid` | sim |  |  |  |
| 5 | `expires_at` | `timestamp with time zone` | não |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| department_invites_code_key | UNIQUE | `UNIQUE (code)` |  |  | sim |
| department_invites_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| department_invites_department_id_fkey | FOREIGN KEY | `FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| department_invites_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| department_invites_code_key | btree | code | sim | sim |  | `CREATE UNIQUE INDEX department_invites_code_key ON public.department_invites USING btree (code)` |
| department_invites_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX department_invites_pkey ON public.department_invites USING btree (id)` |
| idx_dept_invites_code | btree | code | não | sim |  | `CREATE INDEX idx_dept_invites_code ON public.department_invites USING btree (code)` |
| idx_dept_invites_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_dept_invites_created_by ON public.department_invites USING btree (created_by)` |
| idx_dept_invites_dept_id | btree | department_id | não | sim |  | `CREATE INDEX idx_dept_invites_dept_id ON public.department_invites USING btree (department_id)` |


## Policies (RLS)

### `dept_invites_delete_admin`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `dept_invites_insert_admin`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin(( SELECT auth.uid() AS uid)) AND ((created_by IS NULL) OR (created_by IN ( SELECT p.id    FROM profiles p   WHERE (p.user_id = ( SELECT auth.uid() AS uid))))))` |

### `dept_invites_select_admin`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
