# public.agent_mini_game_xp_daily

> [RLS-sem-policy: intencional] Acumulador diário de XP do mini-game. Escrito pelos triggers/edge functions via service_role; leitura pela RPC security-definer get_agent_mini_game_stats.

[CATALOGUE SEMÂNTICO DO PROJETO]
Objeto: public.agent_mini_game_xp_daily (tabela). RLS habilitada: t; RLS forçada: f.
Colunas (ordem, tipo e nulabilidade):
1 profile_id uuid NOT NULL
2 game_id text NOT NULL
3 dia date NOT NULL [DEFAULT/EXPRESSION DEFINED]
4 partidas integer NOT NULL [DEFAULT/EXPRESSION DEFINED]
5 xp_total bigint NOT NULL [DEFAULT/EXPRESSION DEFINED]
6 created_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
7 updated_at timestamp with time zone NOT NULL [DEFAULT/EXPRESSION DEFINED]
Constraints:
agent_mini_game_xp_daily_game_id_check: CHECK (game_id = ANY (ARRAY['speed-typing'::text, 'quiz'::text, 'response-match'::text, 'emoji-decode'::text]))
agent_mini_game_xp_daily_partidas_check: CHECK (partidas >= 0)
agent_mini_game_xp_daily_xp_total_check: CHECK (xp_total >= 0)
agent_mini_game_xp_daily_profile_id_fkey: FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
agent_mini_game_xp_daily_pkey: PRIMARY KEY (profile_id, game_id, dia)
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
| 1 | `profile_id` | `uuid` | não |  |  |  |
| 2 | `game_id` | `text` | não |  |  |  |
| 3 | `dia` | `date` | não | `CURRENT_DATE` |  |  |
| 4 | `partidas` | `integer` | não | `0` |  |  |
| 5 | `xp_total` | `bigint` | não | `0` |  |  |
| 6 | `created_at` | `timestamp with time zone` | não | `now()` |  |  |
| 7 | `updated_at` | `timestamp with time zone` | não | `now()` |  |  |


## Constraints

| nome | tipo | definição | on delete | on update | validada |
|---|---|---|---|---|---|
| agent_mini_game_xp_daily_game_id_check | CHECK | `CHECK (game_id = ANY (ARRAY['speed-typing'::text, 'quiz'::text, 'response-match'::text, 'emoji-decode'::text]))` |  |  | sim |
| agent_mini_game_xp_daily_partidas_check | CHECK | `CHECK (partidas >= 0)` |  |  | sim |
| agent_mini_game_xp_daily_pkey | PRIMARY KEY | `PRIMARY KEY (profile_id, game_id, dia)` |  |  | sim |
| agent_mini_game_xp_daily_profile_id_fkey | FOREIGN KEY | `FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE` | CASCADE | NO ACTION | sim |
| agent_mini_game_xp_daily_xp_total_check | CHECK | `CHECK (xp_total >= 0)` |  |  | sim |


## Índices

| nome | método | colunas | único | válido | predicado | definição |
|---|---|---|---|---|---|---|
| agent_mini_game_xp_daily_pkey | btree | profile_id, game_id, dia | sim | sim |  | `CREATE UNIQUE INDEX agent_mini_game_xp_daily_pkey ON public.agent_mini_game_xp_daily USING btree (profile_id, game_id, dia)` |


## Policies (RLS)

> ⚠️ RLS habilitado **sem policies**: nenhum acesso via API (anon/authenticated).



## Triggers

_nenhum_


## Grants

_nenhum_
