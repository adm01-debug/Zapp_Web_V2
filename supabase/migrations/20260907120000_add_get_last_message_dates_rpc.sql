-- RPC: get_last_message_dates
-- Retorna a data da última mensagem (MAX created_at) por contact_id.
-- Substitui a query direta em messages sem GROUP BY que estava sujeita ao
-- limite de 1000 linhas do PostgREST quando há contatos com histórico longo.
-- SECURITY DEFINER: executa como owner do schema; o filtro de visibilidade
-- de contatos é responsabilidade do caller (já aplicado no hook useContactsSearch).
CREATE OR REPLACE FUNCTION public.get_last_message_dates(contact_ids uuid[])
RETURNS TABLE(contact_id uuid, last_message_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.contact_id,
    MAX(m.created_at) AS last_message_at
  FROM public.messages m
  WHERE m.contact_id = ANY(contact_ids)
  GROUP BY m.contact_id;
$$;
