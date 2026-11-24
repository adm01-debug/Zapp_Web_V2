# public._zapp_mig133_log

> [RLS-sem-policy: intencional] Log interno da migration 133. Só service_role.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public._zapp_mig133_log (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 version text NOT NULL
2 status text NOT NULL
3 detail text NULLABLE
4 n_statements integer NULLABLE
5 applied_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
_zapp_mig133_log_pkey: PRIMARY KEY (version)
Políticas RLS (nome, operação, papéis e modo; as expressões permanecem no catálogo):
(RLS habilitada sem política; verificar se o acesso restrito é intencional)

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | sim |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `version` | `text` | não |  |  |  |
| 2 | `status` | `text` | não |  |  |  |
| 3 | `detail` | `text` | sim |  |  |  |
| 4 | `n_statements` | `integer` | sim |  |  |  |
| 5 | `applied_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| _zapp_mig133_log_pkey | PRIMARY KEY | `PRIMARY KEY (version)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| _zapp_mig133_log_pkey | btree | version | sim | sim |  | `CREATE UNIQUE INDEX _zapp_mig133_log_pkey ON public._zapp_mig133_log USING btree (version)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
