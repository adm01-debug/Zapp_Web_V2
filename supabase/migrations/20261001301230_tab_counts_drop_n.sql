-- migration: tab_counts_drop_n
-- Etapa 97 — remove `reminders_pending` do RETURNS TABLE de get_conversation_tab_counts.
-- Classe: CONTRATO (create or replace). PR SEPARADA e SEM MERGE: aguarda APROVADO.
-- Aplicar sem o front atualizado deixa a UI lendo um campo que nao existe mais; por isso a ordem e
-- front + migration juntos, e o merge so depois do APROVADO.
-- rollback: reaplicar supabase/migrations/20260928140200_tab_counts_tasks_own.sql, que devolve a funcao
-- com reminders_pending fixo em 0. E CREATE OR REPLACE da funcao inteira, sem DDL de coluna.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(
  tasks_open   integer,
  notes_total  integer,
  files_total  integer
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
    -- tasks abertas DO USUARIO ATUAL para este contato
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
       AND m.media_url IS NOT NULL);
END;
$$;

COMMIT;

-- ROLLBACK:
-- Restaurar a versao com a coluna (migration 20260928140200_tab_counts_tasks_own.sql), que devolve
-- reminders_pending fixo em 0. Reaplicar a funcao inteira, sem DDL de coluna.
