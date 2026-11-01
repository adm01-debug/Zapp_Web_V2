-- CV-021–045: motor do Copiloto RADAR sobre o esquema de 20261030100000/110000.
--
-- O que liga: cada mensagem do CONTATO agenda um job `copilot.tick` na fila
-- `ai_jobs` (consumida pelo ai-jobs-worker, cron de 1 min). O handler lê as
-- mensagens novas, chama a IA em dois andares e grava o estado na sessão e os
-- insights em `copilot_insights`.
--
-- NASCE DESLIGADO: a capacidade `ai.capability.copilot_live` é semeada com
-- enabled = false. Sem a linha a capacidade valeria LIGADA (ai-feature-flags.ts),
-- por isso a semente é obrigatória. Ligar = UPDATE feature_flags SET enabled = true.
--
-- Identidade da conversa: o Zapp não tem tabela de conversas — as mensagens se
-- ligam ao contato. `copilot_sessions.conversation_id` recebe o contact_id (uma
-- sessão por contato; UNIQUE (conversation_id) já existe).
--
-- Rollback no fim do arquivo.

-- 1. Campos que o motor grava e a tabela ainda não tem ------------------------
ALTER TABLE public.copilot_sessions
  ADD COLUMN IF NOT EXISTS last_contact_message_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_processed_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS intent                    text,
  ADD COLUMN IF NOT EXISTS sentiment                 text,
  ADD COLUMN IF NOT EXISTS comm_style                text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS decision_role             text,
  ADD COLUMN IF NOT EXISTS occasion                  text,
  ADD COLUMN IF NOT EXISTS stakeholders              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS brinde_evidence           jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.copilot_insights
  ADD COLUMN IF NOT EXISTS tier       smallint CHECK (tier IN (1, 2)),
  ADD COLUMN IF NOT EXISTS latency_ms integer  CHECK (latency_ms >= 0),
  ADD COLUMN IF NOT EXISTS data       jsonb;

-- 2. Semente da capacidade, DESLIGADA -----------------------------------------
INSERT INTO public.feature_flags (key, enabled, description)
VALUES (
  'ai.capability.copilot_live',
  false,
  'Copiloto RADAR ao vivo: análise por IA a cada mensagem do contato (custo por mensagem). Desligado na criação.'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Gatilho "contato falou" → agenda o tick ----------------------------------
-- Debounce de 4 s: a chave de idempotência agrupa as mensagens do mesmo contato
-- na mesma janela de 4 s, e o job só fica disponível 4 s depois — uma rajada vira
-- um tick só. NUNCA bloqueia a gravação da mensagem: qualquer erro vira WARNING.
CREATE OR REPLACE FUNCTION public.enqueue_copilot_tick_on_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_contact  record;
  v_user_id  uuid;
  v_session  uuid;
BEGIN
  BEGIN
    IF EXISTS (
      SELECT 1 FROM public.feature_flags
       WHERE key = 'ai.capability.copilot_live' AND enabled = false
    ) THEN
      RETURN NEW;
    END IF;

    SELECT c.id, c.assigned_to, c.deleted_at, c.is_lid_legacy, c.contact_type
      INTO v_contact
      FROM public.contacts c
     WHERE c.id = NEW.contact_id;
    IF NOT FOUND
       OR v_contact.deleted_at IS NOT NULL
       OR coalesce(v_contact.is_lid_legacy, false)
       -- copiloto de VENDAS: só cliente (colaborador, fornecedor, transportadora… ficam fora)
       OR coalesce(v_contact.contact_type, 'cliente') <> 'cliente'
       OR v_contact.assigned_to IS NULL THEN
      RETURN NEW;
    END IF;

    -- contacts.assigned_to guarda profiles.id; as tabelas do copiloto usam auth.users.id.
    SELECT p.user_id INTO v_user_id FROM public.profiles p WHERE p.id = v_contact.assigned_to;
    IF v_user_id IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.copilot_sessions (conversation_id, contact_id, profile_id, last_contact_message_at)
    VALUES (NEW.contact_id, NEW.contact_id, v_user_id, NEW.created_at)
    ON CONFLICT (conversation_id) DO UPDATE
      SET last_contact_message_at = GREATEST(
            coalesce(public.copilot_sessions.last_contact_message_at, EXCLUDED.last_contact_message_at),
            EXCLUDED.last_contact_message_at),
          profile_id = EXCLUDED.profile_id
    RETURNING id INTO v_session;

    INSERT INTO public.ai_jobs (idempotency_key, kind, function_name, user_id, payload, priority, available_at, max_attempts)
    VALUES (
      'copilot.tick:' || NEW.contact_id::text || ':' || floor(extract(epoch FROM now()) / 4)::bigint::text,
      'copilot.tick',
      'copilot-live',
      v_user_id,
      jsonb_build_object(
        'session_id', v_session,
        'contact_id', NEW.contact_id,
        'profile_id', v_user_id,
        'trigger_message_id', NEW.id
      ),
      50,
      now() + interval '4 seconds',
      3
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'copilot tick nao agendado para a mensagem %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_copilot_tick_on_contact_message() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_copilot_tick_on_contact_message ON public.messages;
CREATE TRIGGER trg_copilot_tick_on_contact_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  WHEN (NEW.sender = 'contact')
  EXECUTE FUNCTION public.enqueue_copilot_tick_on_contact_message();

-- Rollback:
-- DROP TRIGGER IF EXISTS trg_copilot_tick_on_contact_message ON public.messages;
-- DROP FUNCTION IF EXISTS public.enqueue_copilot_tick_on_contact_message();
-- DELETE FROM public.feature_flags WHERE key = 'ai.capability.copilot_live';
-- ALTER TABLE public.copilot_insights DROP COLUMN IF EXISTS data, DROP COLUMN IF EXISTS latency_ms, DROP COLUMN IF EXISTS tier;
-- ALTER TABLE public.copilot_sessions DROP COLUMN IF EXISTS brinde_evidence, DROP COLUMN IF EXISTS stakeholders,
--   DROP COLUMN IF EXISTS occasion, DROP COLUMN IF EXISTS decision_role, DROP COLUMN IF EXISTS comm_style,
--   DROP COLUMN IF EXISTS sentiment, DROP COLUMN IF EXISTS intent, DROP COLUMN IF EXISTS last_processed_message_at,
--   DROP COLUMN IF EXISTS last_contact_message_at;
