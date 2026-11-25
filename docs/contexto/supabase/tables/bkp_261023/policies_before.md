# _bkp_261023.policies_before

> [bkp-261023] Snapshot das RLS policies antes de migrations críticas (456 policies).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.policies_before (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 schemaname name NULLABLE
2 tablename name NULLABLE
3 policyname name NULLABLE
4 permissive text NULLABLE
5 roles name[] NULLABLE
6 cmd text NULLABLE
7 qual text NULLABLE
8 with_check text NULLABLE
Constraints:
(nenhuma PK/UNIQUE/FK/CHECK/EXCLUDE registrada)
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

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
