-- saved_filters_inbox_presets
-- Rollback: remove o gatilho e a funcao do limite e derruba os dois CHECKs dos presets da inbox. Migration so de DDL aditiva: nenhum dado existente e alterado.
-- Rollback (SQL executavel, na ordem):
--   DROP TRIGGER IF EXISTS enforce_inbox_preset_limit ON public.saved_filters;
--   DROP FUNCTION IF EXISTS public.enforce_inbox_preset_limit();
--   ALTER TABLE public.saved_filters DROP CONSTRAINT IF EXISTS saved_filters_inbox_shape_check;
--   ALTER TABLE public.saved_filters DROP CONSTRAINT IF EXISTS saved_filters_inbox_not_shared_check;

-- Presets de filtro da inbox reutilizam public.saved_filters (entity_type = 'inbox'),
-- como ja faz a aba de contatos. Nao ha tabela nova; so o contrato do que pode ser
-- gravado e um teto por usuario. As policies de isolamento por usuario (user_id =
-- auth.uid()) ja existem desde 20260315163251 e nao sao tocadas aqui.
--
-- Linhas de entity_type <> 'inbox' (ex.: 'contacts') ficam fora dos dois CHECKs.
-- Nao ha preset de inbox gravado antes desta migration (useSavedFilters nunca foi
-- chamado com entity_type = 'inbox'), entao o CHECK entra validado sem risco de
-- reprovar linha legada.

-- 1. Forma do JSON: objeto, sem chave desconhecida (etiquetas ficam de fora) e
--    cada chave conhecida com o tipo combinado.
ALTER TABLE public.saved_filters
  ADD CONSTRAINT saved_filters_inbox_shape_check
  CHECK (
    entity_type <> 'inbox'
    OR (
      jsonb_typeof(filters) = 'object'
      AND (filters - ARRAY['chip', 'queue', 'type', 'attendee', 'date_from', 'date_to']) = '{}'::jsonb
      AND (NOT (filters ? 'chip')     OR jsonb_typeof(filters->'chip') IN ('string', 'null'))
      AND (NOT (filters ? 'queue')    OR jsonb_typeof(filters->'queue') IN ('string', 'null'))
      AND (NOT (filters ? 'type')     OR jsonb_typeof(filters->'type') IN ('string', 'null'))
      AND (NOT (filters ? 'attendee') OR jsonb_typeof(filters->'attendee') IN ('string', 'null'))
      AND (NOT (filters ? 'date_from') OR filters->>'date_from' IS NULL OR (filters->>'date_from') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
      AND (NOT (filters ? 'date_to')   OR filters->>'date_to'   IS NULL OR (filters->>'date_to')   ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
    )
  );

-- 2. Preset de inbox nunca e compartilhado: sem isso a policy
--    "Users can view shared filters" (is_shared = true) exporia o preset a
--    qualquer authenticated.
ALTER TABLE public.saved_filters
  ADD CONSTRAINT saved_filters_inbox_not_shared_check
  CHECK (entity_type <> 'inbox' OR is_shared IS NOT TRUE);

-- 3. Teto por usuario. Dispara por STATEMENT (nao por linha) porque a contagem por
--    linha, num INSERT multi-linha, nao enxerga as linhas inseridas pela propria
--    sentenca (snapshot do comando) e deixaria o teto ser furado em bloco. O gatilho
--    de statement ve a tabela ja com as linhas da sentenca, e a excecao derruba a
--    sentenca inteira (nada parcial). O advisory lock de transacao serializa
--    gravacoes concorrentes do mesmo banco para que duas transacoes nao fechem o
--    teto com contagens defasadas.
CREATE OR REPLACE FUNCTION public.enforce_inbox_preset_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_limite constant integer := 50;
  v_excedeu_user uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('inbox_filter_presets'));

  SELECT u INTO v_excedeu_user
    FROM (
      SELECT user_id AS u
        FROM public.saved_filters
       WHERE entity_type = 'inbox'
       GROUP BY user_id
      HAVING count(*) > v_limite
       LIMIT 1
    ) excedentes;

  IF v_excedeu_user IS NOT NULL THEN
    RAISE EXCEPTION 'inbox_filter_presets_limit_exceeded'
      USING ERRCODE = '23514',
            DETAIL = format('Limite de %s presets de inbox por usuario atingido', v_limite);
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_inbox_preset_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_inbox_preset_limit ON public.saved_filters;
CREATE TRIGGER enforce_inbox_preset_limit
  AFTER INSERT OR UPDATE ON public.saved_filters
  FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_inbox_preset_limit();
