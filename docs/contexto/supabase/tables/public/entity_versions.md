# public.entity_versions

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.entity_versions (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 entity_type text NOT NULL
3 entity_id uuid NOT NULL
4 version_number integer NOT NULL
5 data jsonb NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 changed_by uuid NULLABLE
7 change_summary text NULLABLE
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
entity_versions_pkey: PRIMARY KEY (id)
entity_versions_entity_type_entity_id_version_number_key: UNIQUE (entity_type, entity_id, version_number)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can view entity versions" [command=SELECT; roles=authenticated; PERMISSIVE]
"Block authenticated version inserts" [command=INSERT; roles=authenticated; PERMISSIVE]

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
| 2 | `entity_type` | `text` | não |  |  |  |
| 3 | `entity_id` | `uuid` | não |  |  |  |
| 4 | `version_number` | `integer` | não |  |  |  |
| 5 | `data` | `jsonb` | não | `'{}'::jsonb` |  |  |
| 6 | `changed_by` | `uuid` | sim |  |  |  |
| 7 | `change_summary` | `text` | sim |  |  |  |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| entity_versions_entity_type_entity_id_version_number_key | UNIQUE | `UNIQUE (entity_type, entity_id, version_number)` |  |  | sim |
| entity_versions_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| entity_versions_entity_type_entity_id_version_number_key | btree | entity_type, entity_id, version_number | sim | sim |  | `CREATE UNIQUE INDEX entity_versions_entity_type_entity_id_version_number_key ON public.entity_versions USING btree (entity_type, entity_id, version_number)` |
| entity_versions_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX entity_versions_pkey ON public.entity_versions USING btree (id)` |
| idx_versions_date | btree | created_at | não | sim |  | `CREATE INDEX idx_versions_date ON public.entity_versions USING btree (created_at DESC)` |


## Policies (RLS)

### `Admins can view entity versions`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |

### `Block authenticated version inserts`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `false` |


## Triggers

_nenhum_


## Grants

_nenhum_
