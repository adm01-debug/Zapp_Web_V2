-- 20261014153000_followup_runtime_fila_execucoes.sql
-- Runtime de follow-ups (cartão t_f949da13, área banco — refazer 1 t_1a45b46d).
-- Sobe a fila de execuções que o painel de pendentes consome: 4 RPCs
-- (enroll/complete/cancel/due) + RLS de SELECT por visibilidade de contato +
-- vocabulário de status com CHECK + motivo (reason) + backfill do legado +
-- gatilho que cancela os passos seguintes quando o contato responde.
--
-- Rollback (o bloco `-- Rollback (SQL executável, na ordem):` abaixo EXECUTA do jeito que
-- está: apagar as 4 RPCs, o gatilho, a função do gatilho, a policy nova e a coluna reason,
-- RESTAURAR o status legado SOMENTE das linhas que o backfill marcou e que ninguém tocou
-- depois (canceladas/concluídas após o backfill continuam como estão — nunca reativa
-- follow-up cancelado), voltar o default para 'pending', DERRUBAR os dois índices
-- (único parcial + runner) e REVOGAR os GRANTs. O teste followup-runtime.test.sh
-- extrai esse bloco e o executa).
--
-- Rollback (SQL executável, na ordem):
--   DROP INDEX IF EXISTS public.uq_followup_executions_open_enrollment;
--   DROP INDEX IF EXISTS public.idx_followup_executions_status_next_step;
--   DROP TRIGGER IF EXISTS trg_followup_cancel_on_inbound ON public.messages;
--   DROP FUNCTION IF EXISTS public.followup_cancel_on_inbound();
--   DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
--   CREATE POLICY "Authenticated can view followup executions" ON public.followup_executions FOR SELECT TO authenticated
--     USING (
--       contact_id IN (
--         SELECT c.id FROM public.contacts c
--         WHERE c.assigned_to IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
--       )
--       OR public.is_admin_or_supervisor(auth.uid())
--     );
--   ALTER TABLE public.followup_executions DROP CONSTRAINT IF EXISTS followup_executions_status_check;
--   UPDATE public.followup_executions
--     SET status = replace(reason, 'status_legado:', ''),
--         reason = NULL
--     WHERE reason LIKE 'status_legado:%'
--       AND status = CASE replace(reason, 'status_legado:', '')
--         WHEN 'pending' THEN 'pendente'
--         WHEN 'active' THEN 'pendente'
--         WHEN 'paused' THEN 'pendente'
--         WHEN 'scheduled' THEN 'pendente'
--         WHEN 'sent' THEN 'enviado'
--         WHEN 'delivered' THEN 'enviado'
--         WHEN 'completed' THEN 'concluido'
--         WHEN 'cancelled' THEN 'cancelado'
--         WHEN 'canceled' THEN 'cancelado'
--         WHEN 'failed' THEN 'erro'
--         WHEN 'error' THEN 'erro'
--         ELSE 'erro'
--       END;
--   ALTER TABLE public.followup_executions ALTER COLUMN status SET DEFAULT 'pending';
--   ALTER TABLE public.followup_executions DROP COLUMN IF EXISTS reason;
--   DROP FUNCTION IF EXISTS public.enroll_followup(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.complete_followup(uuid);
--   DROP FUNCTION IF EXISTS public.cancel_followup(uuid, text);
--   DROP FUNCTION IF EXISTS public.due_followups(integer);
--   REVOKE ALL ON public.followup_executions FROM anon, authenticated, service_role;
--

-- 1. Motivo (reason): sem ele, cancelar/concluir apagava o porquê.
-- O default do status passa a 'pendente' junto (vocabulário novo).
ALTER TABLE public.followup_executions
  ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.followup_executions
  ALTER COLUMN status SET DEFAULT 'pendente';

-- 2. Backfill do legado: converte o status antigo para o vocabulário novo e GUARDA o
-- valor original em reason ('status_legado:<valor>') para o rollback restaurar exato.
-- Vem ANTES do CHECK: o CHECK valida as linhas existentes, então o legado precisa
-- estar convertido antes dele. Linha sem status (NULL ou '') cai em 'erro' sem marcar
-- legado (não há o que restaurar).
UPDATE public.followup_executions
SET status = CASE status
  WHEN 'pending' THEN 'pendente'
  WHEN 'active' THEN 'pendente'
  WHEN 'paused' THEN 'pendente'
  WHEN 'scheduled' THEN 'pendente'
  WHEN 'sent' THEN 'enviado'
  WHEN 'delivered' THEN 'enviado'
  WHEN 'completed' THEN 'concluido'
  WHEN 'cancelled' THEN 'cancelado'
  WHEN 'canceled' THEN 'cancelado'
  WHEN 'failed' THEN 'erro'
  WHEN 'error' THEN 'erro'
  ELSE 'erro'
END,
reason = CASE
  WHEN status IN ('pending', 'active', 'paused', 'scheduled', 'sent', 'delivered',
                  'completed', 'cancelled', 'canceled', 'failed', 'error')
  THEN 'status_legado:' || status
  ELSE reason
END
WHERE status NOT IN ('pendente', 'enviado', 'concluido', 'cancelado', 'erro')
   OR status IS NULL;

-- 3. Endurece o status: vocabulário fechado (o defeito era aceitar qualquer texto).
ALTER TABLE public.followup_executions
  DROP CONSTRAINT IF EXISTS followup_executions_status_check;
ALTER TABLE public.followup_executions
  ADD CONSTRAINT followup_executions_status_check
  CHECK (status IN ('pendente', 'enviado', 'concluido', 'cancelado', 'erro'));

-- 4. Matrícula 1:1 por (contato, sequência) enquanto houver execução aberta: o banco
-- recusa a segunda matrícula (índice único parcial) e a RPC devolve erro amigável
-- antes (concorrência entre as duas leituras cai no índice e vira o mesmo erro).
CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_executions_open_enrollment
  ON public.followup_executions (contact_id, sequence_id)
  WHERE status IN ('pendente', 'enviado');

-- Índice do runner: due_followups varre (next_step_at, pendente).
CREATE INDEX IF NOT EXISTS idx_followup_executions_status_next_step
  ON public.followup_executions (next_step_at)
  WHERE status = 'pendente';

-- 5. RPCs do runtime (SECURITY DEFINER com SET search_path fixo; o gate de autorização
-- é is_admin_or_supervisor OU atendente do contato — mesmo erro para inexistente e
-- não-autorizado, sem oráculo).

-- 5a. Matricula o contato na sequência (1ª parcela da fila).
CREATE OR REPLACE FUNCTION public.enroll_followup(p_contact_id uuid, p_sequence_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_step record;
  v_execution_id uuid;
BEGIN
  -- Gate de autorização: staff OU atendente do contato (mesmo erro para inexistente
  -- e não-autorizado, sem oráculo de existência).
  IF NOT (public.is_admin_or_supervisor(auth.uid())
          OR public.is_contact_visible_to_user(p_contact_id, auth.uid())) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.followup_sequences
    WHERE id = p_sequence_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'sequence_not_available' USING ERRCODE = 'P0001';
  END IF;

  -- Matrícula é 1:1 por (contato, sequência) enquanto houver execução aberta.
  IF EXISTS (
    SELECT 1 FROM public.followup_executions
    WHERE contact_id = p_contact_id
      AND sequence_id = p_sequence_id
      AND status IN ('pendente', 'enviado')
  ) THEN
    RAISE EXCEPTION 'enrollment_already_open' USING ERRCODE = 'P0001';
  END IF;

  SELECT step_order, delay_hours INTO v_step
  FROM public.followup_steps
  WHERE sequence_id = p_sequence_id AND is_active = true
  ORDER BY step_order ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sequence_not_available' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.followup_executions
      (sequence_id, contact_id, current_step, status, started_at, next_step_at)
    VALUES
      (p_sequence_id, p_contact_id, v_step.step_order, 'pendente', now(),
       now() + (v_step.delay_hours || ' hours')::interval)
    RETURNING id INTO v_execution_id;
  EXCEPTION WHEN unique_violation THEN
    -- Corrida entre a checagem acima e o INSERT: o índice parcial barrou; mesmo erro.
    RAISE EXCEPTION 'enrollment_already_open' USING ERRCODE = 'P0001';
  END;

  RETURN jsonb_build_object('execution_id', v_execution_id);
END;
$f$;

-- 5b. Conclui a execução (só aberta: pendente/enviado).
CREATE OR REPLACE FUNCTION public.complete_followup(p_execution_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_row record;
BEGIN
  SELECT contact_id, status INTO v_row
  FROM public.followup_executions
  WHERE id = p_execution_id;

  -- Inexistente e não-autorizado dão o mesmo erro (sem oráculo); staff passa.
  IF NOT FOUND OR NOT (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(v_row.contact_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'execution_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status NOT IN ('pendente', 'enviado') THEN
    RAISE EXCEPTION 'execution_not_open' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.followup_executions
  SET status = 'concluido',
      completed_at = now()
  WHERE id = p_execution_id;

  RETURN jsonb_build_object('execution_id', p_execution_id, 'status', 'concluido');
END;
$f$;

-- 5c. Cancela a execução (só aberta). O motivo novo SEMPRE sobrescreve o anterior:
-- cancelar por cima do backfill apaga o 'status_legado:*' (nunca reativa no rollback).
CREATE OR REPLACE FUNCTION public.cancel_followup(p_execution_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
DECLARE
  v_row record;
  v_reason text := coalesce(nullif(btrim(coalesce(p_reason, '')), ''), 'cancelado_manualmente');
  v_new_status text;
BEGIN
  SELECT contact_id, status INTO v_row
  FROM public.followup_executions
  WHERE id = p_execution_id;

  -- Inexistente e não-autorizado dão o mesmo erro (sem oráculo); staff passa.
  IF NOT FOUND OR NOT (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(v_row.contact_id, auth.uid())
  ) THEN
    RAISE EXCEPTION 'execution_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_row.status NOT IN ('pendente', 'enviado') THEN
    RAISE EXCEPTION 'execution_not_open' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.followup_executions
  SET status = 'cancelado',
      reason = v_reason
  WHERE id = p_execution_id AND status IN ('pendente', 'enviado')
  RETURNING status INTO v_new_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution_not_open' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('execution_id', p_execution_id, 'status', 'cancelado');
END;
$f$;

-- 5d. Fila de vencidos para o runner (só service_role; limite saneado 1..100).
CREATE OR REPLACE FUNCTION public.due_followups(p_limit integer DEFAULT 10)
RETURNS TABLE (
  id uuid,
  sequence_id uuid,
  contact_id uuid,
  current_step integer,
  status text,
  started_at timestamptz,
  next_step_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
  SELECT e.id, e.sequence_id, e.contact_id, e.current_step, e.status, e.started_at, e.next_step_at
  FROM public.followup_executions AS e
  WHERE e.status IN ('pendente', 'enviado')
    AND e.next_step_at IS NOT NULL
    AND e.next_step_at <= now()
  ORDER BY e.next_step_at ASC
  LIMIT greatest(1, least(coalesce(p_limit, 10), 100));
$f$;

-- 6. Gatilho: resposta do contato (sender = 'contact') cancela os passos seguintes
-- (pendentes) daquele contato. O motivo 'resposta_do_contato' SEMPRE sobrescreve o
-- anterior — inclusive o 'status_legado:*' do backfill.
CREATE OR REPLACE FUNCTION public.followup_cancel_on_inbound()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $f$
BEGIN
  IF NEW.sender = 'contact' THEN
    UPDATE public.followup_executions
    SET status = 'cancelado',
        reason = 'resposta_do_contato'
    WHERE contact_id = NEW.contact_id AND status = 'pendente';
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_followup_cancel_on_inbound ON public.messages;
CREATE TRIGGER trg_followup_cancel_on_inbound
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.followup_cancel_on_inbound();

-- 7. RLS de SELECT por visibilidade de contato (atendente do contato OU staff).
-- Substitui a policy antiga pelo MESMO nome (o rollback recria a antiga).
-- Usa o helper canônico (SECURITY DEFINER): a policy avalia como o chamador, e o
-- helper roda como dono — sem ele, o SELECT direto como authenticated quebra por
-- falta de GRANT nas tabelas de visibilidade.
DROP POLICY IF EXISTS "Authenticated can view followup executions" ON public.followup_executions;
CREATE POLICY "Authenticated can view followup executions"
  ON public.followup_executions
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_supervisor(auth.uid())
    OR public.is_contact_visible_to_user(contact_id, (SELECT auth.uid()))
  );

-- 8. ACL por assinatura (o mínimo para cada papel; due_followups fora do authenticated).
REVOKE ALL ON FUNCTION public.enroll_followup(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enroll_followup(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.complete_followup(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_followup(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_followup(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_followup(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.due_followups(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.due_followups(integer) TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_executions TO anon, authenticated, service_role;
GRANT SELECT ON public.followup_sequences, public.followup_steps TO authenticated;
GRANT SELECT ON public.contacts TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT ON public.messages TO authenticated;
