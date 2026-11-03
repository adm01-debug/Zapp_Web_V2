CREATE OR REPLACE FUNCTION public.delete_department(p_department_id uuid, p_move_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_department_name text;
  v_members integer := 0;
  v_conversations integer := 0;
  v_queues integer := 0;
  v_moved_members integer := 0;
  v_moved_conversations integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT d.name INTO v_department_name
  FROM public.departments d
  WHERE d.id = p_department_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'department_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_move_to IS NOT NULL THEN
    IF p_move_to = p_department_id THEN
      RAISE EXCEPTION 'invalid_move_target' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = p_move_to) THEN
      RAISE EXCEPTION 'move_target_not_found' USING ERRCODE = 'P0002';
    END IF;

    -- O indice unico idx_team_conversations_dept_unique admite UMA conversa de
    -- type='department' por departamento: mover duas colidiria. Recusa antes do DML.
    IF EXISTS (
         SELECT 1 FROM public.team_conversations tc
          WHERE tc.department_id = p_department_id AND tc.type = 'department'
       )
       AND EXISTS (
         SELECT 1 FROM public.team_conversations tc
          WHERE tc.department_id = p_move_to AND tc.type = 'department'
       )
    THEN
      RAISE EXCEPTION 'move_target_already_has_department_conversation' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT count(*) INTO v_members
  FROM public.profiles p
  WHERE p.department_id = p_department_id;

  SELECT count(*) INTO v_conversations
  FROM public.team_conversations tc
  WHERE tc.department_id = p_department_id;

  SELECT count(DISTINCT qm.queue_id) INTO v_queues
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  WHERE p.department_id = p_department_id
    AND qm.is_active IS NOT FALSE;

  IF (v_members > 0 OR v_conversations > 0 OR v_queues > 0) AND p_move_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'department_in_use',
      'members', v_members,
      'conversations', v_conversations,
      'queues', v_queues
    );
  END IF;

  IF p_move_to IS NOT NULL THEN
    -- O gatilho update_profiles_updated_at regrava updated_at em QUALQUER UPDATE. Uma
    -- movimentacao de vinculo (quem pertence a qual departamento) nao e mudanca de conteudo
    -- do perfil, entao a data nao deve ser reescrita (recusa real de 06/10). Desliga SO esse
    -- gatilho durante o UPDATE e o religa logo depois, na MESMA transacao: erro adiante
    -- aborta tudo e o gatilho volta intacto (DDL e transacional).
    ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;
    UPDATE public.profiles
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_members = ROW_COUNT;
    ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;

    -- Mesmo motivo para as conversas migradas.
    ALTER TABLE public.team_conversations DISABLE TRIGGER update_team_conversations_updated_at;
    UPDATE public.team_conversations
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_conversations = ROW_COUNT;
    -- A FK de team_conversations e DEFERRABLE: o UPDATE deixa evento pendente e o
    -- ALTER ... ENABLE recusaria com "pending trigger events". Forco as checagens
    -- diferidas agora (SET CONSTRAINTS e do escopo da transacao) e religo o gatilho.
    SET CONSTRAINTS ALL IMMEDIATE;
    ALTER TABLE public.team_conversations ENABLE TRIGGER update_team_conversations_updated_at;
  END IF;

  DELETE FROM public.departments WHERE id = p_department_id;

  IF p_move_to IS NOT NULL THEN
    INSERT INTO public.department_audit_logs (department_id, action, profile_id, details)
    VALUES (
      p_move_to,
      'delete_department',
      public.current_profile_id(),
      jsonb_build_object(
        'deleted_department_id', p_department_id,
        'deleted_department_name', v_department_name,
        'moved_members', v_moved_members,
        'moved_conversations', v_moved_conversations
      )
    );
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_uid,
    'delete_department',
    'department',
    p_department_id,
    jsonb_build_object(
      'department_name', v_department_name,
      'move_to', p_move_to,
      'moved_members', v_moved_members,
      'moved_conversations', v_moved_conversations,
      'had_queue_links', v_queues
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'department_id', p_department_id,
    'name', v_department_name,
    'moved_members', v_moved_members,
    'moved_conversations', v_moved_conversations
  );
END;
$function$
