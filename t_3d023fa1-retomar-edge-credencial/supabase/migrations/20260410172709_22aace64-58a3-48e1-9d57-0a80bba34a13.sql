-- Add department column to conversation_analyses
ALTER TABLE public.conversation_analyses 
ADD COLUMN IF NOT EXISTS department text DEFAULT 'outros';

-- Add relationship_type column
ALTER TABLE public.conversation_analyses 
ADD COLUMN IF NOT EXISTS relationship_type text;

-- Add index for department filtering
CREATE INDEX IF NOT EXISTS idx_conversation_analyses_department 
ON public.conversation_analyses(department);

-- Add composite index for contact + department queries
CREATE INDEX IF NOT EXISTS idx_conversation_analyses_contact_department 
ON public.conversation_analyses(contact_id, department);