# _bkp_261023.policies_before

> [bkp-261023] Snapshot das RLS policies antes de migrations críticas (456 policies).

| propriedade | valor |
|---|---|
| tipo | table |
| owner | postgres |
| RLS habilitado | não |
| RLS forçado (owner) | não |
| policies | 0 |
| realtime (publication) | não |
| replica identity | default |
| vem de extensão | não |


## Colunas

| # | coluna | tipo | nullable | default | identity/generated | comentário |
|---|---|---|---|---|---|---|
| 1 | `schemaname` | `name` | sim |  |  |  |
| 2 | `tablename` | `name` | sim |  |  |  |
| 3 | `policyname` | `name` | sim |  |  |  |
| 4 | `permissive` | `text` | sim |  |  |  |
| 5 | `roles` | `name[]` | sim |  |  |  |
| 6 | `cmd` | `text` | sim |  |  |  |
| 7 | `qual` | `text` | sim |  |  |  |
| 8 | `with_check` | `text` | sim |  |  |  |


## Constraints

_nenhum_


## Índices

_nenhum_


## Policies (RLS)

> ⚠️ RLS **desabilitado** nesta tabela.



## Triggers

_nenhum_


## Grants

_nenhum_
