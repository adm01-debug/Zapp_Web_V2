-- Add transcription column to messages table
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT 'pending';