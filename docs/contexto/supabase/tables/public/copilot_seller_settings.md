# public.copilot_seller_settings

> Descrição funcional não estava registrada no catálogo; o conteúdo abaixo documenta a estrutura observável, sem inferir regras de negócio não declaradas.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.copilot_seller_settings (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 seller_id uuid NOT NULL
2 opted_in boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
copilot_seller_settings_pkey: PRIMARY KEY (seller_id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
copilot_seller_settings_insert [command=INSERT; roles=authenticated; PERMISSIVE]
copilot_seller_settings_select [command=SELECT; roles=authenticated; PERMISSIVE]
copilot_seller_settings_update [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 1 | `seller_id` | `uuid` | não |  |  |  |
| 2 | `opted_in` | `boolean` | não | `true` |  |  |
| 3 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| copilot_seller_settings_pkey | PRIMARY KEY | `PRIMARY KEY (seller_id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| copilot_seller_settings_pkey | btree | seller_id | sim | sim |  | `CREATE UNIQUE INDEX copilot_seller_settings_pkey ON public.copilot_seller_settings USING btree (seller_id)` |


## Policies (RLS)

### `copilot_seller_settings_insert`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `copilot_seller_settings_select`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |

### `copilot_seller_settings_update`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK | `(seller_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |


## Triggers

_nenhum_


## Grants

_nenhum_
