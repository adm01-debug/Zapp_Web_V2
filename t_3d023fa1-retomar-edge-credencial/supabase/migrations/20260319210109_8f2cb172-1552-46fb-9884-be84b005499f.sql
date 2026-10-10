
-- Tabela de mapeamento entre contatos Sicoob Gifts e Zapp Web
CREATE TABLE public.sicoob_contact_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE NOT NULL,
  sicoob_user_id text NOT NULL,
  sicoob_vendedor_id text NOT NULL,
  sicoob_singular_id text NOT NULL,
  zappweb_agent_id uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(sicoob_user_id, sicoob_singular_id)
);

-- RLS
ALTER TABLE public.sicoob_contact_mapping ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read mappings
CREATE POLICY "Authenticated users can read sicoob mappings"
ON public.sicoob_contact_mapping
FOR SELECT TO authenticated
USING (true);

-- Authenticated users can insert mappings
CREATE POLICY "Authenticated users can insert sicoob mappings"
ON public.sicoob_contact_mapping
FOR INSERT TO authenticated
WITH CHECK (true);

-- Service role (edge functions) can do everything via anon with auth header
CREATE POLICY "Service can manage sicoob mappings"
ON public.sicoob_contact_mapping
FOR ALL TO anon
USING (true)
WITH CHECK (true);
