-- login_gate_rpc
-- Rollback: DROP FUNCTION IF EXISTS public.consume_login_gate(text, text, integer, integer, integer, integer);

-- ============================================================================
-- auth-login fazia QUATRO idas ao banco por tentativa de login: depois da
-- política de rede (resolve_network_policy, que permanece) eram duas
-- consume_rate_limit (IP e e-mail) e uma is_account_locked — e a conta travada
-- só era consultada DEPOIS de consumir os dois contadores.
--
-- Esta RPC consolida as três chamadas seguintes à política numa única ida (e
-- numa única transação): o bloqueio da conta é verificado ANTES de consumir
-- qualquer contador (conta travada não gasta rate limit), o teto de IP não
-- consome o contador de e-mail, e corpo inválido (p_email NULL) contabiliza
-- apenas o IP — preservando a contagem por IP que o handler já fazia antes de
-- ler o corpo.
--
-- Contrato: retorna (allowed, is_locked, locked_until, attempts, remaining).
--   is_locked=true  → chamador responde 423 (contadores intactos);
--   allowed=false   → chamador responde 429;
--   demais          → segue o fluxo (corpo inválido → 400; senão → autentica).
-- Só service_role executa (a edge auth-login é verify_jwt=false).
-- ============================================================================

create or replace function public.consume_login_gate(
  p_email text,
  p_ip text,
  p_ip_max integer,
  p_ip_window_seconds integer,
  p_email_max integer,
  p_email_window_seconds integer
)
returns table (
  allowed boolean,
  is_locked boolean,
  locked_until timestamp with time zone,
  attempts integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_attempts integer;
  v_locked_until timestamp with time zone;
  v_allowed boolean;
  v_remaining integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'consume_login_gate: p_ip obrigatorio' using errcode = '22023';
  end if;
  if p_ip_max is null or p_ip_max < 1 then
    raise exception 'consume_login_gate: p_ip_max invalido' using errcode = '22023';
  end if;
  if p_ip_window_seconds is null or p_ip_window_seconds < 1 then
    raise exception 'consume_login_gate: p_ip_window_seconds invalido' using errcode = '22023';
  end if;
  if p_email is not null and (p_email_max is null or p_email_max < 1) then
    raise exception 'consume_login_gate: p_email_max invalido' using errcode = '22023';
  end if;
  if p_email is not null and (p_email_window_seconds is null or p_email_window_seconds < 1) then
    raise exception 'consume_login_gate: p_email_window_seconds invalido' using errcode = '22023';
  end if;

  -- 1) Bloqueio de conta ANTES de consumir qualquer contador: a conta travada
  --    responde is_locked sem gastar rate limit de IP nem de e-mail.
  if p_email is not null then
    select la.attempt_count, la.locked_until
      into v_attempts, v_locked_until
      from public.login_attempts la
     where la.email = lower(p_email);

    if v_locked_until is not null and v_locked_until > now() then
      return query select false, true, v_locked_until, v_attempts, 0;
      return;
    end if;
  end if;
  v_attempts := coalesce(v_attempts, 0);

  -- 2) Rate limit por IP (sempre consumido, inclusive corpo inválido).
  select c.allowed, c.remaining
    into v_allowed, v_remaining
    from public.consume_rate_limit('auth-login:' || p_ip, p_ip_max, p_ip_window_seconds) c;
  if v_allowed is null then
    raise exception 'consume_login_gate: consume_rate_limit nao retornou linha' using errcode = 'XX000';
  end if;
  if not v_allowed then
    -- Teto de IP estourado: NÃO consome o contador de e-mail.
    return query select false, false, null::timestamp with time zone, v_attempts, v_remaining;
    return;
  end if;

  -- 3) Corpo inválido (p_email NULL): só o IP foi contabilizado.
  if p_email is null then
    return query select true, false, null::timestamp with time zone, 0, v_remaining;
    return;
  end if;

  -- 4) Rate limit por e-mail (conta destravada, IP dentro do teto).
  select c.allowed, c.remaining
    into v_allowed, v_remaining
    from public.consume_rate_limit('auth-login-email:' || lower(p_email), p_email_max, p_email_window_seconds) c;
  if v_allowed is null then
    raise exception 'consume_login_gate: consume_rate_limit nao retornou linha' using errcode = 'XX000';
  end if;

  return query select v_allowed, false, null::timestamp with time zone, v_attempts, v_remaining;
end;
$function$;

revoke all on function public.consume_login_gate(text, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_login_gate(text, text, integer, integer, integer, integer) to service_role;

comment on function public.consume_login_gate(text, text, integer, integer, integer, integer) is
  'auth-login: consolida numa transação o bloqueio de conta (antes de consumir contadores), o rate limit por IP (sempre) e o rate limit por e-mail (só com p_email válido e IP dentro do teto). Só service_role executa.';
