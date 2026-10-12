-- followup_runtime_fila_execucoes
-- Rollback: remove os objetos criados (gatilho, 4 RPCs, índice, CHECK, policy nova), restaura o default 'pending' e a policy ANTERIOR, e reverte o backfill usando o valor legado guardado em reason ('status_legado:<valor>').
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists trg_followup_cancel_on_inbound on public.messages;
--   drop function if exists public.followup_cancel_on_inbound_message();
--   drop function if exists public.due_followups(integer);
--   drop function if exists public.cancel_followup(uuid, text);
--   drop function if exists public.complete_followup(uuid);
--   drop function if exists public.enroll_followup(uuid, uuid);
--   drop policy if exists "Authenticated can view followup executions" on public.followup_executions;
--   create policy "Authenticated can view followup executions" on public.followup_executions for select to authenticated using (contact_id in (select c.id from public.contacts c where c.assigned_to in (select p.id from public.profiles p where p.user_id = auth.uid())) or public.is_admin_or_supervisor(auth.uid()));
--   alter table public.followup_executions drop constraint if exists followup_executions_status_check;
--   update public.followup_executions set status = replace(reason, 'status_legado:', ''), reason = null where reason like 'status_legado:%';
--   alter table public.followup_executions alter column status set default 'pending';
--   drop index if exists public.idx_followup_executions_status_next_step;
--   alter table public.followup_executions drop column if exists reason;
--
-- Card t_f949da13 (auditoria Follow-ups, área banco): "sequências existem, mas
-- não há registro de quem está em qual passo". Esta migration entrega o RUNTIME:
-- a fila de execuções sobre followup_executions (contato, sequência, passo atual,
-- próxima execução, status e motivo), as RPCs de entrada/saída (enroll/complete/
-- cancel/due) e o gatilho que cancela os passos seguintes quando o contato responde.
--
-- Estado antes (BLOCO A do teste scripts/db-audit/followup-runtime.test.sh):
--   * nenhuma das 4 RPCs existe -> o painel de pendentes não tem de onde ler;
--   * followup_executions aceita QUALQUER texto em status (sem CHECK) e não tem
--     coluna de motivo;
--   * o SELECT de followup_executions desvia por contacts.assigned_to e não usa o
--     helper canônico de visibilidade de contato.
--
-- Objetos que esta migration cria/ajusta (nada além do pedido):
--   coluna  followup_executions.reason
--   CHECK   followup_executions_status_check ('pendente','enviado','concluido','cancelado','erro')
--   índice  idx_followup_executions_status_next_step (parcial, status 'pendente')
--   policy  "Authenticated can view followup executions" (staff OU contato visível)
--   função  enroll_followup(uuid,uuid)      -> authenticated/service_role
--   função  complete_followup(uuid)         -> authenticated/service_role
--   função  cancel_followup(uuid,text)      -> authenticated/service_role
--   função  due_followups(integer)          -> SOMENTE service_role
--   gatilho trg_followup_cancel_on_inbound  (mensagem do contato cancela pendentes)

-- ============================================================
-- 1. motivo + vocabulário de status (aditivo, idempotente)
-- ============================================================
ALTER TABLE public.followup_executions
  ADD COLUMN IF NOT EXISTS reason text;

ALTER TABLE public.followup_executions
  ALTER COLUMN status SET DEFAULT 'pendente';

-- Backfill idempotente: só toca linhas fora do vocabulário novo. Preserva o valor
-- legado no motivo ('status_legado:<valor>') para o Rollback ser exato. Como o SET
-- enxerga o valor ANTIGO em toda a instrução, o CASE lê o status pré-migração.
UPDATE public.followup_executions
SET status = CASE status
      WHEN 'pending'   THEN 'pendente'
      WHEN 'active'    THEN 'pendente'
      WHEN 'paused'    THEN 'pendente'
      WHEN 'scheduled' THEN 'pendente'
      WHEN 'sent'      THEN 'enviado'
      WHEN 'delivered' THEN 'enviado'
      WHEN 'completed' THEN 'concluido'
      WHEN 'cancelled' THEN 'cancelado'
      WHEN 'canceled'  THEN 'cancelado'
      WHEN 'failed'    THEN 'erro'
      WHEN 'error'     THEN 'erro'
      ELSE 'erro'
    END,
    reason = coalesce(reason, 'status_legado:' || status)
WHERE status NOT IN ('pendente', 'enviado', 'concluido', 'cancelado', 'erro');

ALTER TABLE public.followup_executions
  DROP CONSTRAINT IF EXISTS followup_executions_status_check;
ALTER TABLE public.followup_executions
  ADD CONSTRAINT followup_executions_status_check
  CHECK (status IN ('pendente', 'enviado', 'concluido', 'cancelado', 'erro'));

CREATE INDEX IF NOT EXISTS idx_followup_executions_status_next_step
  ON public.followup_executions (next_step_at)
  WHERE status = 'pendente';

-- ============================================================
-- 2. RLS: staff OU atendente do contato (helper canônico)
-- ============================================================
ALTER TABLE public.followup_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
CREATE POLICY "Authenticated can view followup executions"
  ON public.followup_executions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, (SELECT auth.uid()))
  );

-- ============================================================
-- 3. RPCs do runtime
-- ============================================================
CREATE OR REPLACE FUNCTION public.enroll_followup(
  p_contact_id uuid,
  p_sequence_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_step  integer;
  v_delay integer;
  v_id    uuid;
  v_next  timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.is_admin_or_supervisor(auth.uid())
          OR public.is_contact_visible_to_user(p_contact_id, auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Mensagem igual para sequência inexistente e inativa: sem oráculo.
  IF NOT EXISTS (
    SELECT 1 FROM public.followup_sequences
    WHERE id = p_sequence_id AND coalesce(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'sequence_not_available' USING ERRCODE = 'P0002';
  END IF;

  SELECT step_order, delay_hours INTO v_step, v_delay
  FROM public.followup_steps
  WHERE sequence_id = p_sequence_id AND coalesce(is_active, true) = true
  ORDER BY step_order
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'sequence_not_available' USING ERRCODE = 'P0002';
  END IF;

  v_next := now() + make_interval(hours => greatest(coalesce(v_delay, 0), 0));

  INSERT INTO public.followup_executions
    (sequence_id, contact_id, current_step, status, started_at, next_step_at)
  VALUES
    (p_sequence_id, p_contact_id, v_step, 'pendente', now(), v_next)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'ok', true, 'execution_id', v_id,
    'current_step', v_step, 'next_step_at', v_next
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_followup(
  p_execution_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- A visibilidade entra no próprio SELECT: id inexistente e id alheio devolvem o
  -- MESMO erro, então não há oráculo de existência.
  SELECT status INTO v_status
  FROM public.followup_executions
  WHERE id = p_execution_id
    AND (public.is_admin_or_supervisor(auth.uid())
         OR public.is_contact_visible_to_user(contact_id, auth.uid()))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('pendente', 'enviado') THEN
    RAISE EXCEPTION 'execution_not_open' USING ERRCODE = '22023';
  END IF;

  UPDATE public.followup_executions
  SET status = 'concluido', completed_at = now()
  WHERE id = p_execution_id;

  RETURN jsonb_build_object('ok', true, 'status', 'concluido');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_followup(
  p_execution_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status
  FROM public.followup_executions
  WHERE id = p_execution_id
    AND (public.is_admin_or_supervisor(auth.uid())
         OR public.is_contact_visible_to_user(contact_id, auth.uid()))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('pendente', 'enviado') THEN
    RAISE EXCEPTION 'execution_not_open' USING ERRCODE = '22023';
  END IF;

  UPDATE public.followup_executions
  SET status = 'cancelado',
      reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), reason, 'cancelado_manualmente'),
      completed_at = coalesce(completed_at, now())
  WHERE id = p_execution_id;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelado');
END;
$function$;

CREATE OR REPLACE FUNCTION public.due_followups(
  p_limit integer DEFAULT 50
) RETURNS TABLE (
  id uuid,
  contact_id uuid,
  sequence_id uuid,
  current_step integer,
  status text,
  next_step_at timestamptz,
  started_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  -- Só o runner (chave service_role) enfileira envios.
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.contact_id, e.sequence_id, e.current_step,
         e.status, e.next_step_at, e.started_at
  FROM public.followup_executions AS e
  WHERE e.status = 'pendente'
    AND e.next_step_at IS NOT NULL
    AND e.next_step_at <= now()
  ORDER BY e.next_step_at, e.id
  LIMIT greatest(1, least(coalesce(p_limit, 50), 200));
END;
$function$;

-- ============================================================
-- 4. Gatilho: resposta do contato cancela os passos seguintes
-- ============================================================
CREATE OR REPLACE FUNCTION public.followup_cancel_on_inbound_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF NEW.sender = 'contact' AND NEW.contact_id IS NOT NULL THEN
    UPDATE public.followup_executions
    SET status = 'cancelado',
        reason = coalesce(reason, 'resposta_do_contato'),
        completed_at = coalesce(completed_at, now())
    WHERE contact_id = NEW.contact_id
      AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_followup_cancel_on_inbound ON public.messages;
CREATE TRIGGER trg_followup_cancel_on_inbound
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.sender = 'contact' AND NEW.contact_id IS NOT NULL)
  EXECUTE FUNCTION public.followup_cancel_on_inbound_message();

-- ============================================================
-- 5. ACL (pela assinatura exata; negar por padrão)
-- ============================================================
REVOKE ALL ON FUNCTION public.enroll_followup(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enroll_followup(uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.complete_followup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_followup(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cancel_followup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_followup(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.due_followups(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.due_followups(integer) TO service_role;

REVOKE ALL ON FUNCTION public.followup_cancel_on_inbound_message() FROM PUBLIC, anon, authenticated;
