# public.contact_protection_policy

> CT-091: politica de protecao de contatos. scope_role NULL = padrao global; linha por papel sobrepoe. Só o admin altera.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.contact_protection_policy (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NOT NULL [DEFAULT/EXPRESSION DEFINED]
2 scope_role app_role NULLABLE — Papel ao qual a politica se aplica (app_role). NULL = politica global (padrao do sistema).
3 bloquear_copia boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 bloquear_impressao boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 marca_dagua boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 mascarar_contato boolean NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 limite_fichas_hora integer NOT NULL [DEFAULT/EXPRESSION DEFINED] — Maximo de fichas de contato que o usuario pode abrir por hora (0 = sem fichas).
8 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
9 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
contact_protection_policy_limite_check: CHECK (limite_fichas_hora >= 0)
contact_protection_policy_pkey: PRIMARY KEY (id)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
"Admins can delete contact protection policy" [command=DELETE; roles=authenticated; PERMISSIVE]
"Admins can insert contact protection policy" [command=INSERT; roles=authenticated; PERMISSIVE]
"Admins can update contact protection policy" [command=UPDATE; roles=authenticated; PERMISSIVE]
"Admins can view contact protection policy" [command=SELECT; roles=authenticated; PERMISSIVE]

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
| 2 | `scope_role` | `app_role` | sim |  |  | Papel ao qual a politica se aplica (app_role). NULL = politica global (padrao do sistema). |
| 3 | `bloquear_copia` | `boolean` | não | `true` |  |  |
| 4 | `bloquear_impressao` | `boolean` | não | `true` |  |  |
| 5 | `marca_dagua` | `boolean` | não | `true` |  |  |
| 6 | `mascarar_contato` | `boolean` | não | `true` |  |  |
| 7 | `limite_fichas_hora` | `integer` | não | `100` |  | Maximo de fichas de contato que o usuario pode abrir por hora (0 = sem fichas). |
| 8 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 9 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| contact_protection_policy_limite_check | CHECK | `CHECK (limite_fichas_hora >= 0)` |  |  | sim |
| contact_protection_policy_pkey | PRIMARY KEY | `PRIMARY KEY (id)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| contact_protection_policy_pkey | btree | id | sim | sim |  | `CREATE UNIQUE INDEX contact_protection_policy_pkey ON public.contact_protection_policy USING btree (id)` |
| contact_protection_policy_scope_role_uidx | btree | scope_role | sim | sim |  | `CREATE UNIQUE INDEX contact_protection_policy_scope_role_uidx ON public.contact_protection_policy USING btree (scope_role) NULLS NOT DISTINCT` |


## Policies (RLS)

### `Admins can delete contact protection policy`

| campo | valor |
|---|---|
| comando | DELETE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK |  |

### `Admins can insert contact protection policy`

| campo | valor |
|---|---|
| comando | INSERT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING |  |
| WITH CHECK | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |

### `Admins can update contact protection policy`

| campo | valor |
|---|---|
| comando | UPDATE |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |

### `Admins can view contact protection policy`

| campo | valor |
|---|---|
| comando | SELECT |
| tipo | PERMISSIVE |
| roles | authenticated |
| USING | `has_role(( SELECT auth.uid() AS uid), 'admin'::app_role)` |
| WITH CHECK |  |


## Triggers

_nenhum_


## Grants

_nenhum_
