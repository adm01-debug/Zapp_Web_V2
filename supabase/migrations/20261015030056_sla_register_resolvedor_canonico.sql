-- sla_register_resolvedor_canonico
-- Rollback: restaura register_first_response_internal ao corpo da migration
-- 20261013012747 (que resolve o prazo via RPC nova), com o REVOKE original.
-- O resolvedor canonico copiado abaixo e MANTIDO de proposito no rollback:
-- ele e identico ao do cartao granular (R2-SLA-003); dropa-lo quebraria aquele
-- cartao quando presente na arvore. Nao ha GRANT novo neste arquivo.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.register_first_response_internal(p_contact_id uuid, p_responded_at timestamptz, p_before_created_at timestamptz default null) returns void language plpgsql security definer set search_path = public as $$ declare v_first_message_at timestamptz; v_first_response_minutes integer := 5; begin perform pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42)); begin select r.first_response_minutes into v_first_response_minutes from public.resolve_applicable_sla(p_contact_id) r; exception when insufficient_privilege then v_first_response_minutes := 5; end; select min(m.created_at) into v_first_message_at from public.messages m where m.contact_id = p_contact_id and m.sender = 'contact' and m.created_at <= p_responded_at and m.created_at > coalesce((select max(r.created_at) from public.messages r where r.contact_id = p_contact_id and r.sender = 'agent' and r.status in ('sent','delivered','read') and r.created_at < coalesce(p_before_created_at, p_responded_at)), timestamptz '-infinity'); if v_first_message_at is null then return; end if; insert into public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached) values (p_contact_id, v_first_message_at, p_responded_at, p_responded_at > v_first_message_at + make_interval(mins => v_first_response_minutes)) on conflict (contact_id) where first_response_at is null do update set first_response_at = excluded.first_response_at, first_response_breached = excluded.first_response_breached; end; $$;
--   revoke all on function public.register_first_response_internal(uuid, timestamptz, timestamptz) from public, anon, authenticated;
--
-- [refazer 1] PB-39: a 20261013012747 trocou o resolvedor do register para a
-- RPC nova, e isso quebrou no empilhamento o contrato granular R2-SLA-003
-- (espelho: "fallback intermediario: sla_configurations is_default aplica
-- antes do padrao de 5 min" — a fixture daquele contrato aplica so o
-- resolvedor granular + o register, entao a RPC nova nao existe la e o
-- register estourava com undefined_function).
-- Correcao minima: o register volta a chamar o resolvedor canonico
-- resolve_applicable_first_response_minutes (fonte unica dos minutos, que ja
-- entrega o prazo configurado — nada de 5 min fixo). A RPC nova continua
-- existindo como API de leitura (minutos + nivel + regra) para cliente/job.
--
-- O corpo do resolvedor abaixo e VERBATIM da migration 20261005151753 do
-- cartao granular: este cartao o re-declara porque o register depende dele e
-- aquele cartao ainda nao integrou. Nao mudar a semantica aqui; ajustes vao
-- no cartao dono. HOTSPOT: deduplicar quando o granular integrar.

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

-- register volta ao resolvedor canonico (mesmo corpo do cartao granular),
-- com uma guarda de compatibilidade entre cartoes: a fixture do contrato
-- granular aplica SO o resolvedor canonico + o register, enquanto a do
-- contrato de delivery aplica SO a RPC nova + o register + o gatilho. O
-- register usa o canonico quando ele existe e cai para a RPC deste cartao
-- quando o cartao granular ainda nao esta na arvore (sem try/except: checa
-- a existencia por nome, sem custo de subtransacao no caminho principal).
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
  v_first_response_minutes integer := 5;
BEGIN
  -- serializa por contato (fecha corrida de UPDATE concorrente)
  PERFORM pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42));

  -- fonte unica dos minutos: o resolvedor canonico granular quando presente;
  -- a RPC deste cartao quando o granular ainda nao integrou. Nos dois casos
  -- o prazo e o configurado — nunca o 5 min fixo.
  IF to_regprocedure('public.resolve_applicable_first_response_minutes(uuid)') IS NOT NULL THEN
    v_first_response_minutes := public.resolve_applicable_first_response_minutes(p_contact_id);
  ELSE
    -- cartao granular ausente: a RPC deste cartao resolve; contato invisivel
    -- degrada para o padrao (o gatilho NUNCA pode bloquear a gravacao).
    BEGIN
      SELECT r.first_response_minutes
        INTO v_first_response_minutes
        FROM public.resolve_applicable_sla(p_contact_id) r;
    EXCEPTION WHEN insufficient_privilege THEN
      v_first_response_minutes := 5;
    END;
  END IF;

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
    p_responded_at > v_first_message_at + make_interval(mins => v_first_response_minutes)
  )
  ON CONFLICT (contact_id) WHERE first_response_at IS NULL
  DO UPDATE SET first_response_at = EXCLUDED.first_response_at,
                first_response_breached = EXCLUDED.first_response_breached;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_applicable_first_response_minutes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_first_response_internal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
