-- Create whatsapp_groups table
CREATE TABLE public.whatsapp_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  whatsapp_connection_id uuid REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  group_id text NOT NULL,
  name text NOT NULL,
  description text,
  participant_count integer DEFAULT 0,
  avatar_url text,
  is_admin boolean DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Authenticated users can view groups"
ON public.whatsapp_groups FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert groups"
ON public.whatsapp_groups FOR INSERT
WITH CHECK (true);

CREATE POLICY "Authenticated users can update groups"
ON public.whatsapp_groups FOR UPDATE
USING (true);

CREATE POLICY "Authenticated users can delete groups"
ON public.whatsapp_groups FOR DELETE
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_groups_updated_at
BEFORE UPDATE ON public.whatsapp_groups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();