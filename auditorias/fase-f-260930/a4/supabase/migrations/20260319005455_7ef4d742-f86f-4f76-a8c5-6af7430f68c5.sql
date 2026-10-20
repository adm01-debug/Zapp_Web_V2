
CREATE TABLE public.custom_emojis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  category TEXT DEFAULT 'outros',
  is_favorite BOOLEAN DEFAULT false,
  use_count INTEGER DEFAULT 0,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view custom emojis"
  ON public.custom_emojis FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert custom emojis"
  ON public.custom_emojis FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update custom emojis"
  ON public.custom_emojis FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete custom emojis"
  ON public.custom_emojis FOR DELETE
  TO authenticated
  USING (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('custom-emojis', 'custom-emojis', true, 512000, ARRAY['image/png', 'image/webp', 'image/gif', 'image/jpeg', 'image/svg+xml'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read for custom emojis"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'custom-emojis');

CREATE POLICY "Auth upload custom emojis"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'custom-emojis');

CREATE POLICY "Auth delete custom emojis"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'custom-emojis');
