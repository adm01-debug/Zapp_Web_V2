-- Achado do cubic na revisao da PR: idx_team_message_reactions_message
-- (message_id) e redundante — team_message_reactions_unique ja e um indice
-- composto (message_id, profile_id, emoji), e Postgres usa o prefixo mais a
-- esquerda de um indice composto para queries filtrando so pela primeira
-- coluna. Custo de escrita/storage duplicado em toda reacao sem beneficio de
-- leitura.
DROP INDEX IF EXISTS public.idx_team_message_reactions_message;
