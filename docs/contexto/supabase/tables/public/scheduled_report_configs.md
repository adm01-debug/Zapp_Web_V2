# public.scheduled_report_configs

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.scheduled_report_configs (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 name text NOT NULL
3 report_type text NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 frequency text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 recipients text[] NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 is_active boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 last_sent_at timestamp with time zone NULLABLE
8 next_send_at timestamp with time zone NULLABLE
9 created_by uuid NULLABLE
10 config jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
11 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
12 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
scheduled_report_configs_created_by_fkey: FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL
scheduled_report_configs_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admin/supervisor can insert report configs" [command=INSERT; roles=authenticated; PERMISSIVE]
"Owner or admin can delete report configs" [command=DELETE; roles=authenticated; PERMISSIVE]
"Owner or admin can read report configs" [command=SELECT; roles=authenticated; PERMISSIVE]
"Owner or admin can update report configs" [command=UPDATE; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 4 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `id` | `uuid` | não | `gen_random_uuid()` |  |  |
| 2 | `name` | `text` | não |  |  |  |
| 3 | `report_type` | `text` | não | `'dashboard'::text` |  |  |
| 4 | `frequency` | `text` | não | `'weekly'::text` |  |  |
| 5 | `recipients` | `text[]` | não | `'{}'::text[]` |  |  |
| 6 | `is_active` | `boolean` | não | `true` |  |  |
| 7 | `last_sent_at` | `timestamp with time zone` | sim |  |  |  |
| 8 | `next_send_at` | `timestamp with time zone` | sim |  |  |  |
| 9 | `created_by` | `uuid` | sim |  |  |  |
| 10 | `config` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 11 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 12 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| scheduled_report_configs_created_by_fkey | FOREIGN KEY | `FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |
| scheduled_report_configs_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| idx_scheduled_report_configs_created_by | btree | created_by | não | sim |  | `CREATE INDEX idx_scheduled_report_configs_created_by ON public.scheduled_report_configs USING btree (created_by)` |
| scheduled_report_configs_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX scheduled_report_configs_pkey ON public.scheduled_report_configs USING btree (id)` |


## Policies (RLS)

### `Admin/supervisor can insert report configs`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(is_admin_or_supervisor(( SELECT auth.uid() AS uid)) AND (is_admin(( SELECT auth.uid() AS uid)) OR (created_by IS NULL) OR (created_by = get_profile_id_for_user(( SELECT auth.uid() AS uid)))))` |

### `Owner or admin can delete report configs`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(( SELECT auth.uid() AS uid)) OR (created_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))))` |
| WITH CHECK |  |

### `Owner or admin can read report configs`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(( SELECT auth.uid() AS uid)) OR (created_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))))` |
| WITH CHECK |  |

### `Owner or admin can update report configs`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(is_admin(( SELECT auth.uid() AS uid)) OR (created_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))))` |
| WITH CHECK | `(is_admin(( SELECT auth.uid() AS uid)) OR (created_by = get_profile_id_for_user(( SELECT auth.uid() AS uid))))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| trg_set_scheduled_report_config_owner | BEFORE | INSERT | ROW | enabled | public.set_scheduled_report_config_owner |
| update_scheduled_report_configs_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
