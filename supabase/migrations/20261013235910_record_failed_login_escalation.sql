-- record_failed_login_escalation
-- Rollback: recria public.record_failed_login com o corpo ANTERIOR COMPLETO (zerava o contador ao vencer o
-- Rollback (SQL executável, na ordem):
--   create or replace function public.record_failed_login(p_email text, p_ip_address text default null::text, p_user_agent text default null::text) returns table(is_locked boolean, locked_until timestamp with time zone, attempts integer) language plpgsql security definer set search_path to 'public' as $function$ declare v_new_count integer; v_locked_until timestamp with time zone; v_max_attempts constant integer := 5; begin insert into public.login_attempts as la (email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at) values (lower(p_email), p_ip_address, p_user_agent, 1, now(), now()) on conflict (email) do update set attempt_count = case when la.locked_until is not null and la.locked_until > now() then la.attempt_count when la.locked_until is not null and la.locked_until <= now() then 1 else least(la.attempt_count + 1, 10000) end, locked_until = case when la.locked_until is not null and la.locked_until <= now() then null else la.locked_until end, last_attempt_at = now(), ip_address = coalesce(excluded.ip_address, la.ip_address), user_agent = coalesce(excluded.user_agent, la.user_agent), updated_at = now() returning la.attempt_count, la.locked_until into v_new_count, v_locked_until; if v_locked_until is null and v_new_count >= v_max_attempts then v_locked_until := now() + (power(2, least(v_new_count - v_max_attempts, 10))::integer * interval '1 minute'); update public.login_attempts set locked_until = v_locked_until, updated_at = now() where email = lower(p_email); end if; return query select (v_locked_until is not null and v_locked_until > now()), v_locked_until, v_new_count; end; $function$;
--
-- Lockout por tentativas: a V2 regrediu para o comportamento em que o contador ZERA quando o
-- bloqueio vence (`WHEN la.locked_until <= now() THEN 1`), reescrito em
-- 20261003272707_reconcile_local_replay_with_canonical.sql (~1199-1210). Efeito: cada ciclo de
-- 5 falhas trava só 1 minuto (~7.200 tentativas/dia por e-mail) e a escalada exponencial some.
--
-- Esta migration recria a função (CREATE OR REPLACE, mesmo nome/assinatura — não é overload):
--   1. o contador NÃO zera ao vencer o bloqueio: bloqueio vencido segue contando (+1);
--   2. o contador só zera por clear_login_attempts OU depois de >= 60 min sem nenhuma tentativa
--      (last_attempt_at antigo no ramo do ON CONFLICT);
--   3. bloqueio vigente não conta e não estende o prazo (mantém a defesa anti-DoS de 20260905010000);
--   4. escalada 2^(n-5) minutos com TETO de 15 min (o teto evita que o lockout vire DoS contra admin).
--
-- Mantém: assinatura, RETURNS TABLE, SECURITY DEFINER e `SET search_path TO 'public'`. Os grants atuais
-- ({service_role, postgres}) são reafirmados EXPLICITAMENTE no fim do arquivo (idempotente): anon,
-- authenticated e PUBLIC ficam sem EXECUTE; só service_role executa (a Edge usa service_role).

create or replace function public.record_failed_login(
  p_email text,
  p_ip_address text default null::text,
  p_user_agent text default null::text
)
 returns table(is_locked boolean, locked_until timestamp with time zone, attempts integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_new_count    integer;
  v_locked_until timestamp with time zone;
  v_max_attempts constant integer := 5;                       -- falhas antes de travar
  v_reset_after  constant interval := interval '60 minutes';  -- inatividade que zera o contador
  v_max_lock_min constant integer := 15;                      -- teto da escalada (min)
begin
  insert into public.login_attempts as la (
    email, ip_address, user_agent, attempt_count, last_attempt_at, updated_at
  ) values (
    lower(p_email), p_ip_address, p_user_agent, 1, now(), now()
  )
  on conflict (email) do update
    set attempt_count = case
          -- bloqueio vigente: a tentativa é ignorada e NÃO estende o prazo (anti-DoS)
          when la.locked_until is not null and la.locked_until > now()
            then la.attempt_count
          -- >= 60 min sem nenhuma tentativa: histórico expira, recomeça em 1
          when la.last_attempt_at < now() - v_reset_after
            then 1
          -- bloqueio vencido OU tentativa recente: CONTINUA contando (a escalada não regride)
          else least(la.attempt_count + 1, 10000)
        end,
        locked_until = case
          when la.locked_until is not null and la.locked_until <= now()
            then null
          else la.locked_until
        end,
        last_attempt_at = now(),
        ip_address      = coalesce(excluded.ip_address, la.ip_address),
        user_agent      = coalesce(excluded.user_agent, la.user_agent),
        updated_at      = now()
  returning la.attempt_count, la.locked_until
  into v_new_count, v_locked_until;

  if v_locked_until is null and v_new_count >= v_max_attempts then
    v_locked_until := now() + (
      least(power(2, v_new_count - v_max_attempts)::integer, v_max_lock_min) * interval '1 minute'
    );
    update public.login_attempts
    set locked_until = v_locked_until,
        updated_at   = now()
    where email = lower(p_email);
  end if;

  return query select
    (v_locked_until is not null and v_locked_until > now()),
    v_locked_until,
    v_new_count;
end;
$function$;

-- Grants explícitos (idempotente): reafirma a ACL atual — só service_role executa; nada para anon/authenticated/PUBLIC.
revoke all on function public.record_failed_login(text, text, text) from public;
revoke all on function public.record_failed_login(text, text, text) from anon;
revoke all on function public.record_failed_login(text, text, text) from authenticated;
grant execute on function public.record_failed_login(text, text, text) to service_role;
