# public.auto_close_config

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.auto_close_config (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 inactivity_hours integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 is_enabled boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 close_message text NULLABLE [DEFAULT/EXPRESSION DEFINED]
5 updated_by uuid NULLABLE
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
auto_close_config_updated_by_fkey: FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL
auto_close_config_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can manage auto-close config" [command=ALL; roles=authenticated; PERMISSIVE]
"Authenticated users can view auto-close config" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `inactivity_hours` | `integer` | não | `24` |  |  |
| 3 | `is_enabled` | `boolean` | não | `false` |  |  |
| 4 | `close_message` | `text` | sim | `'Conversa encerrada automaticamente por inatividade.'::text` |  |  |
| 5 | `updated_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| auto_close_config_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |
| auto_close_config_updated_by_fkey | FOREIGN KEY | `FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL` | SET NULL | NO ACTION | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| auto_close_config_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX auto_close_config_pkey ON public.auto_close_config USING btree (id)` |
| idx_auto_close_config_updated_by | btree | updated_by | não | sim |  | `CREATE INDEX idx_auto_close_config_updated_by ON public.auto_close_config USING btree (updated_by)` |


## Policies (RLS)

### `Admins can manage auto-close config`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |

### `Authenticated users can view auto-close config`

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
| update_auto_close_config_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
