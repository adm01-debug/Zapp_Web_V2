-- P003: Criar RPC log_search_event ausente no banco
-- Achado: S2-01 — frontend chama supabase.rpc('log_search_event') mas função não existe
-- Status: migration 20261026120300_log_search_event_rpc.sql em PR #2186 (não aplicada)
-- Aplicar via: PR #2186 merge → db-migrate.yml

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
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated'
      USING errcode = '42501';
  END IF;

  v_len := length(p_term);

  -- Entrada inválida: silêncio (não interrompe a UX de busca por tracking)
  IF v_len IS NULL OR v_len < 1 OR v_len > 200 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_events (
    user_id, term_length, had_results, clicked, result_kind
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

-- === ROLLBACK (se necessário reverter) ===
-- DROP FUNCTION IF EXISTS public.log_search_event(text, integer, boolean);
