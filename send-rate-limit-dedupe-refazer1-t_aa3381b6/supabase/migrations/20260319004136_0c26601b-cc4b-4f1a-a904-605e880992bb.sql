
-- Audio Memes table
CREATE TABLE public.audio_memes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  audio_url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  duration_seconds NUMERIC(6,2),
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  use_count INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.audio_memes ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can read audio memes"
  ON public.audio_memes FOR SELECT
  TO authenticated
  USING (true);

-- Authenticated users can insert
CREATE POLICY "Authenticated users can insert audio memes"
  ON public.audio_memes FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Authenticated users can update (favorites, use_count)
CREATE POLICY "Authenticated users can update audio memes"
  ON public.audio_memes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Only uploader or admin can delete
CREATE POLICY "Users can delete own audio memes"
  ON public.audio_memes FOR DELETE
  TO authenticated
  USING (uploaded_by = auth.uid() OR public.is_admin_or_supervisor(auth.uid()));

-- Create storage bucket for audio memes
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-memes', 'audio-memes', true);

-- Storage policies
CREATE POLICY "Public read audio memes" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'audio-memes');

CREATE POLICY "Auth upload audio memes" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-memes');

CREATE POLICY "Auth delete own audio memes" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'audio-memes');
