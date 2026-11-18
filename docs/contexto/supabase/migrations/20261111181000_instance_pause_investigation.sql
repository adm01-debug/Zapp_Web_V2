ALTER TABLE public.instance_pauses ADD COLUMN IF NOT EXISTS investigated_at timestamptz, ADD COLUMN IF NOT EXISTS investigated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL, ADD COLUMN IF NOT EXISTS investigation_notes text

ALTER TABLE public.instance_pauses ADD CONSTRAINT instance_pauses_investigacao_completa CHECK (investigated_by IS NULL OR investigated_at IS NOT NULL)

ALTER TABLE public.instance_pauses ADD CONSTRAINT instance_pauses_notas_tamanho CHECK (investigation_notes IS NULL OR char_length(investigation_notes) <= 1000)

ALTER TABLE public.instance_pauses ADD CONSTRAINT instance_pauses_notas_sem_html CHECK (investigation_notes IS NULL OR investigation_notes !~ chr(60) || chr(62))

CREATE OR REPLACE FUNCTION public.mark_pause_investigated(p_pause_id uuid, p_notes text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$ ... $fn$

REVOKE ALL ON FUNCTION public.mark_pause_investigated(uuid, text) FROM PUBLIC

GRANT EXECUTE ON FUNCTION public.mark_pause_investigated(uuid, text) TO authenticated
