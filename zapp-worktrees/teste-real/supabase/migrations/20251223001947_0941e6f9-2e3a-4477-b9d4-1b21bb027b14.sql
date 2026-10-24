-- Add contact_type column to contacts table for categorization
ALTER TABLE public.contacts 
ADD COLUMN IF NOT EXISTS contact_type text DEFAULT 'cliente';

-- Add comment for documentation
COMMENT ON COLUMN public.contacts.contact_type IS 'Type of contact: cliente, fornecedor, colaborador, prestador_servico';

-- Create index for faster filtering by type
CREATE INDEX IF NOT EXISTS idx_contacts_type ON public.contacts(contact_type);