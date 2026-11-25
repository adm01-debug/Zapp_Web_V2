# _bkp_261023.csat_surveys

> [bkp-261023] Snapshot de public.csat_surveys em 23/10/2026 (0 linhas).

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: _bkp_261023.csat_surveys (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 id uuid NULLABLE
2 contact_id uuid NULLABLE
3 agent_id uuid NULLABLE
4 rating integer NULLABLE
5 feedback text NULLABLE
6 conversation_resolved_at timestamp with time zone NULLABLE
7 created_at timestamp with time zone NULLABLE
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
| 2 | `contact_id` | `uuid` | sim |  |  |  |
| 3 | `agent_id` | `uuid` | sim |  |  |  |
| 4 | `rating` | `integer` | sim |  |  |  |
| 5 | `feedback` | `text` | sim |  |  |  |
| 6 | `conversation_resolved_at` | `timestamp with time zone` | sim |  |  |  |
| 7 | `created_at` | `timestamp with time zone` | sim |  |  |  |


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
