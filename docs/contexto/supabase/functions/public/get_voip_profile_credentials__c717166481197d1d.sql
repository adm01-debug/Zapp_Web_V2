CREATE OR REPLACE FUNCTION public.get_voip_profile_credentials(p_profile_id uuid)
 RETURNS TABLE(ramal text, sip_password text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_secret_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  if p_profile_id is null then
    raise exception 'invalid_profile_id' using errcode = '22023';
  end if;

  select c.vault_secret_id into v_secret_id
  from public.voip_profile_credentials c
  where c.profile_id = p_profile_id;

  -- mesma resposta (zero linhas) para perfil sem credencial e para perfil inexistente.
  if v_secret_id is null then
    return;
  end if;

  return query
    select c.ramal, d.decrypted_secret
    from public.voip_profile_credentials c
    join vault.decrypted_secrets d on d.id = c.vault_secret_id
    where c.profile_id = p_profile_id;
end;
$function$
