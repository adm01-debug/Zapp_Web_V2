CREATE OR REPLACE FUNCTION public.trigger_ai_jobs_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_anon_key    text;
  v_cron_secret text;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  select decrypted_secret into v_anon_key
    from vault.decrypted_secrets where name = 'zapp_anon_key' limit 1;
  select decrypted_secret into v_cron_secret
    from vault.decrypted_secrets where name = 'ai_jobs_cron_secret' limit 1;

  if v_anon_key is null or v_cron_secret is null then
    return;  -- sem credencial configurada não há como invocar a edge
  end if;

  perform net.http_post(
    url := 'https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/ai-jobs-worker',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-cron-secret', v_cron_secret
    ),
    timeout_milliseconds := 30000
  );
end;
$function$
