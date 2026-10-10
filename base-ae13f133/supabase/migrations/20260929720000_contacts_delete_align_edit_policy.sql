-- ============================================================================
-- Contatos F1 -- correcao: alinhar a EXCLUSAO (soft-delete) a regra de EDICAO
-- ============================================================================
-- Por que: a migration 20260929370000 (D1) permitiu excluir apenas para
-- `is_admin_or_supervisor(auth.uid())` OU o responsavel pelo contato
-- (`assigned_to` = perfil do chamador). Mas a policy de UPDATE do modulo
-- ("Users can update their assigned contacts", em public.contacts) permite
-- editar em tres casos:
--   1. `is_admin_or_supervisor(auth.uid())`
--   2. `assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))`
--   3. membro ativo da fila do contato (`queue_members` com `is_active`)
-- O menu "Excluir" aparece para todo mundo ao lado de "Editar", entao um agente
-- de fila via "Editar" funcionar e "Excluir" responder
-- "Contato nao encontrado ou sem permissao para excluir." -- relatado pelo
-- Joaquim em 29/09 ("nao podemos excluir nenhum contato").
--
-- Nada e concedido alem do que o modulo ja permite: o predicado abaixo e o
-- MESMO da policy de UPDATE/SELECT de public.contacts. Se a policy mudar, este
-- predicado precisa mudar junto (nao ha helper compartilhado para manter o diff
-- minimo -- ver "Proximos passos" no PR).
--
-- Layout `DECLARE ...; BEGIN` na mesma linha: a heuristica do hermes-db-migrar
-- que barra transacao explicita de topo casa tambem com o `BEGIN` de corpo
-- plpgsql em dollar-quote (falso positivo reportado a parte).

CREATE OR REPLACE FUNCTION public.delete_contact(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_id uuid; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = p_id
     AND c.deleted_at IS NULL
     AND (
       -- Mesmo predicado de "Users can update their assigned contacts" (public.contacts).
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
       OR EXISTS (
            SELECT 1
              FROM public.queue_members qm
             WHERE qm.queue_id = c.queue_id
               AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
               AND qm.is_active = true
          )
     )
  RETURNING c.id INTO v_id;

  -- Sem linha: contato inexistente, ja excluido ou fora do alcance do chamador. Uma unica
  -- mensagem para os tres casos evita enumeracao de contatos por quem nao pode ver.
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Contato nao encontrado ou sem permissao para excluir.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_contacts(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE v_count integer; BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.contacts c
     SET deleted_at = now()
   WHERE c.id = ANY(p_ids)
     AND c.deleted_at IS NULL
     AND (
       -- Mesmo predicado de "Users can update their assigned contacts" (public.contacts).
       public.is_admin_or_supervisor(auth.uid())
       OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
       OR EXISTS (
            SELECT 1
              FROM public.queue_members qm
             WHERE qm.queue_id = c.queue_id
               AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
               AND qm.is_active = true
          )
     );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nenhum contato excluido: sem permissao ou ja excluido.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_count;
END;
$function$;
