CREATE OR REPLACE FUNCTION public.purge_qr_attempts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_retencao constant interval := interval '30 days';
  v_apagadas integer := 0;
begin
  delete from public.qr_attempts
   where created_at < now() - c_retencao;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$function$
