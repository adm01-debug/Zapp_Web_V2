-- CV-026: RPC merge_brinde_state — merge atômico do delta B·R·I·N·D·E
-- Garante idempotência via state_version (otimistic locking).
-- Chamado pela edge copilot-live quando o modelo devolve brinde_delta.

CREATE OR REPLACE FUNCTION public.merge_brinde_state(
  p_session_id  uuid,
  p_delta       jsonb,
  p_version     integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  rows_updated integer;
BEGIN
  UPDATE public.copilot_sessions
  SET
    brinde_state  = brinde_state || p_delta,
    state_version = state_version + 1,
    updated_at    = now()
  WHERE id = p_session_id
    AND state_version = p_version;

  GET DIAGNOSTICS rows_updated = ROW_COUNT;
  RETURN rows_updated > 0;
END;
$$;

-- Permissão: service_role (edge functions); authenticated NÃO (RLS cobre o front)
REVOKE ALL ON FUNCTION public.merge_brinde_state(uuid, jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_brinde_state(uuid, jsonb, integer) TO service_role;

COMMENT ON FUNCTION public.merge_brinde_state IS
  'CV-026 — merge atômico do delta B·R·I·N·D·E com otimistic locking por state_version.';
