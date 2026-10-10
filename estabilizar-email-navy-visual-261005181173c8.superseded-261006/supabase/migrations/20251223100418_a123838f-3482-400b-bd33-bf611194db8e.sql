-- Add transcription notification setting column
ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS transcription_notification_enabled boolean DEFAULT true;