CREATE OR REPLACE FUNCTION public.guard_contact_purchase_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_profile uuid;
begin
  -- Caminho servidor (service_role, cron, psql do dono): sem JWT não há autor a
  -- impor nem a comparar — o registro de sistema segue gravando como sempre.
  if v_uid is null then
    return new;
  end if;

  v_profile := public.get_profile_id_for_user(v_uid);

  if tg_op = 'INSERT' then
    if new.created_by is null then
      if v_profile is null then
        raise exception 'purchase author cannot be resolved for the current user'
          using errcode = '42501';
      end if;
      new.created_by := v_profile;
    elsif v_profile is null or new.created_by is distinct from v_profile then
      raise exception 'purchase cannot be registered on behalf of another user'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- UPDATE direto de uma linha: identidade do registro é imutável.
  if new.contact_id is distinct from old.contact_id then
    raise exception 'purchase contact is immutable'
      using errcode = '23514';
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'purchase author is immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$function$
