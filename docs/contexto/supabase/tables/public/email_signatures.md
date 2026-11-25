# public.email_signatures

> Assinaturas de e-mail do proprio usuario (nome, HTML) com no maximo uma padrao por dono (indice unico parcial em user_id when is_default). Dono em user_id = auth.uid(); acesso so do dono.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.email_signatures (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 user_id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
3 name character varying(120) NOT NULL
4 html text NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 is_default boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
email_signatures_html_len: CHECK (char_length(html) <= 20000)
email_signatures_name_not_blank: CHECK (btrim(name::text) <> ''::text)
email_signatures_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
email_signatures_delete_own [command=DELETE; roles=authenticated; PERMISSIVE]
email_signatures_insert_own [command=INSERT; roles=authenticated; PERMISSIVE]
email_signatures_select_own [command=SELECT; roles=authenticated; PERMISSIVE]
email_signatures_update_own [command=UPDATE; roles=authenticated; PERMISSIVE]

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
| 2 | `user_id` | `uuid` | não | `auth.uid()` |  |  |
| 3 | `name` | `character varying(120)` | não |  |  |  |
| 4 | `html` | `text` | não | `''::text` |  |  |
| 5 | `is_default` | `boolean` | não | `false` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| email_signatures_html_len | CHECK | `CHECK (char_length(html) <= 20000)` |  |  | sim |
| email_signatures_name_not_blank | CHECK | `CHECK (btrim(name::text) <> ''::text)` |  |  | sim |
| email_signatures_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| email_signatures_one_default_per_user | btree | user_id | sim | sim | `is_default` | `CREATE UNIQUE INDEX email_signatures_one_default_per_user ON public.email_signatures USING btree (user_id) WHERE is_default` |
| email_signatures_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX email_signatures_pkey ON public.email_signatures USING btree (id)` |
| email_signatures_user_id_idx | btree | user_id | não | sim |  | `CREATE INDEX email_signatures_user_id_idx ON public.email_signatures USING btree (user_id)` |


## Policies (RLS)

### `email_signatures_delete_own`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |

### `email_signatures_insert_own`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |

### `email_signatures_select_own`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK |  |

### `email_signatures_update_own`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |
| WITH CHECK | `(user_id = ( SELECT ( SELECT auth.uid() AS uid) AS uid))` |


## Triggers

| nome | timing | eventos | nível | status | função |
|---|---|---|---|---|---|
| set_email_signatures_updated_at | BEFORE | UPDATE | ROW | enabled | public.update_updated_at_column |


## Grants

_nenhum_
