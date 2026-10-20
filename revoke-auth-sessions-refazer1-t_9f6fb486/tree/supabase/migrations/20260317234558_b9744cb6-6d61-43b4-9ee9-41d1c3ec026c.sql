
-- Stickers table for user sticker collections
CREATE TABLE public.stickers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  image_url TEXT NOT NULL,
  category TEXT DEFAULT 'geral',
  uploaded_by TEXT NULL,
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stickers ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all stickers
CREATE POLICY "Authenticated users can view stickers"
  ON public.stickers FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert stickers
CREATE POLICY "Authenticated users can insert stickers"
  ON public.stickers FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update stickers
CREATE POLICY "Authenticated users can update stickers"
  ON public.stickers FOR UPDATE
  TO authenticated
  USING (true);

-- Allow authenticated users to delete stickers
CREATE POLICY "Authenticated users can delete stickers"
  ON public.stickers FOR DELETE
  TO authenticated
  USING (true);

-- Create stickers storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('stickers', 'stickers', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for stickers bucket
CREATE POLICY "Authenticated users can upload stickers"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'stickers');

CREATE POLICY "Anyone can view stickers"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'stickers');

CREATE POLICY "Authenticated users can delete stickers"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'stickers');
