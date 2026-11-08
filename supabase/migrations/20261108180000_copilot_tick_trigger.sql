-- CV-141: Trigger enfileira tick do copiloto quando nova mensagem de CONTATO chega
-- Debounce de 4 s via ai_jobs — evita spam de ticks em rajada de mensagens.
-- Só enfileira quando há sessão ativa para a conversa (last_tick_at não nulo).

CREATE OR REPLACE FUNCTION public.enqueue_copilot_tick_on_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_session_id  uuid;
  v_scheduled   timestamptz;
BEGIN
  -- Só dispara para mensagens recebidas do contato (from_me = false).
  IF NEW.from_me IS NOT FALSE THEN
    RETURN NEW;
  END IF;

  -- Verificar se existe sessão ativa do copiloto para esta conversa.
  SELECT id INTO v_session_id
  FROM public.copilot_sessions
  WHERE conversation_id = NEW.conversation_id
    AND closed_at IS NULL
  LIMIT 1;

  IF v_session_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Debounce: agendar 4 s à frente; jobs duplicados no mesmo intervalo são
  -- ignorados via ON CONFLICT DO NOTHING (chave idempotente por session_id).
  v_scheduled := now() + interval '4 seconds';

  INSERT INTO public.ai_jobs (
    job_type,
    payload,
    scheduled_at,
    idempotency_key
  )
  VALUES (
    'copilot_tick',
    jsonb_build_object(
      'session_id',       v_session_id,
      'conversation_id',  NEW.conversation_id,
      'message_id',       NEW.id
    ),
    v_scheduled,
    'copilot-tick:' || v_session_id::text
  )
  ON CONFLICT (idempotency_key)
  DO UPDATE SET
    scheduled_at = EXCLUDED.scheduled_at,
    payload      = EXCLUDED.payload;

  RETURN NEW;
END;
$$;

-- Aplica apenas na tabela messages (canal principal de mensagens do Zapp).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'messages'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_enqueue_copilot_tick'
    ) THEN
      CREATE TRIGGER trg_enqueue_copilot_tick
        AFTER INSERT ON public.messages
        FOR EACH ROW EXECUTE FUNCTION public.enqueue_copilot_tick_on_contact_message();
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.enqueue_copilot_tick_on_contact_message IS
  'CV-141 — enfileira tick do RADAR ao receber mensagem do contato; debounce 4 s.';
