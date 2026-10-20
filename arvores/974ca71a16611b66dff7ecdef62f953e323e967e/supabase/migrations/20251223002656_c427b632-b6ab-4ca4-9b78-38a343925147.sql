-- Create storage bucket for WhatsApp media files
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for whatsapp-media bucket
CREATE POLICY "Authenticated users can upload media" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'whatsapp-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view whatsapp media" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'whatsapp-media');

CREATE POLICY "Users can delete their own media" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'whatsapp-media' AND auth.uid() IS NOT NULL);