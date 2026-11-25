# public.app_settings

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.app_settings (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 key text NOT NULL
2 value text NOT NULL
3 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
app_settings_pkey: PRIMARY KEY (key)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
app_settings_admin_all [command=ALL; roles=authenticated; PERMISSIVE]

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 1 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `key` | `text` | não |  |  |  |
| 2 | `value` | `text` | não |  |  |  |
| 3 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| app_settings_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| app_settings_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX app_settings_pkey ON public.app_settings USING btree (key)` |


## Policies (RLS)

### `app_settings_admin_all`

| campo | valor |
|---|---|
| comando | ALL |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(EXISTS ( SELECT 1    FROM user_roles ur   WHERE ((ur.user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid)) AND (ur.role = 'admin'::app_role))))` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
