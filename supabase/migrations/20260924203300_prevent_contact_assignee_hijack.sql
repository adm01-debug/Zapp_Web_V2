CREATE OR REPLACE FUNCTION public.prevent_contact_assignee_hijack()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Espelha trg_prevent_contact_queue_hijack (20260924133700): a policy
  -- "Users can update their assigned contacts" tem USING (queue-membership
  -- ou ser o assigned_to atual) mas nenhum WITH CHECK simetrico -- um agente
  -- de fila compartilhada podia setar assigned_to para QUALQUER profiles.id
  -- do sistema, nao so um colega da mesma fila. Mesmo guard de service_role
  -- do trigger irmao: Edge Functions (ex. reassign_absent_agents) continuam
  -- livres para rotear.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NEW.assigned_to IS NOT NULL
     AND NOT is_admin_or_supervisor(auth.uid())
  THEN
    IF NEW.queue_id IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM queue_members qm
        WHERE qm.queue_id = NEW.queue_id
          AND qm.profile_id = NEW.assigned_to
          AND qm.is_active = true
      ) THEN
        RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
      END IF;
    ELSIF NEW.assigned_to <> get_profile_id_for_user(auth.uid()) THEN
      -- Sem fila (queue_id nulo): so pode reivindicar para si mesmo.
      RAISE EXCEPTION 'Sem permissao para atribuir contato a este agente';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_contact_assignee_hijack ON public.contacts;

CREATE TRIGGER trg_prevent_contact_assignee_hijack
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW
  WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
  EXECUTE FUNCTION public.prevent_contact_assignee_hijack();
