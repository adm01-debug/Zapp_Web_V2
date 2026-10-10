-- Migration 20261003162707 — files_total do RPC get_conversation_tab_counts deve excluir apagadas.
--
-- PROBLEMA (etapa 42 do PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS). O `files_total` do RPC
-- contava `media_url IS NOT NULL` sem filtrar apagadas, enquanto a lista da aba e o filtro da
-- etapa 09 usam `COALESCE(is_deleted, false) = false`. Resultado: o chip "Todos" e o badge da
-- aba divergem depois de uma exclusão (a etapa 35 marca `is_deleted = true` e mantém a linha).
-- Medido na definição viva do banco canônico (`pg_get_functiondef`, 03/10/2026).
--
-- MUDANÇA MÍNIMA: só a consulta de `files_total` ganha
--   AND COALESCE(m.is_deleted, false) = false
-- Todo o resto é reproduzido VERBATIM da definição viva: assinatura, RETURNS TABLE, LANGUAGE
-- plpgsql, STABLE, SECURITY DEFINER, `SET search_path TO 'public', 'pg_temp'`, a guarda de
-- visibilidade (que levanta 42501) e as contagens de tasks e notas.
--
-- CLASSE: contrato (create or replace function) — o hermes-tarefa-mergear aplica após merge+deploy.
--
-- rollback: recriar a definição ANTERIOR deste RPC (mesmo corpo, sem o filtro novo). SQL completo:
--   CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
--    RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
--    LANGUAGE plpgsql
--    STABLE SECURITY DEFINER
--    SET search_path TO 'public', 'pg_temp'
--   AS $function$
--   DECLARE
--     v_profile_id uuid;
--   BEGIN
--     IF auth.uid() IS NULL
--        OR NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
--       RAISE EXCEPTION 'contact is not visible to current user'
--         USING ERRCODE = '42501';
--     END IF;
--
--     v_profile_id := public.current_profile_id();
--
--     RETURN QUERY
--     SELECT
--       (SELECT count(*)::integer
--        FROM public.conversation_tasks AS t
--        WHERE t.contact_id = p_contact_id
--          AND t.created_by = v_profile_id
--          AND t.status NOT IN ('done','cancelled')),
--       (SELECT count(*)::integer
--        FROM public.contact_notes AS n
--        WHERE n.contact_id = p_contact_id),
--       (SELECT count(*)::integer
--        FROM public.messages AS m
--        WHERE m.contact_id = p_contact_id
--          AND m.media_url IS NOT NULL);
--   END;
--   $function$;

CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
 RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- arquivos: agora exclui apagadas, com o MESMO filtro da lista da aba (etapa 09/35)
    (SELECT count(*)::integer
     FROM public.messages AS m
     WHERE m.contact_id = p_contact_id
       AND m.media_url IS NOT NULL
       AND COALESCE(m.is_deleted, false) = false);
END;
$function$;
