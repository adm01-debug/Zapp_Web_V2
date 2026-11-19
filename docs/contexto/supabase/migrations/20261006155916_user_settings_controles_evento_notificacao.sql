ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS new_message_sound_enabled boolean DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS mention_sound_enabled boolean DEFAULT true;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sla_breach_sound_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.user_settings.new_message_sound_enabled IS
  'Som/aviso de "Novas Mensagens" (default true, igual a NotificationSettings.newMessageSound); NULL = sem preferencia gravada.';

COMMENT ON COLUMN public.user_settings.mention_sound_enabled IS
  'Som/aviso de "Menções" (default true, igual a NotificationSettings.mentionSound); NULL = sem preferencia gravada.';

COMMENT ON COLUMN public.user_settings.sla_breach_sound_enabled IS
  'Som/aviso de "Violação de SLA" (default true, igual a NotificationSettings.slaBreachSound); NULL = sem preferencia gravada.';
