-- Add category column to whatsapp_groups
ALTER TABLE public.whatsapp_groups 
ADD COLUMN IF NOT EXISTS category text DEFAULT NULL;

-- Create an index for filtering by category
CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_category ON public.whatsapp_groups(category);

-- Also add category to contacts table for groups that appear as contacts
-- This allows filtering in the inbox by group category
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS group_category text DEFAULT NULL;
