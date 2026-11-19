ALTER TABLE public.search_events ADD COLUMN client_event_id uuid

UPDATE public.search_events SET client_event_id = gen_random_uuid() WHERE client_event_id IS NULL

ALTER TABLE public.search_events ALTER COLUMN client_event_id SET DEFAULT gen_random_uuid(), ALTER COLUMN client_event_id SET NOT NULL

CREATE UNIQUE INDEX search_events_user_event_id_key ON public.search_events (user_id, client_event_id)

DROP POLICY IF EXISTS "Users can register their own search events" ON public.search_events

REVOKE INSERT ON TABLE public.search_events FROM authenticated

CREATE OR REPLACE FUNCTION public.log_search_event(p_term text, p_result_count integer, p_clicked boolean, p_event_id uuid DEFAULT NULL, p_result_kind text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE v_user_id uuid := auth.uid(); v_term text := btrim(coalesce(p_term, '')); v_term_length integer; v_had_results boolean; v_event_id uuid; v_result_kind text; BEGIN IF auth.role() IS DISTINCT FROM 'authenticated' OR v_user_id IS NULL THEN RAISE EXCEPTION 'not authorized' USING errcode = '42501'; END IF; v_term_length := char_length(v_term); IF p_result_count IS NULL OR p_result_count < 0 OR v_term_length < 3 OR v_term_length > 200 THEN RETURN; END IF; IF position('@' IN v_term) > 0 OR length(regexp_replace(v_term, '[^0-9]', '', 'g')) >= 7 OR v_term ~ '[A-Za-z0-9._~+/=-]{32,}' THEN RETURN; END IF; v_had_results := p_result_count > 0; IF p_clicked IS TRUE AND NOT v_had_results THEN RETURN; END IF; v_event_id := coalesce(p_event_id, gen_random_uuid()); v_result_kind := CASE WHEN p_clicked IS NOT TRUE THEN NULL WHEN p_result_kind IN ('message','contact','transcription','action','crm','other') THEN p_result_kind ELSE 'other' END; INSERT INTO public.search_events (user_id, client_event_id, term_length, had_results, result_kind, clicked) VALUES (v_user_id, v_event_id, v_term_length, v_had_results, v_result_kind, coalesce(p_clicked, false)) ON CONFLICT (user_id, client_event_id) DO UPDATE SET clicked = true, result_kind = excluded.result_kind WHERE excluded.clicked IS TRUE AND excluded.result_kind IS NOT NULL AND public.search_events.clicked IS FALSE AND public.search_events.had_results = excluded.had_results AND public.search_events.term_length = excluded.term_length; END; $function$

REVOKE ALL ON FUNCTION public.log_search_event(text, integer, boolean, uuid, text) FROM PUBLIC, anon, authenticated

GRANT EXECUTE ON FUNCTION public.log_search_event(text, integer, boolean, uuid, text) TO authenticated

COMMENT ON FUNCTION public.log_search_event(text, integer, boolean, uuid, text) IS 'Registra evento agregado da busca sem persistir o termo; o UUID opaco correlaciona o clique com a busca e torna a atualização idempotente.'
