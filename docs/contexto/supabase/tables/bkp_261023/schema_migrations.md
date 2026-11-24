# _bkp_261023.schema_migrations

> [bkp-261023] Snapshot de supabase_migrations.schema_migrations em 23/10/2026 (922 linhas).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.schema_migrations (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 version text NULLABLE
2 statements text[] NULLABLE
3 name text NULLABLE
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
| 1 | `version` | `text` | sim |  |  |  |
| 2 | `statements` | `text[]` | sim |  |  |  |
| 3 | `name` | `text` | sim |  |  |  |


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
