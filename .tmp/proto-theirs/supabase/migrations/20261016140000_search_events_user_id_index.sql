-- search_events: indice em user_id
-- Rollback:
--   DROP INDEX IF EXISTS public.idx_search_events_user_id;
--
-- A tabela so tem indice em created_at. Queries do tipo
-- WHERE user_id = $1 (ex: purge_old_search_events, analytics por usuario)
-- fazem seq scan. O indice e BTREE simples — baixo custo de manutencao
-- pois search_events so recebe INSERT (nao tem UPDATE por design).

CREATE INDEX IF NOT EXISTS idx_search_events_user_id
  ON public.search_events (user_id);
