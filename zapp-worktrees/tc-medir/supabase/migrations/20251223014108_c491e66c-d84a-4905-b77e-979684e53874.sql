-- Add TTS speed preference column to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS tts_speed numeric DEFAULT 1.0;