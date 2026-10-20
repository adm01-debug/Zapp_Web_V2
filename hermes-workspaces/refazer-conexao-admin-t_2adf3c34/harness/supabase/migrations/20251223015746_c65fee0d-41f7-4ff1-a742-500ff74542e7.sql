-- Add auto transcription setting column to user_settings
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS auto_transcription_enabled boolean DEFAULT true;