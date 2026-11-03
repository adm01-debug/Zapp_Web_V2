CREATE OR REPLACE FUNCTION public.set_voip_profile_credentials(p_profile_id uuid, p_ramal text, p_sip_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_secret_id uuid;
  v_cred_id   uuid;
begin
  -- Autorização: a Edge (service_role) ou um admin/supervisor autenticado.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or public.is_admin_or_supervisor(auth.uid())
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Valida TUDO antes de tocar qualquer coisa (fail = nada aplicado).
  if p_profile_id is null then
    raise exception 'invalid_profile_id' using errcode = '22023';
  end if;
  if p_ramal is null or p_ramal !~ '^[0-9A-Za-z][0-9A-Za-z._@+-]{0,63}$' then
    raise exception 'invalid_ramal' using errcode = '22023';
  end if;
  if p_sip_password is null or char_length(p_sip_password) not between 1 and 256 then
    raise exception 'invalid_sip_password' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_profile_id) then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.voip_profile_credentials c
    where lower(c.ramal) = lower(p_ramal) and c.profile_id <> p_profile_id
  ) then
    raise exception 'ramal_em_uso' using errcode = '22023';
  end if;

  -- Serializa provisionamentos do MESMO perfil (corrida não gera dois segredos órfãos).
  perform pg_advisory_xact_lock(
    hashtextextended('voip_profile_credentials:' || p_profile_id::text, 0)
  );

  select c.vault_secret_id into v_secret_id
  from public.voip_profile_credentials c
  where c.profile_id = p_profile_id
  for update;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(
      p_sip_password,
      'voip_sip_password:' || p_profile_id::text
    );
  else
    perform vault.update_secret(v_secret_id, p_sip_password);
  end if;

  insert into public.voip_profile_credentials as c (profile_id, ramal, vault_secret_id)
  values (p_profile_id, p_ramal, v_secret_id)
  on conflict (profile_id) do update
    set ramal           = excluded.ramal,
        vault_secret_id = excluded.vault_secret_id,
        updated_at      = now()
  returning c.id into v_cred_id;

  return v_cred_id;
end;
$function$
