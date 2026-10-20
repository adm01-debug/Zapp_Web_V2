-- migration: tab_counts_tasks_own
-- Atualiza get_conversation_tab_counts para filtrar tarefas apenas do usuário atual
-- e remove reminders_pending (passa a retornar 0 para compatibilidade até cutover).
BEGIN;

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(
  tasks_open         integer,
  notes_total        integer,
  files_total        integer,
  reminders_pending  integer   -- mantido em 0 até cutover (Fase 11)
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_profile_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'contact is not visible to current user'
      USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.current_profile_id();

  RETURN QUERY
  SELECT
    -- tasks abertas DO USUÁRIO ATUAL para este contato
    (SELECT count(*)::integer
     FROM public.conversation_tasks AS t
     WHERE t.contact_id = p_contact_id
       AND t.created_by = v_profile_id
       AND t.status NOT IN ('done','cancelled')),
    -- notas totais (inalterado)
    (SELECT count(*)::integer
     FROM public.contact_notes AS n
     WHERE n.contact_id = p_contact_id),
    -- arquivos (inalterado)
    (SELECT count(*)::integer
     FROM public.messages AS m
     WHERE m.contact_id = p_contact_id
       AND m.media_url IS NOT NULL),
    -- reminders_pending → 0 (reminders migrados; campo removido na Fase 11)
    0::integer;
END;
$$;

COMMIT;

-- ROLLBACK:
-- Restaurar a versão anterior da função (ver migration 20260928140000 para o backup)
