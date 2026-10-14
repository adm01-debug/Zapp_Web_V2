-- incoming_call_destinatarios_sem_responsavel
-- Rollback: recria record_incoming_call_event na versao de 20261002531230 (7 params, 1 destinatario = dono do contato, id do md5 sem o usuario) e restaura o ACL service_role-only. Nenhuma notificacao ja criada e apagada (nao ha DML inverso).
-- Rollback (SQL executável, na ordem):
--   create or replace function public.record_incoming_call_event( p_contact_id uuid, p_whatsapp_connection_id uuid, p_status text, p_is_video boolean, p_provider_event_id text default null, p_should_notify boolean default false, p_direction text default null ) returns table (call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean) language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$ DECLARE v_agent_id uuid; v_agent_user_id uuid; v_contact_name text; v_contact_phone text; v_contact_connection_id uuid; v_event_id text := nullif(btrim(p_provider_event_id), ''); v_call_id uuid; v_persisted_status text; v_notification_id uuid; v_notification_candidate uuid; v_notification_created boolean := false; v_call_duplicate boolean := false; v_row_count integer := 0; v_existing_notification record; BEGIN IF p_status NOT IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed') THEN RAISE EXCEPTION 'invalid incoming call status' USING ERRCODE = '22023'; END IF; IF v_event_id IS NOT NULL AND char_length(v_event_id) > 200 THEN RAISE EXCEPTION 'provider event id exceeds 200 characters' USING ERRCODE = '22023'; END IF; IF p_should_notify AND p_status <> 'ringing' THEN RAISE EXCEPTION 'only ringing calls can create notifications' USING ERRCODE = '22023'; END IF; SELECT c.assigned_to, c.name, c.phone, c.whatsapp_connection_id INTO v_agent_id, v_contact_name, v_contact_phone, v_contact_connection_id FROM public.contacts AS c WHERE c.id = p_contact_id; IF NOT FOUND THEN RAISE EXCEPTION 'incoming call contact not found' USING ERRCODE = 'P0002'; END IF; IF v_contact_connection_id IS DISTINCT FROM p_whatsapp_connection_id THEN RAISE EXCEPTION 'incoming call connection does not match contact' USING ERRCODE = '23514'; END IF; IF v_agent_id IS NOT NULL THEN SELECT p.user_id INTO v_agent_user_id FROM public.profiles AS p WHERE p.id = v_agent_id; END IF; IF v_event_id IS NOT NULL THEN SELECT EXISTS ( SELECT 1 FROM public.calls AS existing WHERE existing.whatsapp_connection_id = p_whatsapp_connection_id AND existing.provider_event_id = v_event_id ) INTO v_call_duplicate; INSERT INTO public.calls ( contact_id, whatsapp_connection_id, agent_id, direction, status, started_at, answered_at, ended_at, notes, provider_event_id, channel, provider_call_id, peer_number, peer_name ) VALUES ( p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status, now(), CASE WHEN p_status = 'answered' THEN now() ELSE NULL END, CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END, CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END, v_event_id, 'whatsapp', v_event_id, v_contact_phone, v_contact_name ) ON CONFLICT (whatsapp_connection_id, provider_event_id) WHERE provider_event_id IS NOT NULL DO UPDATE SET contact_id = EXCLUDED.contact_id, agent_id = COALESCE(public.calls.agent_id, EXCLUDED.agent_id), status = CASE WHEN public.calls.status IN ('ended', 'missed', 'busy', 'failed') THEN public.calls.status WHEN public.calls.status = 'answered' AND EXCLUDED.status = 'ringing' THEN public.calls.status ELSE EXCLUDED.status END, answered_at = COALESCE(public.calls.answered_at, EXCLUDED.answered_at), ended_at = COALESCE(public.calls.ended_at, EXCLUDED.ended_at), notes = COALESCE(public.calls.notes, EXCLUDED.notes), channel = COALESCE(public.calls.channel, EXCLUDED.channel), provider_call_id = COALESCE(public.calls.provider_call_id, EXCLUDED.provider_call_id), peer_number = COALESCE(public.calls.peer_number, EXCLUDED.peer_number), peer_name = COALESCE(public.calls.peer_name, EXCLUDED.peer_name), talk_seconds = COALESCE( public.calls.talk_seconds, CASE WHEN COALESCE(public.calls.ended_at, EXCLUDED.ended_at) IS NOT NULL AND COALESCE(public.calls.answered_at, EXCLUDED.answered_at) IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM ( COALESCE(public.calls.ended_at, EXCLUDED.ended_at) - COALESCE(public.calls.answered_at, EXCLUDED.answered_at) ))::int) ELSE NULL END ) RETURNING id, status INTO v_call_id, v_persisted_status; ELSE INSERT INTO public.calls ( contact_id, whatsapp_connection_id, agent_id, direction, status, started_at, answered_at, ended_at, notes, channel, peer_number, peer_name ) VALUES ( p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status, now(), CASE WHEN p_status = 'answered' THEN now() ELSE NULL END, CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END, CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END, 'whatsapp', v_contact_phone, v_contact_name ) RETURNING id, status INTO v_call_id, v_persisted_status; END IF; IF p_should_notify AND v_persisted_status = 'ringing' AND v_agent_user_id IS NOT NULL THEN v_notification_candidate := CASE WHEN v_event_id IS NULL THEN gen_random_uuid() ELSE md5( 'zapp:incoming-call:v1:' || p_whatsapp_connection_id::text || ':' || v_event_id )::uuid END; INSERT INTO public.notifications (id, user_id, type, title, message, metadata) VALUES ( v_notification_candidate, v_agent_user_id, 'incoming_call', CASE WHEN p_is_video THEN '📹 Chamada de vídeo recebida' ELSE '📞 Chamada de voz recebida' END, COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato') || ' está ligando para você', jsonb_strip_nulls(jsonb_build_object( 'contact_id', p_contact_id, 'contact_name', COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato'), 'phone', v_contact_phone, 'is_video', p_is_video, 'call_status', v_persisted_status, 'whatsapp_connection_id', p_whatsapp_connection_id, 'call_id', v_call_id, 'event_id', v_event_id )) ) ON CONFLICT (id) DO NOTHING RETURNING id INTO v_notification_id; GET DIAGNOSTICS v_row_count = ROW_COUNT; v_notification_created := v_row_count = 1; IF NOT v_notification_created THEN v_notification_id := v_notification_candidate; SELECT n.user_id, n.type, n.metadata INTO v_existing_notification FROM public.notifications AS n WHERE n.id = v_notification_candidate; IF NOT FOUND OR v_existing_notification.user_id IS DISTINCT FROM v_agent_user_id OR v_existing_notification.type IS DISTINCT FROM 'incoming_call' OR v_existing_notification.metadata->>'event_id' IS DISTINCT FROM v_event_id THEN RAISE EXCEPTION 'incoming call notification identity conflict' USING ERRCODE = '23505'; END IF; END IF; END IF; RETURN QUERY SELECT v_call_id, v_notification_id, v_notification_created, v_call_duplicate OR ( p_should_notify AND v_agent_user_id IS NOT NULL AND v_event_id IS NOT NULL AND NOT v_notification_created ); END; $function$;
--   revoke all on function public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text) from public, anon, authenticated; grant execute on function public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text) to service_role;
--
-- Corrige o achado de paridade V3 -> V2 (auditoria dos hooks do inbox, 13/10/2026):
-- a RPC gravava a linha em `calls`, mas so criava a notificacao `incoming_call` se
-- o contato tivesse `assigned_to` resolvido para um usuario (20261002531230:~147,
-- `v_agent_user_id IS NOT NULL`). Contato novo / ainda na fila (`assigned_to` nulo)
-- ou dono offline = nenhum alerta; o hook `useIncomingCallListener.ts` so escuta as
-- notificacoes do proprio `user_id`, entao a chamada tocava no vazio.
--
-- Decisao adotada (13/10, o dono pode vetar): quando nao ha responsavel OU o
-- responsavel esta `offline` em `agent_presence`, notificar
--
--   1. o responsavel explicito (`contacts.assigned_to`), quando ele esta ONLINE
--      (prioridade — comportamento de hoje preservado);
--   2. senao, os membros ATIVOS e ONLINE da fila do contato (`contacts.queue_id`);
--   3. senao (sem fila ou ninguem online na fila), os administradores/supervisores
--      ONLINE (`user_roles` + `agent_presence`).
--
-- Uma notificacao por destinatario, com id deterministico por
-- (conexao, evento, usuario) — hoje o md5 nao inclui o usuario e dois
-- destinatarios colidiriam no ON CONFLICT. `ON CONFLICT (id) DO NOTHING` mantido:
-- reentrega do mesmo evento nao duplica. O fan-out tem teto de 25 destinatarios
-- por chamada (lista ordenada por user_id, corte estavel).
--
-- Nada mais muda: validacoes, a linha em `calls` (inclusive o `agent_id`
-- historico), o ON CONFLICT do evento, `talk_seconds`, os textos e o metadata
-- sao os mesmos. Quando ninguem esta online nao ha erro e nenhuma notificacao
-- (mesmo resultado de hoje para esse caso).
--
-- Sem DDL de tabela, sem DML, sem GRANT novo: o ACL vigente (EXECUTE so para
-- service_role, de 20261004172554) e reafirmado no fim, sem afrouxar nada.

create or replace function public.record_incoming_call_event(
  p_contact_id uuid,
  p_whatsapp_connection_id uuid,
  p_status text,
  p_is_video boolean,
  p_provider_event_id text default null,
  p_should_notify boolean default false,
  p_direction text default null
)
returns table (call_id uuid, notification_id uuid, notification_created boolean, duplicate boolean)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_agent_id uuid;
  v_agent_user_id uuid;
  v_agent_online boolean;
  v_queue_id uuid;
  v_target_user_ids uuid[];
  v_target_user_id uuid;
  v_max_destinatarios constant integer := 25;
  v_contact_name text;
  v_contact_phone text;
  v_contact_connection_id uuid;
  v_event_id text := nullif(btrim(p_provider_event_id), '');
  v_call_id uuid;
  v_persisted_status text;
  v_notification_id uuid;
  v_notification_candidate uuid;
  v_notification_created boolean := false;
  v_inserted boolean := false;
  v_call_duplicate boolean := false;
  v_row_count integer := 0;
  v_existing_notification record;
BEGIN
  IF p_status NOT IN ('ringing', 'answered', 'ended', 'missed', 'busy', 'failed') THEN
    RAISE EXCEPTION 'invalid incoming call status' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NOT NULL AND char_length(v_event_id) > 200 THEN
    RAISE EXCEPTION 'provider event id exceeds 200 characters' USING ERRCODE = '22023';
  END IF;
  IF p_should_notify AND p_status <> 'ringing' THEN
    RAISE EXCEPTION 'only ringing calls can create notifications' USING ERRCODE = '22023';
  END IF;

  SELECT c.assigned_to, c.name, c.phone, c.whatsapp_connection_id, c.queue_id
    INTO v_agent_id, v_contact_name, v_contact_phone, v_contact_connection_id, v_queue_id
  FROM public.contacts AS c
  WHERE c.id = p_contact_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'incoming call contact not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_contact_connection_id IS DISTINCT FROM p_whatsapp_connection_id THEN
    RAISE EXCEPTION 'incoming call connection does not match contact' USING ERRCODE = '23514';
  END IF;

  IF v_agent_id IS NOT NULL THEN
    SELECT p.user_id INTO v_agent_user_id
    FROM public.profiles AS p
    WHERE p.id = v_agent_id;
  END IF;

  IF v_event_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.calls AS existing
      WHERE existing.whatsapp_connection_id = p_whatsapp_connection_id
        AND existing.provider_event_id = v_event_id
    ) INTO v_call_duplicate;

    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes, provider_event_id,
      channel, provider_call_id, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      v_event_id,
      'whatsapp', v_event_id, v_contact_phone, v_contact_name
    )
    ON CONFLICT (whatsapp_connection_id, provider_event_id)
      WHERE provider_event_id IS NOT NULL
    DO UPDATE SET
      contact_id = EXCLUDED.contact_id,
      -- preserva a atribuição histórica: o primeiro agente visto fica
      agent_id = COALESCE(public.calls.agent_id, EXCLUDED.agent_id),
      status = CASE
        WHEN public.calls.status IN ('ended', 'missed', 'busy', 'failed')
          THEN public.calls.status
        WHEN public.calls.status = 'answered' AND EXCLUDED.status = 'ringing'
          THEN public.calls.status
        ELSE EXCLUDED.status
      END,
      answered_at = COALESCE(public.calls.answered_at, EXCLUDED.answered_at),
      ended_at = COALESCE(public.calls.ended_at, EXCLUDED.ended_at),
      -- `notes` é metadado do provedor: o primeiro valor vence, nunca é reescrito
      notes = COALESCE(public.calls.notes, EXCLUDED.notes),
      channel = COALESCE(public.calls.channel, EXCLUDED.channel),
      provider_call_id = COALESCE(public.calls.provider_call_id, EXCLUDED.provider_call_id),
      peer_number = COALESCE(public.calls.peer_number, EXCLUDED.peer_number),
      peer_name = COALESCE(public.calls.peer_name, EXCLUDED.peer_name),
      talk_seconds = COALESCE(
        public.calls.talk_seconds,
        CASE
          WHEN COALESCE(public.calls.ended_at, EXCLUDED.ended_at) IS NOT NULL
           AND COALESCE(public.calls.answered_at, EXCLUDED.answered_at) IS NOT NULL
          THEN GREATEST(0, EXTRACT(EPOCH FROM (
                 COALESCE(public.calls.ended_at, EXCLUDED.ended_at)
                 - COALESCE(public.calls.answered_at, EXCLUDED.answered_at)
               ))::int)
          ELSE NULL
        END
      )
    RETURNING id, status INTO v_call_id, v_persisted_status;
  ELSE
    INSERT INTO public.calls (
      contact_id, whatsapp_connection_id, agent_id, direction, status,
      started_at, answered_at, ended_at, notes,
      channel, peer_number, peer_name
    ) VALUES (
      p_contact_id, p_whatsapp_connection_id, v_agent_id, coalesce(p_direction, 'inbound'), p_status,
      now(),
      CASE WHEN p_status = 'answered' THEN now() ELSE NULL END,
      CASE WHEN p_status IN ('ended', 'missed', 'busy', 'failed') THEN now() ELSE NULL END,
      CASE WHEN p_is_video THEN 'Chamada de vídeo' ELSE 'Chamada de voz' END,
      'whatsapp', v_contact_phone, v_contact_name
    ) RETURNING id, status INTO v_call_id, v_persisted_status;
  END IF;

  IF p_should_notify AND v_persisted_status = 'ringing' THEN
    -- 1) responsavel explicito ONLINE tem prioridade (comportamento de hoje)
    IF v_agent_user_id IS NOT NULL THEN
      SELECT (ap.status = 'online') INTO v_agent_online
      FROM public.agent_presence AS ap
      WHERE ap.user_id = v_agent_user_id;
      IF v_agent_online IS TRUE THEN
        v_target_user_ids := ARRAY[v_agent_user_id];
      END IF;
    END IF;

    -- 2) sem responsavel (ou offline): membros ativos e ONLINE da fila do contato
    IF v_target_user_ids IS NULL AND v_queue_id IS NOT NULL THEN
      SELECT array_agg(DISTINCT p.user_id ORDER BY p.user_id) INTO v_target_user_ids
      FROM public.queue_members AS qm
      JOIN public.profiles AS p ON p.id = qm.profile_id
      JOIN public.agent_presence AS ap ON ap.user_id = p.user_id AND ap.status = 'online'
      WHERE qm.queue_id = v_queue_id
        AND qm.is_active;
    END IF;

    -- 3) sem fila ou ninguem online na fila: supervisores/admins ONLINE
    IF v_target_user_ids IS NULL THEN
      SELECT array_agg(DISTINCT ur.user_id ORDER BY ur.user_id) INTO v_target_user_ids
      FROM public.user_roles AS ur
      JOIN public.agent_presence AS ap ON ap.user_id = ur.user_id AND ap.status = 'online'
      WHERE ur.role IN ('admin', 'supervisor');
    END IF;

    IF v_target_user_ids IS NOT NULL THEN
      -- Teto determinístico por chamada: a lista vem ordenada por user_id (a montagem
      -- acima usa ORDER BY user_id), então o corte é estável. Evita fan-out sem limite
      -- dentro de uma transação só (recusa real de 06/10).
      IF array_length(v_target_user_ids, 1) > v_max_destinatarios THEN
        v_target_user_ids := v_target_user_ids[1:v_max_destinatarios];
      END IF;

      FOREACH v_target_user_id IN ARRAY v_target_user_ids LOOP
        v_notification_candidate := CASE
          WHEN v_event_id IS NULL THEN gen_random_uuid()
          ELSE md5(
            'zapp:incoming-call:v1:' || p_whatsapp_connection_id::text || ':'
            || v_event_id || ':' || v_target_user_id::text
          )::uuid
        END;

        INSERT INTO public.notifications (id, user_id, type, title, message, metadata)
        VALUES (
          v_notification_candidate,
          v_target_user_id,
          'incoming_call',
          CASE WHEN p_is_video THEN '📹 Chamada de vídeo recebida' ELSE '📞 Chamada de voz recebida' END,
          COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato') || ' está ligando para você',
          jsonb_strip_nulls(jsonb_build_object(
            'contact_id', p_contact_id,
            'contact_name', COALESCE(NULLIF(v_contact_name, ''), v_contact_phone, 'Contato'),
            'phone', v_contact_phone,
            'is_video', p_is_video,
            'call_status', v_persisted_status,
            'whatsapp_connection_id', p_whatsapp_connection_id,
            'call_id', v_call_id,
            'event_id', v_event_id
          ))
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id INTO v_notification_id;

        GET DIAGNOSTICS v_row_count = ROW_COUNT;
        v_inserted := v_row_count = 1;
        -- ON CONFLICT DO NOTHING nao devolve linha: o id do candidato e o esperado
        v_notification_id := v_notification_candidate;

        IF v_inserted THEN
          v_notification_created := true;
        ELSE
          SELECT n.user_id, n.type, n.metadata INTO v_existing_notification
          FROM public.notifications AS n
          WHERE n.id = v_notification_candidate;
          IF NOT FOUND
            OR v_existing_notification.user_id IS DISTINCT FROM v_target_user_id
            OR v_existing_notification.type IS DISTINCT FROM 'incoming_call'
            OR v_existing_notification.metadata->>'event_id' IS DISTINCT FROM v_event_id THEN
            RAISE EXCEPTION 'incoming call notification identity conflict' USING ERRCODE = '23505';
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN QUERY SELECT
    v_call_id,
    v_notification_id,
    v_notification_created,
    v_call_duplicate OR (
      p_should_notify AND v_target_user_ids IS NOT NULL
      AND v_event_id IS NOT NULL AND NOT v_notification_created
    );
END;
$function$;

revoke all on function public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.record_incoming_call_event(uuid, uuid, text, boolean, text, boolean, text)
  to service_role;
