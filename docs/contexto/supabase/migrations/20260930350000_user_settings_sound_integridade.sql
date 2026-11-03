ALTER TABLE public.user_settings
  ALTER COLUMN sound_volume SET NOT NULL

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_message_sound_type_valid
  CHECK (message_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_message_sound_type_valid

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_mention_sound_type_valid
  CHECK (mention_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_mention_sound_type_valid

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_sla_sound_type_valid
  CHECK (sla_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_sla_sound_type_valid

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_goal_sound_type_valid
  CHECK (goal_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_goal_sound_type_valid

ALTER TABLE public.user_settings
  ADD CONSTRAINT user_settings_transcription_sound_type_valid
  CHECK (transcription_sound_type IN ('beep', 'chime', 'bell', 'alert', 'soft')) NOT VALID

ALTER TABLE public.user_settings
  VALIDATE CONSTRAINT user_settings_transcription_sound_type_valid

COMMENT ON COLUMN public.user_settings.sound_volume IS
  'Volume dos alertas do sistema, NOT NULL, 10-100 (default 70; mesmo intervalo do Slider do painel e do DEFAULT_SETTINGS do front). Mudo = sound_enabled.'

COMMENT ON COLUMN public.user_settings.message_sound_type IS
  'Som de mensagem nova: beep | chime | bell | alert | soft (vocabulario unico do front: SoundTypeOption / SoundType).'

COMMENT ON COLUMN public.user_settings.mention_sound_type IS
  'Som de mencao: beep | chime | bell | alert | soft.'

COMMENT ON COLUMN public.user_settings.sla_sound_type IS
  'Som de violacao de SLA: beep | chime | bell | alert | soft.'

COMMENT ON COLUMN public.user_settings.goal_sound_type IS
  'Som de meta atingida: beep | chime | bell | alert | soft.'

COMMENT ON COLUMN public.user_settings.transcription_sound_type IS
  'Som de transcricao pronta: beep | chime | bell | alert | soft.'
