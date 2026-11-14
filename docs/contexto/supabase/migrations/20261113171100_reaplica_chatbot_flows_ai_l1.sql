SET search_path = public, pg_temp

SET lock_timeout = '5s'

ALTER TABLE public.chatbot_flows DROP CONSTRAINT IF EXISTS chatbot_flows_trigger_type_check

ALTER TABLE public.chatbot_flows
  ADD CONSTRAINT chatbot_flows_trigger_type_check
  CHECK (trigger_type IN ('keyword', 'first_message', 'menu', 'webhook', 'schedule', 'ai_l1'))

CREATE UNIQUE INDEX IF NOT EXISTS chatbot_flows_ai_l1_one_active_idx
  ON public.chatbot_flows (whatsapp_connection_id)
  WHERE trigger_type = 'ai_l1' AND is_active IS TRUE AND whatsapp_connection_id IS NOT NULL
