ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS sound_volume integer DEFAULT 70

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, 0-100 (default 70, igual ao DEFAULT_SETTINGS do front)'
