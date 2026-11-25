# public.talkx_settings

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.talkx_settings (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 key text NOT NULL
2 value jsonb NOT NULL
3 description text NULLABLE
4 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
talkx_settings_pkey: PRIMARY KEY (key)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
authenticated_read_talkx_settings [command=SELECT; roles=authenticated; PERMISSIVE]
talkx_settings_admin_write [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 1 | `key` | `text` | não |  |  |  |
| 2 | `value` | `jsonb` | não |  |  |  |
| 3 | `description` | `text` | sim |  |  |  |
| 4 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| talkx_settings_pkey | PRIMARY KEY | `PRIMARY KEY (key)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| talkx_settings_pkey | btree | key | sim | sim |  | `CREATE UNIQUE INDEX talkx_settings_pkey ON public.talkx_settings USING btree (key)` |


## Policies (RLS)

### `authenticated_read_talkx_settings`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `true` |
| WITH CHECK |  |

### `talkx_settings_admin_write`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |
| WITH CHECK | `is_admin_or_supervisor(( SELECT auth.uid() AS uid))` |


## Triggers

_nenhum_


## Grants

_nenhum_
