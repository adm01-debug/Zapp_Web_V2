# public.geo_blocking_settings

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.geo_blocking_settings (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 mode text NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 updated_by uuid NULLABLE
4 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
geo_blocking_settings_mode_check: CHECK (mode = ANY (ARRAY['disabled'::text, 'whitelist'::text, 'blacklist'::text]))
geo_blocking_settings_updated_by_fkey: FOREIGN KEY (updated_by) REFERENCES auth.users(id)
geo_blocking_settings_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage geo settings" [command=ALL; roles=authenticated; PERMISSIVE]
"Geo blocking visible to admins only" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `mode` | `text` | não | `'disabled'::text` |  |  |
| 3 | `updated_by` | `uuid` | sim |  |  |  |
| 4 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 5 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| geo_blocking_settings_mode_check | CHECK | `CHECK (mode = ANY (ARRAY['disabled'::text, 'whitelist'::text, 'blacklist'::text]))` |  |  | sim |
| geo_blocking_settings_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| geo_blocking_settings_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES auth.users(id)` | NO ACTION | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| geo_blocking_settings_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX geo_blocking_settings_pkey ON public.geo_blocking_settings USING btree (id)` |
| idx_geo_blocking_settings_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_geo_blocking_settings_updated_by ON public.geo_blocking_settings USING btree (updated_by)` |


## Policies (RLS)

### `Admins can manage geo settings`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Geo blocking visible to admins only`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK |  |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| update_geo_blocking_settings_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
