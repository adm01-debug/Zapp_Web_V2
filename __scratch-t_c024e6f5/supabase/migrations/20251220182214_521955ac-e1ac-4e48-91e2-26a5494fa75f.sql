-- Create tags table for contact labels/tags
CREATE TABLE public.tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  description TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(name)
);

-- Create contact_tags junction table for many-to-many relationship
CREATE TABLE public.contact_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(contact_id, tag_id)
);

-- Enable RLS
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

-- Policies for tags
CREATE POLICY "Authenticated users can view tags"
ON public.tags FOR SELECT
USING (true);

CREATE POLICY "Admins can manage tags"
ON public.tags FOR ALL
USING (is_admin_or_supervisor(auth.uid()));

CREATE POLICY "Users can insert tags"
ON public.tags FOR INSERT
WITH CHECK (true);

-- Policies for contact_tags
CREATE POLICY "Authenticated users can view contact tags"
ON public.contact_tags FOR SELECT
USING (true);

CREATE POLICY "Users can manage contact tags"
ON public.contact_tags FOR ALL
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();