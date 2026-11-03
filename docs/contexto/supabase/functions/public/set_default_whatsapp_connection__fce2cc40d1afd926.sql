CREATE OR REPLACE FUNCTION public.set_default_whatsapp_connection(p_connection_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
  v_padroes integer;
begin
  if p_connection_id is null then
    raise exception 'set_default_whatsapp_connection: p_connection_id obrigatorio'
      using errcode = '22004';
  end if;

  perform pg_advisory_xact_lock(841723199);

  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'set_default_whatsapp_connection: conexao inexistente ou sem permissao'
      using errcode = 'P0002';
  end if;

  select c.id into v_id
    from public.whatsapp_connections c
   where c.id = p_connection_id
   for update;

  if v_id is null then
    raise exception 'set_default_whatsapp_connection: conexao inexistente ou sem permissao'
      using errcode = 'P0002';
  end if;

  update public.whatsapp_connections
     set is_default = false
   where is_default is true
     and id <> p_connection_id;

  update public.whatsapp_connections
     set is_default = true
   where id = p_connection_id
     and is_default is not true;

  select count(*) into v_padroes
    from public.whatsapp_connections
   where is_default is true;

  if v_padroes <> 1 then
    raise exception 'set_default_whatsapp_connection: estado inconsistente (% padroes)', v_padroes
      using errcode = '23514';
  end if;

  return p_connection_id;
end;
$function$
