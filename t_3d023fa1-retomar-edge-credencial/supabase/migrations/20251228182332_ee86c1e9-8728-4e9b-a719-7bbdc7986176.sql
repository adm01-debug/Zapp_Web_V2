-- Add columns for individual notification sound types
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS message_sound_type text DEFAULT 'chime',
ADD COLUMN IF NOT EXISTS mention_sound_type text DEFAULT 'bell',
ADD COLUMN IF NOT EXISTS sla_sound_type text DEFAULT 'alert',
ADD COLUMN IF NOT EXISTS goal_sound_type text DEFAULT 'chime',
ADD COLUMN IF NOT EXISTS transcription_sound_type text DEFAULT 'soft';