-- queues_distribution_overflow
-- Rollback: restaura auto_assign_to_queue_agent e skill_based_assign com os corpos anteriores (abaixo), dropa as tres funcoes novas e seus triggers e remove as cinco colunas de public.queues.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists queue_overflow_rewrite on public.contacts;
--   drop function if exists public.queue_overflow_rewrite();
--   drop trigger if exists queues_prevent_overflow_cycle on public.queues;
--   drop function if exists public.queues_prevent_overflow_cycle();
--   create or replace function public.auto_assign_to_queue_agent() returns trigger language plpgsql security definer set search_path to 'public' as $function$ DECLARE assigned_agent_id UUID; effective_queue_id UUID; BEGIN IF NEW.queue_id IS NULL AND NEW.assigned_to IS NULL THEN SELECT id INTO effective_queue_id FROM public.queues WHERE is_active = true ORDER BY priority ASC, created_at ASC LIMIT 1; IF effective_queue_id IS NOT NULL THEN NEW.queue_id := effective_queue_id; END IF; END IF; IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN SELECT qm.profile_id INTO assigned_agent_id FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id JOIN public.user_roles ur ON ur.user_id = p.user_id WHERE qm.queue_id = NEW.queue_id AND qm.is_active = true AND p.is_active = true AND ur.role = 'agent' ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1; IF assigned_agent_id IS NOT NULL THEN NEW.assigned_to := assigned_agent_id; END IF; END IF; RETURN NEW; END; $function$;
--   create or replace function public.skill_based_assign(p_queue_id uuid) returns uuid language plpgsql security definer set search_path to 'public' as $function$ DECLARE v_agent_id UUID; BEGIN IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated' AND NOT public.is_admin_or_supervisor(auth.uid()) THEN RAISE EXCEPTION 'skill_based_assign: requer perfil admin ou supervisor'; END IF; SELECT qm.profile_id INTO v_agent_id FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true AND NOT EXISTS (SELECT 1 FROM public.queue_skill_requirements qsr WHERE qsr.queue_id = p_queue_id AND NOT EXISTS (SELECT 1 FROM public.agent_skills ags WHERE ags.profile_id = qm.profile_id AND ags.skill_name = qsr.skill_name AND ags.skill_level >= qsr.min_level)) ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1; IF v_agent_id IS NULL THEN SELECT qm.profile_id INTO v_agent_id FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC LIMIT 1; END IF; RETURN v_agent_id; END; $function$;
--   alter table public.queues drop column if exists paused;
--   alter table public.queues drop column if exists sticky_enabled;
--   alter table public.queues drop column if exists max_per_agent;
--   alter table public.queues drop column if exists overflow_queue_id;
--   alter table public.queues drop column if exists distribution;
--   drop function if exists public.queue_pick_agent(uuid, uuid);
--
-- Distribuicao configuravel de filas (round robin / menos ocupado / por habilidade),
-- limite por atendente, fixacao por contato e transbordo para fila de overflow.
-- Aditivo: colunas com default, CHECK, helper novo, dois triggers novos e o corpo
-- novo de auto_assign_to_queue_agent/skill_based_assign. Nenhum dado existente e
-- alterado (as colunas nascem com default) e nenhum GRANT/ACL muda.
--
-- Decisao de desenho: auto_assign_to_queue_agent (BEFORE) so ATRIBUI; o transbordo
-- (troca de queue_id) acontece no trigger AFTER queue_overflow_rewrite, porque
-- conversation_events.contact_id tem FK imediata para contacts(id) e o BEFORE INSERT
-- nao pode gravar evento (a linha ainda nao existe). Fazendo a troca no AFTER, o
-- trigger ja existente log_assignment_change (AFTER UPDATE OF queue_id) registra o
-- 'queue_transfer' em conversation_events — e o transbordo fica registrado sem
-- escrever um logger novo.

-- 1. Colunas de configuracao em public.queues
ALTER TABLE public.queues
  ADD COLUMN IF NOT EXISTS distribution text NOT NULL DEFAULT 'least_busy',
  ADD COLUMN IF NOT EXISTS overflow_queue_id uuid REFERENCES public.queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS max_per_agent integer,
  ADD COLUMN IF NOT EXISTS sticky_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.queues
  ADD CONSTRAINT queues_distribution_check
  CHECK (distribution IN ('round_robin', 'least_busy', 'skill'));

ALTER TABLE public.queues
  ADD CONSTRAINT queues_max_per_agent_check
  CHECK (max_per_agent IS NULL OR max_per_agent >= 1);

-- 2. Transbordo sem ciclo: uma fila nao pode transbordar para si mesma nem fechar ciclo
CREATE OR REPLACE FUNCTION public.queues_prevent_overflow_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_cur uuid;
  v_depth integer := 0;
BEGIN
  IF NEW.overflow_queue_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.overflow_queue_id = NEW.id THEN
    RAISE EXCEPTION 'queues.overflow_queue_id: uma fila nao pode transbordar para si mesma (queue %)', NEW.id
      USING ERRCODE = '23514';
  END IF;
  v_cur := NEW.overflow_queue_id;
  WHILE v_cur IS NOT NULL AND v_depth < 100 LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'queues.overflow_queue_id: ciclo de transbordo detectado (queue %)', NEW.id
        USING ERRCODE = '23514';
    END IF;
    SELECT q.overflow_queue_id INTO v_cur FROM public.queues q WHERE q.id = v_cur;
    v_depth := v_depth + 1;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER queues_prevent_overflow_cycle
  BEFORE INSERT OR UPDATE OF overflow_queue_id ON public.queues
  FOR EACH ROW EXECUTE FUNCTION public.queues_prevent_overflow_cycle();

-- 3. Selecao de atendente (fonte unica do algoritmo)
--  distribution: 'least_busy' (padrao, comportamento anterior) | 'round_robin' | 'skill'
--  respeita fila ativa/nao-pausada, atendente ativo, papel 'agent', max_per_agent e,
--  em 'skill', TODOS os requisitos de habilidade da fila.
--  sticky (quando ligado): tenta antes o ultimo atendente do contato (conversation_events).
CREATE OR REPLACE FUNCTION public.queue_pick_agent(p_queue_id uuid, p_contact_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_q record;
  v_agent uuid;
  v_last_agent uuid;
BEGIN
  SELECT id, is_active, paused, distribution, max_per_agent, sticky_enabled
    INTO v_q
  FROM public.queues
  WHERE id = p_queue_id;

  IF NOT FOUND OR v_q.paused IS TRUE THEN
    RETURN NULL;
  END IF;

  IF v_q.sticky_enabled AND p_contact_id IS NOT NULL THEN
    SELECT ce.to_agent_id INTO v_last_agent
    FROM public.conversation_events ce
    WHERE ce.contact_id = p_contact_id AND ce.to_agent_id IS NOT NULL
    ORDER BY ce.created_at DESC, ce.id DESC
    LIMIT 1;

    IF v_last_agent IS NOT NULL THEN
      SELECT qm.profile_id INTO v_agent
      FROM public.queue_members qm
      JOIN public.profiles p ON p.id = qm.profile_id
      JOIN public.user_roles ur ON ur.user_id = p.user_id
      WHERE qm.queue_id = p_queue_id
        AND qm.profile_id = v_last_agent
        AND qm.is_active = true
        AND p.is_active = true
        AND ur.role = 'agent'
        AND (v_q.max_per_agent IS NULL
             OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_q.max_per_agent)
        AND (v_q.distribution <> 'skill'
             OR NOT EXISTS (
                  SELECT 1 FROM public.queue_skill_requirements qsr
                  WHERE qsr.queue_id = p_queue_id
                    AND NOT EXISTS (
                      SELECT 1 FROM public.agent_skills ags
                      WHERE ags.profile_id = qm.profile_id
                        AND ags.skill_name = qsr.skill_name
                        AND ags.skill_level >= qsr.min_level)));
      IF v_agent IS NOT NULL THEN
        RETURN v_agent;
      END IF;
    END IF;
  END IF;

  SELECT qm.profile_id INTO v_agent
  FROM public.queue_members qm
  JOIN public.profiles p ON p.id = qm.profile_id
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE qm.queue_id = p_queue_id
    AND qm.is_active = true
    AND p.is_active = true
    AND ur.role = 'agent'
    AND (v_q.max_per_agent IS NULL
         OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_q.max_per_agent)
    AND (v_q.distribution <> 'skill'
         OR NOT EXISTS (
              SELECT 1 FROM public.queue_skill_requirements qsr
              WHERE qsr.queue_id = p_queue_id
                AND NOT EXISTS (
                  SELECT 1 FROM public.agent_skills ags
                  WHERE ags.profile_id = qm.profile_id
                    AND ags.skill_name = qsr.skill_name
                    AND ags.skill_level >= qsr.min_level)))
  ORDER BY
    CASE WHEN v_q.distribution = 'round_robin'
         THEN GREATEST(
           (SELECT MAX(ce.created_at)
            FROM public.conversation_events ce
            WHERE ce.to_agent_id = qm.profile_id
              AND (ce.to_queue_id = p_queue_id
                   OR ce.metadata->>'new_queue' = p_queue_id::text)),
           (SELECT MAX(c.created_at) FROM public.contacts c
            WHERE c.assigned_to = qm.profile_id AND c.queue_id = p_queue_id)
         )
    END ASC NULLS FIRST,
    (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC,
    qm.profile_id ASC
  LIMIT 1;

  RETURN v_agent;
END;
$function$;

-- 4. auto_assign_to_queue_agent (BEFORE INSERT OR UPDATE OF queue_id)
--  - fila default (queue_id NULL): a primeira ativa e NAO pausada (priority, created_at)
--  - atribui pelo helper; fila pausada nao atribui
CREATE OR REPLACE FUNCTION public.auto_assign_to_queue_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_default_queue uuid;
BEGIN
  IF NEW.queue_id IS NULL AND NEW.assigned_to IS NULL THEN
    SELECT id INTO v_default_queue
    FROM public.queues
    WHERE is_active = true AND paused = false
    ORDER BY priority ASC, created_at ASC
    LIMIT 1;
    IF v_default_queue IS NOT NULL THEN
      NEW.queue_id := v_default_queue;
    END IF;
  END IF;

  IF NEW.queue_id IS NOT NULL AND NEW.assigned_to IS NULL THEN
    NEW.assigned_to := public.queue_pick_agent(NEW.queue_id, NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;

-- 5. Transbordo: sem atendente elegivel e com overflow configurado, move a fila.
--  A troca de queue_id dispara log_assignment_change -> conversation_events
--  ('queue_transfer') e reavalia a atribuicao na fila de transbordo (BEFORE).
CREATE OR REPLACE FUNCTION public.queue_overflow_rewrite()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_q record;
BEGIN
  IF NEW.queue_id IS NULL OR NEW.assigned_to IS NOT NULL THEN
    RETURN NULL;
  END IF;

  SELECT id, is_active, paused, overflow_queue_id INTO v_q
  FROM public.queues
  WHERE id = NEW.queue_id;

  IF NOT FOUND
     OR v_q.is_active IS DISTINCT FROM true
     OR v_q.paused IS TRUE
     OR v_q.overflow_queue_id IS NULL
     OR v_q.overflow_queue_id = NEW.queue_id THEN
    RETURN NULL;
  END IF;

  -- So transborda se realmente nao ha atendente elegivel na fila de origem
  IF public.queue_pick_agent(NEW.queue_id, NEW.id) IS NOT NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.contacts
     SET queue_id = v_q.overflow_queue_id
   WHERE id = NEW.id
     AND queue_id = NEW.queue_id;

  RETURN NULL;
END;
$function$;

CREATE TRIGGER queue_overflow_rewrite
  AFTER INSERT OR UPDATE OF queue_id ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.queue_overflow_rewrite();

-- 6. skill_based_assign passa a respeitar max_per_agent da fila (mantem a checagem
--  de admin/supervisor e o filtro por habilidade com fallback)
CREATE OR REPLACE FUNCTION public.skill_based_assign(p_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_agent_id uuid;
  v_max integer;
BEGIN
  IF (current_setting('request.jwt.claims', true)::jsonb->>'role') = 'authenticated'
     AND NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'skill_based_assign: requer perfil admin ou supervisor';
  END IF;

  SELECT max_per_agent INTO v_max FROM public.queues WHERE id = p_queue_id;

  SELECT qm.profile_id INTO v_agent_id
  FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
  WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
    AND (v_max IS NULL OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_max)
    AND NOT EXISTS (
      SELECT 1 FROM public.queue_skill_requirements qsr WHERE qsr.queue_id = p_queue_id
      AND NOT EXISTS (
        SELECT 1 FROM public.agent_skills ags WHERE ags.profile_id = qm.profile_id
        AND ags.skill_name = qsr.skill_name AND ags.skill_level >= qsr.min_level
      )
    )
  ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC, qm.profile_id ASC LIMIT 1;

  IF v_agent_id IS NULL THEN
    SELECT qm.profile_id INTO v_agent_id
    FROM public.queue_members qm JOIN public.profiles p ON p.id = qm.profile_id
    WHERE qm.queue_id = p_queue_id AND qm.is_active = true AND p.is_active = true
      AND (v_max IS NULL OR (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) < v_max)
    ORDER BY (SELECT COUNT(*) FROM public.contacts c WHERE c.assigned_to = qm.profile_id) ASC, qm.profile_id ASC LIMIT 1;
  END IF;

  RETURN v_agent_id;
END;
$function$;

-- 7. Negar por padrao: as tres funcoes novas nascem com EXECUTE para PUBLIC (ACL padrao
--  do Postgres) e nenhuma delas e RPC de cliente. auto_assign_to_queue_agent e
--  skill_based_assign preservam o ACL anterior (CREATE OR REPLACE nao mexe em ACL).
REVOKE ALL ON FUNCTION public.queue_pick_agent(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_overflow_rewrite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queues_prevent_overflow_cycle() FROM PUBLIC, anon, authenticated;
