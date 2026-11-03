CREATE OR REPLACE FUNCTION public.reassign_absent_agents(inactive_minutes integer DEFAULT 30) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS BODY_PLACEHOLDER
