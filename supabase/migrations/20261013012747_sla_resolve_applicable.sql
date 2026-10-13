-- sla_resolve_applicable
-- Rollback: dropa a funcao nova resolve_applicable_sla e restaura register_first_response_internal e mark_first_response com os corpos anteriores ao resolvedor (abaixo), com os REVOKE/GRANT originais.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.mark_first_response(p_contact_id uuid) returns void language plpgsql security definer set search_path = public as $$ declare v_first_message_at timestamptz; v_now timestamptz := now(); v_row_id uuid; begin if not exists (select 1 from public.contacts c where c.id = p_contact_id and (public.is_admin_or_supervisor(auth.uid()) or c.assigned_to in (select public.get_visible_agent_ids(auth.uid())) or exists (select 1 from public.queue_members qm where qm.queue_id = c.queue_id and qm.profile_id = public.get_profile_id_for_user(auth.uid()) and qm.is_active = true))) then raise exception 'nao autorizado para o contato %', p_contact_id using errcode = '42501'; end if; select id into v_row_id from public.conversation_sla where contact_id = p_contact_id and first_response_at is null order by created_at desc limit 1; if v_row_id is not null then update public.conversation_sla set first_response_at = v_now, first_response_breached = v_now > first_message_at + interval '5 minutes' where id = v_row_id; return; end if; select min(m.created_at) into v_first_message_at from public.messages m where m.contact_id = p_contact_id and m.sender = 'contact'; if v_first_message_at is null then return; end if; if exists (select 1 from public.conversation_sla where contact_id = p_contact_id and first_response_at is not null) then return; end if; insert into public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached) values (p_contact_id, v_first_message_at, v_now, v_now > v_first_message_at + interval '5 minutes'); end; $$;
--   revoke all on function public.mark_first_response(uuid) from public, anon;
--   grant execute on function public.mark_first_response(uuid) to authenticated;
--   create or replace function public.register_first_response_internal(p_contact_id uuid, p_responded_at timestamptz, p_before_created_at timestamptz default null) returns void language plpgsql security definer set search_path = public as $$ declare v_first_message_at timestamptz; begin perform pg_advisory_xact_lock(hashtextextended(p_contact_id::text, 42)); select min(m.created_at) into v_first_message_at from public.messages m where m.contact_id = p_contact_id and m.sender = 'contact' and m.created_at <= p_responded_at and m.created_at > coalesce((select max(r.created_at) from public.messages r where r.contact_id = p_contact_id and r.sender = 'agent' and r.status in ('sent','delivered','read') and r.created_at < coalesce(p_before_created_at, p_responded_at)), timestamptz '-infinity'); if v_first_message_at is null then return; end if; insert into public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached) values (p_contact_id, v_first_message_at, p_responded_at, p_responded_at > v_first_message_at + interval '5 minutes') on conflict (contact_id) where first_response_at is null do update set first_response_at = excluded.first_response_at, first_response_breached = excluded.first_response_breached; end; $$;
--   revoke all on function public.register_first_response_internal(uuid, timestamptz, timestamptz) from public, anon, authenticated;
--   drop function if exists public.resolve_applicable_sla(uuid);
--
-- PB-39 (paridade V2/V3): o prazo de 1a resposta era `interval '5 minutes'`
-- gravado no codigo (register_first_response_internal e mark_first_response) e o
-- front resolvia a hierarquia de sla_rules so no cliente. Agora o BANCO resolve.
--
-- Hierarquia unica (espelha src/hooks/sla/useApplicableSLA.ts e o V3, ordem
-- contato > empresa > cargo > tipo > fila > agente) com o fallback global
-- (sla_configurations.is_default) e, sem nada configurado, o padrao do sistema
-- (5 min de 1a resposta). Empate dentro do nivel: priority DESC, created_at DESC.
--
-- A RPC resolve_applicable_sla e SECURITY DEFINER: quem pode ver o contato recebe
-- o prazo sem ler sla_rules (tabela sob RLS restrita) — nenhum GRANT novo em
-- sla_rules/sla_configurations. Nao mexe em RLS nem no contrato das tabelas.
-- Resolucao de SLA (resolution_minutes) fica FORA deste cartao (DEC-1 do plano).
--
-- Efeito colateral zero: a funcao e de leitura (STABLE), nao abre transacao nem
-- escreve nada; o resolvedor nao dispara gatilho nenhum.

CREATE OR REPLACE FUNCTION public.resolve_applicable_sla(p_contact_id uuid)
RETURNS TABLE (
  first_response_minutes integer,
  matched_level text,
  rule_id uuid,
  rule_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company      text;
  v_job_title    text;
  v_contact_type text;
  v_queue_id     uuid;
  v_agent_id     uuid;
BEGIN
  IF p_contact_id IS NULL THEN
    RAISE EXCEPTION 'resolve_applicable_sla: p_contact_id obrigatorio'
      USING ERRCODE = '22004';
  END IF;

  -- Visibilidade, como nas demais RPCs de contato (get_conversation_tab_counts,
  -- mark_first_response). service_role (auth.uid() nulo) resolve para qualquer
  -- contato, que e o caminho do job de varredura; anon nao tem EXECUTE (REVOKE
  -- abaixo). Contato visivel e inexistente respondem IGUAL (42501) -> sem oraculo.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_contact_visible_to_user(p_contact_id, auth.uid()) THEN
    RAISE EXCEPTION 'contato nao visivel para o usuario atual'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.company, c.job_title, c.contact_type, c.queue_id, c.assigned_to
    INTO v_company, v_job_title, v_contact_type, v_queue_id, v_agent_id
    FROM public.contacts c
   WHERE c.id = p_contact_id;

  IF FOUND THEN
    RETURN QUERY
    WITH candidatos AS (
      SELECT
        r.id, r.name, r.first_response_minutes, r.priority, r.created_at,
        CASE
          WHEN r.contact_id IS NOT NULL   THEN 'contact'
          WHEN r.company IS NOT NULL      THEN 'company'
          WHEN r.job_title IS NOT NULL    THEN 'job_title'
          WHEN r.contact_type IS NOT NULL THEN 'contact_type'
          WHEN r.queue_id IS NOT NULL     THEN 'queue'
          WHEN r.agent_id IS NOT NULL     THEN 'agent'
        END AS nivel,
        CASE
          WHEN r.contact_id IS NOT NULL   THEN r.contact_id = p_contact_id
          WHEN r.company IS NOT NULL      THEN r.company = v_company
          WHEN r.job_title IS NOT NULL    THEN r.job_title = v_job_title
          WHEN r.contact_type IS NOT NULL THEN r.contact_type = v_contact_type
          WHEN r.queue_id IS NOT NULL     THEN r.queue_id = v_queue_id
          WHEN r.agent_id IS NOT NULL     THEN r.agent_id = v_agent_id
        END AS casa
      FROM public.sla_rules r
      WHERE r.is_active IS TRUE
    )
    SELECT c.first_response_minutes, c.nivel, c.id, c.name
      FROM candidatos c
     WHERE c.casa IS TRUE
     ORDER BY
       array_position(ARRAY['contact','company','job_title','contact_type','queue','agent'], c.nivel),
       c.priority DESC,
       c.created_at DESC
     LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fallback global (sla_configurations), como no cliente
  RETURN QUERY
  SELECT cfg.first_response_minutes, 'global_default'::text, NULL::uuid, cfg.name
    FROM public.sla_configurations cfg
   WHERE cfg.is_active IS NOT FALSE
     AND cfg.is_default IS TRUE
   ORDER BY cfg.created_at
   LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  -- Padrao do sistema: mesmo valor que estava escrito no codigo
  RETURN QUERY
  SELECT 5, 'system_default'::text, NULL::uuid, 'Padrão do Sistema'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_applicable_sla(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_applicable_sla(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.resolve_applicable_sla(uuid) IS
  'PB-39: prazo de 1a resposta vigente para o contato (hierarquia sla_rules > sla_configurations.is_default > 5 min), com o nivel casado e a regra. SECURITY DEFINER: nao exige leitura de sla_rules pelo chamador.';

-- register_first_response_internal passa a usar o resolvedor. Degrada para o
-- padrao do sistema (5 min) se o chamador nao puder ver o contato: o gatilho de
-- mensagem NUNCA pode bloquear a gravacao da mensagem por causa do SLA.
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

  BEGIN
    SELECT r.first_response_minutes
      INTO v_first_response_minutes
      FROM public.resolve_applicable_sla(p_contact_id) r;
  EXCEPTION
    WHEN insufficient_privilege THEN
      v_first_response_minutes := 5;  -- contato fora do escopo: padrao do sistema
  END;

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

REVOKE ALL ON FUNCTION public.register_first_response_internal(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

-- mark_first_response (RPC do cliente, ja checa visibilidade no inicio) usa o
-- mesmo resolvedor no lugar do 5 min escrito.
CREATE OR REPLACE FUNCTION public.mark_first_response(p_contact_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_message_at timestamptz;
  v_now timestamptz := now();
  v_row_id uuid;
  v_first_response_minutes integer;
BEGIN
  -- autorizacao: mesmo predicado do contacts_select_policy (RLS nao se aplica
  -- dentro de SECURITY DEFINER, entao a checagem e explicita aqui)
  IF NOT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = p_contact_id
      AND (
        public.is_admin_or_supervisor(auth.uid())
        OR c.assigned_to IN (SELECT public.get_visible_agent_ids(auth.uid()))
        OR EXISTS (
          SELECT 1 FROM public.queue_members qm
          WHERE qm.queue_id = c.queue_id
            AND qm.profile_id = public.get_profile_id_for_user(auth.uid())
            AND qm.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'nao autorizado para o contato %', p_contact_id
      USING ERRCODE = '42501';
  END IF;

  -- prazo vigente da 1a resposta para este contato
  SELECT r.first_response_minutes
    INTO v_first_response_minutes
    FROM public.resolve_applicable_sla(p_contact_id) r;

  -- registro de SLA mais recente do contato ainda sem primeira resposta
  SELECT id
  INTO v_row_id
  FROM public.conversation_sla
  WHERE contact_id = p_contact_id
    AND first_response_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row_id IS NOT NULL THEN
    -- pega a base do cronometro do proprio registro
    UPDATE public.conversation_sla
    SET first_response_at = v_now,
        first_response_breached = v_now > first_message_at + make_interval(mins => v_first_response_minutes)
    WHERE id = v_row_id;
    RETURN;
  END IF;

  -- sem registro: cria um novo (base = 1a mensagem do cliente)
  SELECT min(m.created_at)
  INTO v_first_message_at
  FROM public.messages m
  WHERE m.contact_id = p_contact_id
    AND m.sender = 'contact';

  IF v_first_message_at IS NULL THEN
    -- sem mensagem do cliente, nao ha SLA de 1a resposta a registrar
    RETURN;
  END IF;

  -- se ja existe registro COM resposta, nao reabre (idempotente)
  IF EXISTS (
    SELECT 1 FROM public.conversation_sla
    WHERE contact_id = p_contact_id
      AND first_response_at IS NOT NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.conversation_sla (contact_id, first_message_at, first_response_at, first_response_breached)
  VALUES (
    p_contact_id,
    v_first_message_at,
    v_now,
    v_now > v_first_message_at + make_interval(mins => v_first_response_minutes)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_first_response(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_first_response(uuid) TO authenticated;
