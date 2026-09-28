CREATE OR REPLACE FUNCTION public.conversation_closure_day(p_created_at timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$ SELECT (p_created_at AT TIME ZONE 'America/Sao_Paulo')::date $$;

DELETE FROM public.conversation_closures a USING public.conversation_closures b WHERE a.contact_id = b.contact_id AND public.conversation_closure_day(a.created_at) = public.conversation_closure_day(b.created_at) AND a.created_at > b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS conversation_closures_contact_day_uidx ON public.conversation_closures (contact_id, public.conversation_closure_day(created_at));