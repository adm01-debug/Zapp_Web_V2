CREATE OR REPLACE FUNCTION public.e2e_cleanup_conversation_closures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_contato constant uuid := '04dff4dc-c6b1-4283-ac22-bd8639804759';
  v_usuario constant uuid := 'aaa9b766-3b72-403d-95ad-f9cd7301ebca';
  v_apagadas integer;
begin
  if auth.uid() is distinct from v_usuario then
    raise exception 'e2e_cleanup_conversation_closures: chamador nao e o usuario de teste do E2E'
      using errcode = '42501';
  end if;

  delete from public.conversation_closures where contact_id = v_contato;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$function$
