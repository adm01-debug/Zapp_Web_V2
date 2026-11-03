CREATE OR REPLACE FUNCTION public.set_contact_blocked(p_contact_id uuid, p_blocked boolean)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid        uuid;
  v_blocked_at timestamptz;
BEGIN
  IF p_contact_id IS NULL OR p_blocked IS NULL THEN
    RAISE EXCEPTION 'invalid_contact_block_request' USING ERRCODE = '22023';
  END IF;

  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Autorizacao derivada da MESMA regra da policy de UPDATE de contacts. Se o contato NAO
  -- existe, can_edit_contact recebe NULL/NULL e a funcao tambem recusa — mesma excecao, sem
  -- revelar existencia.
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND public.can_edit_contact(c.assigned_to, c.queue_id)
  ) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  -- Uma unica instrucao = atomica. Idempotente: rebloquear mantem o instante/autor originais
  -- (COALESCE) e nao gera linha nova na trilha (blocked_at nao muda).
  UPDATE public.contacts
  SET blocked_at = CASE WHEN p_blocked THEN COALESCE(blocked_at, now()) ELSE NULL END,
      blocked_by = CASE WHEN p_blocked THEN COALESCE(blocked_by, v_uid) ELSE NULL END
  WHERE id = p_contact_id
  RETURNING blocked_at INTO v_blocked_at;

  RETURN v_blocked_at;
END;
$function$
