# _bkp_261023.global_settings

> [bkp-261023] Snapshot de public.global_settings em 23/10/2026 (6 linhas).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.global_settings (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NULLABLE
2 key text NULLABLE
3 value text NULLABLE
4 description text NULLABLE
5 updated_by uuid NULLABLE
6 created_at timestamp with time zone NULLABLE
7 updated_at timestamp with time zone NULLABLE
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
| 1 | `id` | `uuid` | sim |  |  |  |
| 2 | `key` | `text` | sim |  |  |  |
| 3 | `value` | `text` | sim |  |  |  |
| 4 | `description` | `text` | sim |  |  |  |
| 5 | `updated_by` | `uuid` | sim |  |  |  |
| 6 | `created_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `updated_at` | `timestamp with time zone` | sim |  |  |  |


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
