CREATE OR REPLACE FUNCTION public.consume_gmail_oauth_state(p_user_id uuid, p_state text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id uuid;
begin
  -- Guarda de identidade (mesmo padrão de catalog_rate_limit_hit): quem chama
  -- com JWT de usuário só pode consumir o PRÓPRIO state; o service_role
  -- (auth.uid() nulo) consome o de quem a edge autenticou.
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return false;
  end if;

  -- Limpeza oportunista: tentativas expiradas não se acumulam.
  delete from public.gmail_oauth_states where expires_at <= now();

  update public.gmail_oauth_states
     set consumed_at = now()
   where user_id = p_user_id
     and state = p_state
     and consumed_at is null
     and expires_at > now()
  returning id into v_id;

  return v_id is not null;
end;
$function$
