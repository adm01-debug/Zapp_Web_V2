-- assume_return_conversation
-- Rollback: dropa as duas RPCs novas; a migration nao altera dado nem objeto existente.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.assume_conversation(uuid);
--   drop function if exists public.return_conversation_to_queue(uuid, text);
--
-- Paridade V3 -> V2 (auditoria 2026-10-11, faixa C): o TicketActionsBar da V3 tem
-- "Assumir" e "Devolver a fila"; a V2 so tinha Transferir. Duas RPCs ADITIVAS,
-- SECURITY DEFINER, restritas por fila/papel e auditadas. Sem roteador sticky.
--
-- Estados reais de contacts.conversation_status (FSM 20260905080000/090000):
--   'open'    = em atendimento (com responsavel)  -> estado de "Assumir"
--   'waiting' = na fila (sem responsavel)         -> estado de "Devolver a fila"
--   'resolved' / 'archived' = encerrados (nao reabrem por aqui)
--
-- Nota de contrato: o texto do cartao cita auth.uid() para assigned_to, mas
-- contacts.assigned_to REFERENCES public.profiles(id) (20260409014536); o valor
-- correto e o profiles.id do chamador, obtido por get_profile_id_for_user().
-- O user_id de audit_logs e o auth.uid() do chamador.
--
-- Nenhum dado pessoal entra em audit_logs: so ids (profile/fila), estados e motivo textual.

CREATE OR REPLACE FUNCTION public.assume_conversation(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $f$
DECLARE
  v_user_id    uuid := auth.uid();
  v_profile_id uuid;
  v_contact    record;
  v_expected   uuid;
  v_is_admin   boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_user_id);
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin_or_supervisor(v_user_id);

  SELECT id, assigned_to, queue_id, conversation_status
    INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id;

  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_contact.conversation_status IN ('resolved', 'archived') THEN
    RAISE EXCEPTION 'conversation_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- Quem pode assumir: qualquer papel precisa pertencer ativamente a fila do contato.
  -- Admin/supervisor podem tomar por cima, mas nao fora das suas filas nem sem fila.
  IF v_contact.queue_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.queue_members qm
        WHERE qm.queue_id = v_contact.queue_id
          AND qm.profile_id = v_profile_id
          AND qm.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Ja tem responsavel e nao sou eu: so admin/supervisor assume por cima.
  v_expected := v_contact.assigned_to;
  IF v_expected IS NOT NULL AND v_expected <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'already_assigned' USING ERRCODE = 'P0001';
  END IF;

  -- Concorrencia otimista: so grava se o responsavel ainda for o que li.
  UPDATE public.contacts
     SET assigned_to = v_profile_id,
         conversation_status = 'open',
         conversation_status_changed_at = now()
   WHERE id = p_contact_id
     AND assigned_to IS NOT DISTINCT FROM v_expected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_assignment' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'conversation_assumed',
    'contact',
    p_contact_id,
    jsonb_build_object(
      'queue_id', v_contact.queue_id,
      'previous_assigned_to', v_expected,
      'assigned_to', v_profile_id,
      'previous_status', v_contact.conversation_status,
      'status', 'open'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'assigned_to', v_profile_id,
    'queue_id', v_contact.queue_id,
    'conversation_status', 'open'
  );
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.assume_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assume_conversation(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.return_conversation_to_queue(p_contact_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $f$
DECLARE
  v_user_id    uuid := auth.uid();
  v_profile_id uuid;
  v_contact    record;
  v_expected   uuid;
  v_is_admin   boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  v_profile_id := public.get_profile_id_for_user(v_user_id);
  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_admin_or_supervisor(v_user_id);

  SELECT id, assigned_to, queue_id, conversation_status
    INTO v_contact
    FROM public.contacts
   WHERE id = p_contact_id;

  IF v_contact.id IS NULL THEN
    RAISE EXCEPTION 'contact_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_contact.conversation_status IN ('resolved', 'archived') THEN
    RAISE EXCEPTION 'conversation_not_active' USING ERRCODE = 'P0001';
  END IF;

  -- Devolver a fila tambem e restrito a fila: nem admin/supervisor atua fora
  -- das suas filas, e contato sem fila nao pode ser devolvido "a fila".
  IF v_contact.queue_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.queue_members qm
        WHERE qm.queue_id = v_contact.queue_id
          AND qm.profile_id = v_profile_id
          AND qm.is_active IS TRUE
     ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Idempotente para usuario autorizado da fila: sem responsavel, ja esta na fila.
  IF v_contact.assigned_to IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'contact_id', p_contact_id,
      'assigned_to', NULL,
      'queue_id', v_contact.queue_id,
      'conversation_status', v_contact.conversation_status
    );
  END IF;

  -- So o responsavel atual ou admin/supervisor (ja validado na fila) devolvem a fila.
  IF v_contact.assigned_to <> v_profile_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_expected := v_contact.assigned_to;

  UPDATE public.contacts
     SET assigned_to = NULL,
         conversation_status = 'waiting',
         conversation_status_changed_at = now()
   WHERE id = p_contact_id
     AND assigned_to = v_expected;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'concurrent_update' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_user_id,
    'conversation_returned_to_queue',
    'contact',
    p_contact_id,
    jsonb_build_object(
      'queue_id', v_contact.queue_id,
      'previous_assigned_to', v_expected,
      'reason', p_reason,
      'previous_status', v_contact.conversation_status,
      'status', 'waiting'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'assigned_to', NULL,
    'queue_id', v_contact.queue_id,
    'conversation_status', 'waiting'
  );
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid, text) TO authenticated;
