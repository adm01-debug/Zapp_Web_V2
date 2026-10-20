-- Achado na revisao exaustiva do plano de 50 etapas (2026-09-16, E23): dois
-- indices redundantes, nunca antes catalogados.
--
-- idx_talkx_links_slug (btree simples em slug) e' redundante com
-- talkx_links_slug_key, o indice implicito da constraint UNIQUE(slug) --
-- qualquer busca por slug ja usa esse. DROP INDEX simples (gateway envolve
-- CONCURRENTLY em transacao, tabela pequena, sem risco).
DROP INDEX IF EXISTS public.idx_talkx_links_slug;

-- talkx_template_versions tinha dois indices com definicao IDENTICA em
-- (template_id, version_number DESC): idx_talkx_template_versions_template_version
-- (migration 20260909130000, convencao de nome do projeto) e
-- talkx_template_versions_template_id_idx (migration 20260909210000, uma
-- migration de "canonicalizacao" que recriou o indice sob outro nome sem
-- perceber que o original ja existia -- IF NOT EXISTS so evita erro de nome
-- duplicado, nao detecta definicao duplicada). Mantido o de convencao de
-- nome do projeto, removido o outro.
DROP INDEX IF EXISTS public.talkx_template_versions_template_id_idx;
