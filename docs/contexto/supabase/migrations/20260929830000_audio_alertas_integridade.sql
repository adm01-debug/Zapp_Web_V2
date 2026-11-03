ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_sound_volume_range
  CHECK (sound_volume BETWEEN 10 AND 100) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_sound_volume_range

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled.'
