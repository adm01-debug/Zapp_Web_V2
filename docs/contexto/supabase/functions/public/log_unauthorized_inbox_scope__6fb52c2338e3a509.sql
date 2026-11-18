CREATE OR REPLACE FUNCTION public.log_unauthorized_inbox_scope(p_scope text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_scope text;
BEGIN
  -- Anonimo (ou sessao sem claim): nada e registrado.
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Escopo pedido, normalizado e travado na lista que a inbox aceita. Entrada invalida
  -- (nula/vazia/fora da lista/longa demais) nao quebra o chamador: vira 'unknown'
  -- e ainda assim fica auditada sem armazenar texto arbitrario em details/dedupe_key.
  v_scope := lower(btrim(coalesce(p_scope, '')));
  IF v_scope NOT IN ('mine', 'department', 'all') THEN
    v_scope := 'unknown';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, details, dedupe_key)
  VALUES (
    v_user_id,
    'unauthorized_inbox_scope_access',
    'inbox_scope',
    jsonb_build_object('scope', v_scope),
    'unauthorized_inbox_scope_access:'
      || v_user_id::text
      || ':' || v_scope
      || ':' || to_char(now() AT TIME ZONE 'utc', 'YYYYMMDDHH24')
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$function$
