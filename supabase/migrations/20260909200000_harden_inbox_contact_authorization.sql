-- Predicado canônico e caller-bound para visibilidade de contatos.
-- Corrige IDOR no RPC de badges e policies contraditórias de contact_notes.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_profile_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_profile_id_for_user(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_id_for_user(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_visible_agent_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT profile.id
  FROM public.profiles AS profile
  WHERE _user_id = auth.uid()
    AND profile.user_id = _user_id
  UNION
  SELECT visibility.can_see_agent_id
  FROM public.agent_visibility_grants AS visibility
  JOIN public.profiles AS viewer ON viewer.id = visibility.agent_id
  WHERE _user_id = auth.uid()
    AND viewer.user_id = _user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_roles AS role_assignment
      WHERE role_assignment.user_id = _user_id
        AND role_assignment.role = 'special_agent'
    );
$$;

REVOKE ALL ON FUNCTION public.get_visible_agent_ids(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_visible_agent_ids(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_contact_visible_to_user(
  _contact_id uuid,
  _user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.contacts AS contact
      WHERE contact.id = _contact_id
        AND (
          public.is_admin_or_supervisor(_user_id)
          OR contact.assigned_to IN (
            SELECT public.get_visible_agent_ids(_user_id)
          )
          OR EXISTS (
            SELECT 1
            FROM public.queue_members AS member
            WHERE member.queue_id = contact.queue_id
              AND member.profile_id = public.get_profile_id_for_user(_user_id)
              AND member.is_active = true
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.is_contact_visible_to_user(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_contact_visible_to_user(uuid, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'contact is not visible to current user'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*)::integer
       FROM public.conversation_tasks AS task
      WHERE task.contact_id = p_contact_id
        AND coalesce(task.status, 'pending') <> 'completed'),
    (SELECT count(*)::integer
       FROM public.contact_notes AS note
      WHERE note.contact_id = p_contact_id),
    (SELECT count(*)::integer
       FROM public.messages AS message
      WHERE message.contact_id = p_contact_id
        AND message.media_url IS NOT NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.get_conversation_tab_counts(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_tab_counts(uuid)
  TO authenticated;

-- RLS nao substitui ACL. Remove privilegios de tabela desnecessarios que
-- sobreviveram de defaults historicos e conserva apenas o CRUD requerido.
REVOKE ALL PRIVILEGES ON TABLE public.contact_notes FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.contact_notes FROM authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.contact_notes TO authenticated, service_role;

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

DO $drop_contact_note_policies$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'contact_notes'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.contact_notes',
      policy_record.policyname
    );
  END LOOP;
END;
$drop_contact_note_policies$;

CREATE POLICY "contact_notes_select_policy"
  ON public.contact_notes
  FOR SELECT
  TO authenticated
  USING (public.is_contact_visible_to_user(contact_id, auth.uid()));

CREATE POLICY "contact_notes_insert_policy"
  ON public.contact_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

CREATE POLICY "contact_notes_update_policy"
  ON public.contact_notes
  FOR UPDATE
  TO authenticated
  USING (
    author_id = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  )
  WITH CHECK (
    author_id = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

CREATE POLICY "contact_notes_delete_policy"
  ON public.contact_notes
  FOR DELETE
  TO authenticated
  USING (
    author_id = public.get_profile_id_for_user(auth.uid())
    AND public.is_contact_visible_to_user(contact_id, auth.uid())
  );

CREATE OR REPLACE FUNCTION public.guard_contact_note_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (NEW.contact_id, NEW.author_id)
    IS DISTINCT FROM (OLD.contact_id, OLD.author_id) THEN
    RAISE EXCEPTION 'contact note identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_contact_note_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_contact_note_identity ON public.contact_notes;
CREATE TRIGGER guard_contact_note_identity
  BEFORE UPDATE OF contact_id, author_id
  ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_contact_note_identity();

COMMIT;
