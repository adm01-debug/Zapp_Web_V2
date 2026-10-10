-- Add TTS voice preference column to user_settings
ALTER TABLE public.user_settings
ADD COLUMN IF NOT EXISTS tts_voice_id text DEFAULT 'EXAVITQu4vr4xnSDxMaL';

COMMENT ON COLUMN public.user_settings.tts_voice_id IS 'ElevenLabs voice ID for text-to-speech';