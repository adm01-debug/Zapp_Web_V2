-- sla_first_response_granular
-- Rollback: devolve register_first_response_internal ao corpo anterior (prazo fixo de 5 min) e dropa o resolvedor granular novo.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.register_first_response_internal(p_contact_id uuid, p_responded_at timestamptz, p_before_created_at timestamptz default null) returns void language plpgsql security definer set search_path = public as $$ declare v_first_message_at timestamptz; begin perform pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42)); select min(m.created_at) into v_first_message_at from public.messages m where m.contact_id = p_contact_id and m.sender = 'contact' and m.created_at <= p_responded_at and m.created_at > coalesce((select max(r.created_at) from public.messages r where r.contact_id = p_contact_id and r.sender = 'agent' and r.status in ('sent','delivered','read') and r.created_at < coalesce(p_before_created_at, p_responded_at)), timestamptz '-infinity'); if v_first_message_at is null then return; end if; insert into public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached) values (p_contact_id, v_first_message_at, p_responded_at, p_responded_at > v_first_message_at + interval '5 minutes') on conflict (contact_id) where first_response_at is null do update set first_response_at = excluded.first_response_at, first_response_breached = excluded.first_response_breached; end; $$;
--   revoke all on function public.register_first_response_internal(uuid, timestamptz, timestamptz) from public, anon, authenticated;
--   drop function if exists public.resolve_applicable_first_response_minutes(uuid);
--
-- R2-SLA-003: register_first_response_internal comparava a resposta com um
-- intervalo fixo de 5 minutos; uma regra ativa de 2 min continuava persistida
-- como dentro do prazo. Agora o banco resolve o MESMO prazo granular da UI
-- (resolveHierarchy em src/hooks/sla/useApplicableSLA.ts), por contato:
--   1) sla_rules ativas por priority DESC, created_at, id — primeiro casamento
--      de cada nivel; vale o primeiro nao-nulo em
--      contact > company > job_title > contact_type > queue > agent;
--   2) sla_configurations is_active + is_default (limit 1);
--   3) padrao do sistema: 5 minutos.
-- Semantica nula = mesma da UI: regra/param nulo nunca casa (= com NULL ja
-- devolve desconhecido).

CREATE OR REPLACE FUNCTION public.resolve_applicable_first_response_minutes(p_contact_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company text;
  v_job_title text;
  v_contact_type text;
  v_queue_id uuid;
  v_assigned_to uuid;
  v_company_minutes integer;
  v_job_title_minutes integer;
  v_contact_type_minutes integer;
  v_queue_minutes integer;
  v_agent_minutes integer;
  v_minutes integer;
  r record;
BEGIN
  SELECT c.company, c.job_title, c.contact_type, c.queue_id, c.assigned_to
  INTO v_company, v_job_title, v_contact_type, v_queue_id, v_assigned_to
  FROM public.contacts c
  WHERE c.id = p_contact_id;

  -- single-pass: primeiro casamento de CADA nivel, na ordem das regras
  FOR r IN
    SELECT rule.first_response_minutes, rule.contact_id, rule.company,
           rule.job_title, rule.contact_type, rule.queue_id, rule.agent_id
    FROM public.sla_rules rule
    WHERE rule.is_active = true
    ORDER BY rule.priority DESC, rule.created_at, rule.id
  LOOP
    -- nivel contact tem a maior precedencia: primeiro casamento encerra (break da UI)
    IF r.contact_id IS NOT NULL AND r.contact_id = p_contact_id THEN
      RETURN r.first_response_minutes;
    END IF;
    IF v_company_minutes IS NULL AND r.contact_id IS NULL
       AND r.company IS NOT NULL AND r.company = v_company THEN
      v_company_minutes := r.first_response_minutes;
    END IF;
    IF v_job_title_minutes IS NULL AND r.contact_id IS NULL AND r.company IS NULL
       AND r.job_title IS NOT NULL AND r.job_title = v_job_title THEN
      v_job_title_minutes := r.first_response_minutes;
    END IF;
    IF v_contact_type_minutes IS NULL AND r.contact_id IS NULL AND r.company IS NULL
       AND r.job_title IS NULL AND r.contact_type IS NOT NULL
       AND r.contact_type = v_contact_type THEN
      v_contact_type_minutes := r.first_response_minutes;
    END IF;
    IF v_queue_minutes IS NULL AND r.contact_id IS NULL
       AND r.queue_id IS NOT NULL AND r.queue_id = v_queue_id THEN
      v_queue_minutes := r.first_response_minutes;
    END IF;
    IF v_agent_minutes IS NULL AND r.contact_id IS NULL
       AND r.agent_id IS NOT NULL AND r.agent_id = v_assigned_to THEN
      v_agent_minutes := r.first_response_minutes;
    END IF;
  END LOOP;

  v_minutes := coalesce(v_company_minutes, v_job_title_minutes, v_contact_type_minutes,
                        v_queue_minutes, v_agent_minutes);
  IF v_minutes IS NOT NULL THEN
    RETURN v_minutes;
  END IF;

  -- fallback global: configuracao default ativa (a UI usa .limit(1))
  SELECT sc.first_response_minutes
  INTO v_minutes
  FROM public.sla_configurations sc
  WHERE sc.is_active = true AND sc.is_default = true
  LIMIT 1;

  RETURN coalesce(v_minutes, 5);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_first_response_internal(
  p_contact_id uuid,
  p_responded_at timestamptz,
  p_before_created_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_message_at timestamptz;
BEGIN
  -- serializa por contato (fecha corrida de UPDATE concorrente)
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42));

  -- base: primeira mensagem do cliente ainda sem resposta EFETIVA do atendente
  -- (mensagens sending/failed nao contam como resposta anterior)
  SELECT min(m.created_at)
  INTO v_first_message_at
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND m.sender = 'contact'
    AND m.created_at <= p_responded_at
    AND m.created_at > coalesce(
      (SELECT max(r.created_at)
       FROM public.messages r
       WHERE r.contact_id = p_contact_id
         AND r.sender = 'agent'
         AND r.status IN ('sent','delivered','read')
         AND r.created_at < coalesce(p_before_created_at, p_responded_at)),
      timestamptz '-infinity'
    );

  IF v_first_message_at IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
  VALUES (
    p_contact_id,
    v_first_message_at,
    p_responded_at,
    p_responded_at > v_first_message_at
      + make_interval(mins => public.resolve_applicable_first_response_minutes(p_contact_id))
  )
  ON CONFLICT (contact_id) WHERE first_response_at IS NULL
  DO UPDATE SET first_response_at = EXCLUDED.first_response_at,
                first_response_breached = EXCLUDED.first_response_breached;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_applicable_first_response_minutes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_first_response_internal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
