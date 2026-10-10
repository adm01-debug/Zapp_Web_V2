
-- 1. Custom Contact Fields table
CREATE TABLE public.contact_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_value TEXT,
  field_type TEXT NOT NULL DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX idx_contact_custom_fields_contact ON public.contact_custom_fields(contact_id);
CREATE UNIQUE INDEX idx_contact_custom_fields_unique ON public.contact_custom_fields(contact_id, field_name);

-- RLS
ALTER TABLE public.contact_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view custom fields"
ON public.contact_custom_fields FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert custom fields"
ON public.contact_custom_fields FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated can update custom fields"
ON public.contact_custom_fields FOR UPDATE TO authenticated
USING (true);

CREATE POLICY "Authenticated can delete custom fields"
ON public.contact_custom_fields FOR DELETE TO authenticated
USING (true);

-- 2. Farewell message column on whatsapp_connections
ALTER TABLE public.whatsapp_connections 
ADD COLUMN IF NOT EXISTS farewell_message TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS farewell_enabled BOOLEAN DEFAULT false;

-- 3. Updated_at trigger for custom fields
CREATE TRIGGER update_contact_custom_fields_updated_at
  BEFORE UPDATE ON public.contact_custom_fields
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
