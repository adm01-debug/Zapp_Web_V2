-- RPC: get_conversation_tab_counts
-- Badges das abas do painel central da conversa (Tarefas / Notas / Arquivos).
-- Resolve os 3 counts numa única ida ao banco — sem isso seriam 3 queries
-- disparadas a cada conversa aberta.
--
-- tasks_open  = conversation_tasks não concluídas do contato
-- notes_total = contact_notes do contato
-- files_total = mensagens do contato que carregam mídia (media_url não nulo)
--
-- SECURITY DEFINER: o filtro de visibilidade do contato é responsabilidade do
-- caller (o inbox só chama para a conversa que o usuário já tem aberta).
CREATE OR REPLACE FUNCTION public.get_conversation_tab_counts(p_contact_id uuid)
RETURNS TABLE(tasks_open integer, notes_total integer, files_total integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*)::integer FROM public.conversation_tasks t
      WHERE t.contact_id = p_contact_id
        AND COALESCE(t.status, 'pending') <> 'completed') AS tasks_open,
    (SELECT COUNT(*)::integer FROM public.contact_notes n
      WHERE n.contact_id = p_contact_id) AS notes_total,
    (SELECT COUNT(*)::integer FROM public.messages m
      WHERE m.contact_id = p_contact_id
        AND m.media_url IS NOT NULL) AS files_total
$$;
