-- reassign_dry_run_capacity_counter
-- Rollback: devolve as duas RPCs a definicao de 20261013235905 (sem contador de simulacao; mesmas assinaturas).
-- Rollback (SQL executavel, na ordem):
|--   create or replace function public.reassign_overloaded_agents(p_dry_run boolean default false) returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$ declare v_overloaded record; v_contact record; v_new_agent uuid; v_reassigned integer := 0; begin if (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' and not public.is_admin_or_supervisor(auth.uid()) then raise exception 'reassign_overloaded_agents: requer perfil admin ou supervisor'; end if; for v_overloaded in select p.id as agent_id, p.max_chats, count(c.id) as open_chats from profiles p join contacts c on c.assigned_to = p.id and c.conversation_status = 'open' and c.deleted_at is null where p.is_active = true and p.max_chats is not null and p.max_chats > 0 group by p.id, p.max_chats having count(c.id) > p.max_chats order by p.id loop for v_contact in select c.id, c.queue_id from contacts c where c.assigned_to = v_overloaded.agent_id and c.conversation_status = 'open' and c.deleted_at is null order by coalesce(c.conversation_status_changed_at, c.created_at) asc, c.id asc limit (v_overloaded.open_chats - v_overloaded.max_chats) loop select qm.profile_id into v_new_agent from queue_members qm join profiles p on p.id = qm.profile_id where (v_contact.queue_id is null or qm.queue_id = v_contact.queue_id) and qm.is_active = true and p.is_active = true and p.id <> v_overloaded.agent_id and (p.max_chats is null or (select count(*) from contacts cc where cc.assigned_to = p.id and cc.conversation_status = 'open' and cc.deleted_at is null) < p.max_chats) order by (select count(*) from contacts cc where cc.assigned_to = qm.profile_id and cc.conversation_status = 'open' and cc.deleted_at is null) asc, qm.profile_id asc limit 1; if v_new_agent is not null then if not p_dry_run then update public.contacts set assigned_to = v_new_agent where id = v_contact.id; insert into public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata) values (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent, jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats)); end if; v_reassigned := v_reassigned + 1; end if; end loop; end loop; return v_reassigned; end; $function$;
|--   create or replace function public.reassign_absent_agents(inactive_minutes integer default 30, p_dry_run boolean default false) returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$ declare v_absent record; v_contact record; v_new_agent uuid; v_reassigned integer := 0; begin if (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' and not public.is_admin_or_supervisor(auth.uid()) then raise exception 'reassign_absent_agents: requer perfil admin ou supervisor'; end if; if inactive_minutes is null or inactive_minutes < 0 then raise exception 'reassign_absent_agents: inactive_minutes invalido: %', inactive_minutes using errcode = '22023'; end if; for v_absent in select p.id as agent_id from profiles p where p.is_active = true and exists (select 1 from contacts c where c.assigned_to = p.id and c.conversation_status = 'open' and c.deleted_at is null) and not exists (select 1 from user_sessions us where us.user_id = p.user_id and us.is_active = true and us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) order by p.id loop for v_contact in select c.id, c.queue_id from contacts c where c.assigned_to = v_absent.agent_id and c.conversation_status = 'open' and c.deleted_at is null order by coalesce(c.conversation_status_changed_at, c.created_at) asc, c.id asc loop select qm.profile_id into v_new_agent from queue_members qm join profiles p on p.id = qm.profile_id where (v_contact.queue_id is null or qm.queue_id = v_contact.queue_id) and qm.is_active = true and p.is_active = true and p.id <> v_absent.agent_id and exists (select 1 from user_sessions us where us.user_id = p.user_id and us.is_active = true and us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval) and (p.max_chats is null or (select count(*) from contacts cc where cc.assigned_to = p.id and cc.conversation_status = 'open' and cc.deleted_at is null) < p.max_chats) order by (select count(*) from contacts cc where cc.assigned_to = qm.profile_id and cc.conversation_status = 'open' and cc.deleted_at is null) asc, qm.profile_id asc limit 1; if v_new_agent is not null then if not p_dry_run then update public.contacts set assigned_to = v_new_agent where id = v_contact.id; insert into public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata) values (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent, jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes)); end if; v_reassigned := v_reassigned + 1; end if; end loop; end loop; return v_reassigned; end; $function$;
|--   revoke all on function public.reassign_overloaded_agents(boolean) from public, anon; revoke all on function public.reassign_absent_agents(integer, boolean) from public, anon; grant execute on function public.reassign_overloaded_agents(boolean) to authenticated, service_role; grant execute on function public.reassign_absent_agents(integer, boolean) to authenticated, service_role;

-- ============================================================================
-- reassign_overloaded_agents / reassign_absent_agents — dry-run com vagas
--
-- Defeito: no ensaio (p_dry_run = true) nada e movido de verdade, entao o
-- proximo contato da mesma rodada enxergava a MESMA vaga livre no substituto
-- e o ensaio contava alem da capacidade real (ex.: 2 excedentes e 1 vaga
-- viravam "2"). Na execucao real a vaga fecha a cada UPDATE, entao ensaio e
-- real discordavam.
-- Correcao: cada RPC mantem um contador em memoria (jsonb v_sim, por
-- substituto) com as vagas que o ensaio ja consumiu. A carga simulada entra
-- no filtro de capacidade livre E na ordenacao do candidato, entao o ensaio
-- escolhe como a execucao real escolheria. No modo real (p_dry_run = false)
-- nada muda: a vaga fecha no UPDATE e o contador nem e incrementado.
-- Assinaturas e ACL inalteradas (CREATE OR REPLACE, sem DROP).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reassign_overloaded_agents(
  p_dry_run boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_overloaded RECORD;
  v_contact    RECORD;
  v_new_agent  UUID;
  v_reassigned INTEGER := 0;
  -- Vagas consumidas pelo ensaio, por substituto (so usada no dry-run).
  v_sim        jsonb := '{}'::jsonb;
BEGIN
  -- Mesma guarda de papel das versoes anteriores.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_overloaded_agents: requer perfil admin ou supervisor';
  END IF;

  FOR v_overloaded IN
    SELECT p.id AS agent_id, p.max_chats, COUNT(c.id) AS open_chats
    FROM profiles p
    JOIN contacts c ON c.assigned_to = p.id
      AND c.conversation_status = 'open'
      AND c.deleted_at IS NULL
    WHERE p.is_active = true
      AND p.max_chats IS NOT NULL
      AND p.max_chats > 0
    GROUP BY p.id, p.max_chats
    HAVING COUNT(c.id) > p.max_chats
    ORDER BY p.id
  LOOP
    -- Move so o EXCEDENTE de conversas ABERTAS, da que espera ha mais tempo
    -- para a mais recente (nunca updated_at).
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_overloaded.agent_id
        AND c.conversation_status = 'open'
        AND c.deleted_at IS NULL
      ORDER BY COALESCE(c.conversation_status_changed_at, c.created_at) ASC, c.id ASC
      LIMIT (v_overloaded.open_chats - v_overloaded.max_chats)
    LOOP
      -- Substituto: colega ativo com capacidade livre (abertas + simuladas < max_chats).
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id <> v_overloaded.agent_id
        AND (
          p.max_chats IS NULL
          OR ((SELECT COUNT(*) FROM contacts cc
              WHERE cc.assigned_to = p.id
                AND cc.conversation_status = 'open'
                AND cc.deleted_at IS NULL)
              + COALESCE((v_sim ->> p.id::text)::int, 0)) < p.max_chats
        )
      ORDER BY ((SELECT COUNT(*) FROM contacts cc
                WHERE cc.assigned_to = qm.profile_id
                  AND cc.conversation_status = 'open'
                  AND cc.deleted_at IS NULL)
              + COALESCE((v_sim ->> qm.profile_id::text)::int, 0)) ASC,
               qm.profile_id ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        IF p_dry_run THEN
          -- Ensaio: reserva a vaga em memoria em vez de mover.
          v_sim := jsonb_set(
            v_sim,
            ARRAY[v_new_agent::text],
            to_jsonb(COALESCE((v_sim ->> v_new_agent::text)::int, 0) + 1)
          );
        ELSE
          UPDATE public.contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
          INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
          VALUES (v_contact.id, 'overload_reassign', v_overloaded.agent_id, v_new_agent,
                  jsonb_build_object('reason', 'max_chats_exceeded', 'max_chats', v_overloaded.max_chats));
        END IF;
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reassign_absent_agents(
  inactive_minutes integer DEFAULT 30,
  p_dry_run boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_absent     RECORD;
  v_contact    RECORD;
  v_new_agent  UUID;
  v_reassigned INTEGER := 0;
  -- Vagas consumidas pelo ensaio, por substituto (so usada no dry-run).
  v_sim        jsonb := '{}'::jsonb;
BEGIN
  -- Mesma guarda de papel das versoes anteriores.
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'reassign_absent_agents: requer perfil admin ou supervisor';
  END IF;

  -- Entrada invalida fecha: minuto negativo vira intervalo invertido e marca
  -- todo mundo como ausente (movimento em massa). Sem isso, -1 movia a base.
  IF inactive_minutes IS NULL OR inactive_minutes < 0 THEN
    RAISE EXCEPTION 'reassign_absent_agents: inactive_minutes invalido: %', inactive_minutes
      USING ERRCODE = '22023';
  END IF;

  FOR v_absent IN
    SELECT p.id AS agent_id
    FROM profiles p
    WHERE p.is_active = true
      AND EXISTS (SELECT 1 FROM contacts c
                  WHERE c.assigned_to = p.id
                    AND c.conversation_status = 'open'
                    AND c.deleted_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM user_sessions us
        WHERE us.user_id = p.user_id
          AND us.is_active = true
          AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
      )
    ORDER BY p.id
  LOOP
    -- So as conversas ABERTAS do ausente, da que espera ha mais tempo.
    FOR v_contact IN
      SELECT c.id, c.queue_id
      FROM contacts c
      WHERE c.assigned_to = v_absent.agent_id
        AND c.conversation_status = 'open'
        AND c.deleted_at IS NULL
      ORDER BY COALESCE(c.conversation_status_changed_at, c.created_at) ASC, c.id ASC
    LOOP
      -- Substituto: colega ativo com sessao recente E capacidade livre
      -- (abertas + simuladas < max_chats).
      SELECT qm.profile_id INTO v_new_agent
      FROM queue_members qm
      JOIN profiles p ON p.id = qm.profile_id
      WHERE (v_contact.queue_id IS NULL OR qm.queue_id = v_contact.queue_id)
        AND qm.is_active = true
        AND p.is_active = true
        AND p.id <> v_absent.agent_id
        AND EXISTS (
          SELECT 1 FROM user_sessions us
          WHERE us.user_id = p.user_id
            AND us.is_active = true
            AND us.last_activity_at > now() - (inactive_minutes || ' minutes')::interval
        )
        AND (
          p.max_chats IS NULL
          OR ((SELECT COUNT(*) FROM contacts cc
              WHERE cc.assigned_to = p.id
                AND cc.conversation_status = 'open'
                AND cc.deleted_at IS NULL)
              + COALESCE((v_sim ->> p.id::text)::int, 0)) < p.max_chats
        )
      ORDER BY ((SELECT COUNT(*) FROM contacts cc
                WHERE cc.assigned_to = qm.profile_id
                  AND cc.conversation_status = 'open'
                  AND cc.deleted_at IS NULL)
              + COALESCE((v_sim ->> qm.profile_id::text)::int, 0)) ASC,
               qm.profile_id ASC
      LIMIT 1;

      IF v_new_agent IS NOT NULL THEN
        IF p_dry_run THEN
          -- Ensaio: reserva a vaga em memoria em vez de mover.
          v_sim := jsonb_set(
            v_sim,
            ARRAY[v_new_agent::text],
            to_jsonb(COALESCE((v_sim ->> v_new_agent::text)::int, 0) + 1)
          );
        ELSE
          UPDATE public.contacts SET assigned_to = v_new_agent WHERE id = v_contact.id;
          INSERT INTO public.conversation_events (contact_id, event_type, from_agent_id, to_agent_id, metadata)
          VALUES (v_contact.id, 'absence_reassign', v_absent.agent_id, v_new_agent,
                  jsonb_build_object('reason', 'agent_inactive', 'inactive_minutes', inactive_minutes));
        END IF;
        v_reassigned := v_reassigned + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_reassigned;
END;
$function$;

-- Sem DROP: as assinaturas nao mudaram, a ACL anterior continua valendo.
-- Reafirma negar-por-padrao e os papeis reais (idempotente).
REVOKE ALL ON FUNCTION public.reassign_overloaded_agents(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reassign_absent_agents(integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reassign_overloaded_agents(boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reassign_absent_agents(integer, boolean) TO authenticated, service_role;
