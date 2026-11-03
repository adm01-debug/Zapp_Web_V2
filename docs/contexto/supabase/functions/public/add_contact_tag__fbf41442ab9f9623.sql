CREATE OR REPLACE FUNCTION public.add_contact_tag(p_contact_id uuid, p_tag text)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tag  text;
  v_tags text[];
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Mesma régua de autorização das demais RPCs de contato: recusa contato inexistente
  -- e contato que o usuário não pode editar, sempre com o MESMO erro (42501).
  PERFORM public.require_contact_edit_permission(p_contact_id);

  v_tag := btrim(COALESCE(p_tag, ''));
  IF v_tag = '' THEN
    RAISE EXCEPTION 'contact_tag_empty' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_tag) > 40 THEN
    RAISE EXCEPTION 'contact_tag_too_long' USING ERRCODE = '22023';
  END IF;

  -- Leitura-escrita atômica: o append e o teste de idempotência rodam na MESMA sentença.
  -- Sob READ COMMITTED, se outra transação já tocou a linha, o Postgres reavalia a
  -- condição e o SET sobre a versão mais nova — os dois appends sobrevivem e a
  -- comparação de idempotência enxerga o valor recém-gravado.
  UPDATE public.contacts AS c
     SET tags = COALESCE(c.tags, '{}'::text[]) || ARRAY[v_tag],
         updated_at = now()
   WHERE c.id = p_contact_id
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(COALESCE(c.tags, '{}'::text[])) AS t(existing)
       WHERE lower(t.existing) = lower(v_tag)
     )
  RETURNING c.tags INTO v_tags;

  IF v_tags IS NULL THEN
    -- Nada foi atualizado: a tag já estava lá (idempotente). Devolve o estado atual.
    SELECT COALESCE(c.tags, '{}'::text[]) INTO v_tags
    FROM public.contacts AS c
    WHERE c.id = p_contact_id;
    RETURN v_tags;
  END IF;

  INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, details)
  VALUES (
    'contact_tag_added', 'contact', p_contact_id, auth.uid(),
    jsonb_build_object('tag', v_tag)
  );

  RETURN v_tags;
END;
$function$
