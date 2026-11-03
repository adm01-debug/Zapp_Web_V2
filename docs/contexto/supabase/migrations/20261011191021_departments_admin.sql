DROP POLICY IF EXISTS departments_admin_write ON public.departments

CREATE POLICY departments_admin_write ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()))

REVOKE DELETE ON public.departments FROM authenticated

CREATE OR REPLACE FUNCTION public.delete_department(
  p_department_id uuid,
  p_move_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
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
    ALTER TABLE public.profiles DISABLE TRIGGER update_profiles_updated_at;
    UPDATE public.profiles
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_members = ROW_COUNT;
    ALTER TABLE public.profiles ENABLE TRIGGER update_profiles_updated_at;

    ALTER TABLE public.team_conversations DISABLE TRIGGER update_team_conversations_updated_at;
    UPDATE public.team_conversations
       SET department_id = p_move_to
     WHERE department_id = p_department_id;
    GET DIAGNOSTICS v_moved_conversations = ROW_COUNT;
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
$fn$

CREATE OR REPLACE FUNCTION public.departments_overview()
RETURNS TABLE (
  department_id uuid,
  name text,
  is_active boolean,
  member_count bigint,
  queue_count bigint,
  conversation_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.is_active,
    (SELECT count(*) FROM public.profiles p WHERE p.department_id = d.id),
    (SELECT count(DISTINCT qm.queue_id)
       FROM public.queue_members qm
       JOIN public.profiles p2 ON p2.id = qm.profile_id
      WHERE p2.department_id = d.id
        AND qm.is_active IS NOT FALSE),
    (SELECT count(*) FROM public.team_conversations tc WHERE tc.department_id = d.id)
  FROM public.departments d
  ORDER BY d.name;
END;
$fn$

REVOKE EXECUTE ON FUNCTION public.delete_department(uuid, uuid) FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.delete_department(uuid, uuid) TO authenticated

REVOKE EXECUTE ON FUNCTION public.departments_overview() FROM PUBLIC, anon

GRANT EXECUTE ON FUNCTION public.departments_overview() TO authenticated
