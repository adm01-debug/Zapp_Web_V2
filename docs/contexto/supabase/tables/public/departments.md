# public.departments

> Organizational departments; each may own a team_conversation of type=department

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
| 2 | `name` | `text` | não |  |  |  |
| 3 | `is_active` | `boolean` | não | `true` |  |  |
| 4 | `whatsapp_mode` | `text` | não | `'none'::text` |  |  |
| 5 | `whatsapp_api_key` | `text` | sim |  |  |  |
| 6 | `whatsapp_instance_id` | `text` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 8 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| departments_name_key | UNIQUE | `UNIQUE (name)` |  |  | sim |
| departments_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| departments_whatsapp_mode_check | CHECK | `CHECK (whatsapp_mode = ANY (ARRAY['none'::text, 'evolution'::text, 'official'::text]))` |  |  | sim |


## Referenciada por (FKs de outras tabelas)

| tabela | constraint | colunas | on delete |
|---|---|---|---|
| public.department_audit_logs | department_audit_logs_department_id_fkey | department_id | CASCADE |
| public.department_invitations | department_invitations_department_id_fkey | department_id | CASCADE |
| public.department_invites | department_invites_department_id_fkey | department_id | CASCADE |
| public.profiles | profiles_department_id_fkey | department_id | NO ACTION |
| public.team_conversations | team_conversations_department_id_fkey | department_id | CASCADE |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| departments_name_key | btree | name | sim | sim |  | `CREATE UNIQUE INDEX departments_name_key ON public.departments USING btree (name)` |
| departments_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX departments_pkey ON public.departments USING btree (id)` |


## Policies (RLS)

### `departments_admin_write`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin(auth.uid())` |
| WITH CHECK | `is_admin(auth.uid())` |

### `departments_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
