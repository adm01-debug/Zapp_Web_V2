-- P-003: RPC log_search_event estava ausente no banco e em qualquer migration.
-- O frontend (src/components/inbox/useGlobalSearchData.ts) chama:
--   supabase.rpc('log_search_event', { p_term, p_result_count, p_clicked })
-- sem passar result_kind, mas a tabela search_events tem a constraint:
--   clicked = (result_kind IS NOT NULL)
-- Portanto quando p_clicked=true, gravamos result_kind='other' como fallback;
-- quando false, result_kind=NULL.
-- O termo nunca e' gravado (privacidade): apenas term_length.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.log_search_event(text, integer, boolean);

CREATE OR REPLACE FUNCTION public.log_search_event(
  p_term         text,
  p_result_count integer,
  p_clicked      boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid;
  v_len      integer;
BEGIN
  -- anon não pode registrar eventos; service_role pode (v_uid fica NULL).
  -- authenticated deve ter UID.
  IF current_setting('role', true) = 'anon' THEN
    RAISE EXCEPTION 'not authenticated'
      USING errcode = '42501';
  END IF;
  v_uid := auth.uid();

  v_len := length(p_term);

  -- Entrada invalida: silencio (nao interrompe a UX de busca por tracking).
  IF v_len IS NULL OR v_len < 1 OR v_len > 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_events (
    user_id,
    term_length,
    had_results,
    clicked,
    result_kind
  ) VALUES (
    v_uid,
    v_len,
    (COALESCE(p_result_count, 0) > 0),
    COALESCE(p_clicked, false),
    CASE WHEN COALESCE(p_clicked, false) THEN 'other' ELSE NULL END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_search_event(text, integer, boolean)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_search_event(text, integer, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.log_search_event(text, integer, boolean) IS
  'Registra evento de busca global sem gravar o termo (apenas comprimento). '
  'Chamada pelo frontend apos filtragem isLoggableSearchTerm. '
  'result_kind cai em ''other'' quando clicked=true (frontend nao passa o tipo).';
