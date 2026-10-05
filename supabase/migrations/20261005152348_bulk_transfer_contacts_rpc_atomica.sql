-- bulk_transfer_contacts_rpc_atomica
-- Rollback: DROP FUNCTION IF EXISTS public.bulk_transfer_contacts(uuid[], uuid, uuid, text);

-- Idempotente de propósito: o banco local reaplica as migrations a cada up; sem
-- o DROP a segunda passada morre com "function already exists".
DROP FUNCTION IF EXISTS public.bulk_transfer_contacts(uuid[], uuid, uuid, text);

-- ============================================================================
-- R2-INB-009 / item 88 (refazer): transferência em lote atômica.
--
-- O defeito da entrega anterior: o hook fazia duas escritas separadas
-- (INSERT em conversation_events + UPDATE em contacts). Se o UPDATE falhasse
-- ou atingisse 0 linhas — o RLS filtra em silêncio, sem erro — os eventos de
-- transferência ficavam gravados para contatos que não mudaram de dono.
--
-- Esta RPC torna as duas escritas UMA transação: primeiro insere os eventos
-- (a policy de INSERT só aceita o evento enquanto o contato ainda está
-- atribuído ao operador), depois atualiza contacts com RETURNING id e ABORTA
-- quando o número de linhas atualizadas difere do número de ids — qualquer
-- exceção desfaz os eventos já inseridos na mesma transação.
--
-- SECURITY INVOKER de propósito: o RLS existente continua valendo (a decisão
-- de quem pode transferir fica nas policies, não na função). performed_by é
-- sempre o perfil do auth.uid() — o chamador não escolhe o autor do evento.
--
-- Regressão conhecida (registrada no cartão como pergunta ao dono): a policy
-- de INSERT de conversation_events exige admin/supervisor OU contato
-- atribuído ao próprio perfil. Um operador que enxerga o contato SÓ por ser
-- membro ativo da fila (can_edit_contact via queue_id, sem assigned_to) tem o
-- UPDATE permitido mas o INSERT de evento negado — a RPC aborta e a
-- transferência em lote falha para esse caso. Ampliar a policy é decisão de
-- segurança do dono, fora do escopo desta migration.
-- ============================================================================

CREATE FUNCTION public.bulk_transfer_contacts(
  p_contact_ids uuid[],
  p_to_agent_id uuid DEFAULT NULL,
  p_to_queue_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ids uuid[];
  v_profile_id uuid;
  v_updated integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessao autenticada.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Exatamente UM destino: ou agente, ou fila (contrato do TransferDialog).
  IF (p_to_agent_id IS NULL) = (p_to_queue_id IS NULL) THEN
    RAISE EXCEPTION 'Informe exatamente um destino: agente ou fila.'
      USING ERRCODE = '22023';
  END IF;

  -- Ids únicos: duplicado inflaria o denominador da conferência final.
  SELECT array_agg(DISTINCT v) INTO v_ids FROM unnest(p_contact_ids) AS v;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Lista de contatos vazia.' USING ERRCODE = '22023';
  END IF;

  -- Autor do evento = perfil do chamador (a policy de INSERT valida de novo).
  SELECT p.id INTO v_profile_id
    FROM public.profiles p
   WHERE p.user_id = auth.uid()
   LIMIT 1;

  -- 1) Eventos ANTES do update: a policy de INSERT de conversation_events só
  --    aceita o evento enquanto o contato ainda está atribuído ao operador
  --    (is_admin_or_supervisor OU assigned_to = meu perfil). Depois do UPDATE
  --    o contato já pertence ao destino e o INSERT seria recusado.
  INSERT INTO public.conversation_events (
    contact_id, event_type, to_agent_id, to_queue_id, performed_by, metadata
  )
  SELECT v_id,
         'transfer',
         p_to_agent_id,
         p_to_queue_id,
         v_profile_id,
         CASE
           WHEN p_note IS NULL OR btrim(p_note) = '' THEN '{}'::jsonb
           ELSE jsonb_build_object('note', p_note)
         END
    FROM unnest(v_ids) AS v_id;

  -- 2) Update com RETURNING: conta quantos contatos o RLS deixou atualizar.
  WITH upd AS (
    UPDATE public.contacts
       SET assigned_to = CASE WHEN p_to_agent_id IS NOT NULL THEN p_to_agent_id ELSE assigned_to END,
           queue_id    = CASE WHEN p_to_queue_id IS NOT NULL THEN p_to_queue_id ELSE queue_id END
     WHERE id = ANY (v_ids)
    RETURNING id
  )
  SELECT count(*) INTO v_updated FROM upd;

  -- Divergência = algum contato não atualizou (sem permissão ou inexistente):
  -- aborta e a transação desfaz TAMBÉM os eventos gravados acima.
  IF v_updated <> array_length(v_ids, 1) THEN
    RAISE EXCEPTION 'Transferencia em lote abortada: % de % contatos atualizados.',
      v_updated, array_length(v_ids, 1)
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.bulk_transfer_contacts(uuid[], uuid, uuid, text) IS
  'R2-INB-009 (item 88): transferência em lote atômica. Insere evento transfer por contato (performed_by = perfil do auth.uid()) e atualiza contacts na mesma transação; aborta se o RLS deixar de atualizar algum id, desfazendo os eventos. SECURITY INVOKER: mantém o RLS das duas tabelas.';
