CREATE OR REPLACE FUNCTION public.close_stale_calls()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- 'ringing' sem fim há mais de 2 min: nunca completou o toque.
  c_ringing_timeout constant interval := interval '2 minutes';
  -- 'answered' sem fim há mais de 4 h: ligação presa, sem evento de término.
  c_answered_timeout constant interval := interval '4 hours';
  -- Teto de duração para a ligação presa em 'answered': não há evento de fim,
  -- então talk_seconds é estimado por answered_at mas limitado a 4 h (14400 s).
  c_max_talk_seconds constant integer := 14400;
  v_ringing integer := 0;
  v_answered integer := 0;
begin
  -- 1) 'ringing' antigo: inbound nunca atendido vira 'missed'; o restante 'ended'.
  --    end_reason='timeout' marca que o fim veio do varredor, não do provedor.
  update public.calls
     set status      = case when direction = 'inbound' then 'missed' else 'ended' end,
         end_reason  = 'timeout',
         ended_at    = now()
   where status = 'ringing'
     and ended_at is null
     and started_at < now() - c_ringing_timeout;
  get diagnostics v_ringing = row_count;

  -- 2) 'answered' preso: termina como 'ended'/'failed' com talk_seconds limitado.
  update public.calls
     set status        = 'ended',
         end_reason    = 'failed',
         ended_at      = now(),
         talk_seconds  = least(
                           c_max_talk_seconds,
                           greatest(0, extract(epoch from (now() - answered_at))::int)
                         )
   where status = 'answered'
     and ended_at is null
     and answered_at is not null
     and answered_at < now() - c_answered_timeout;
  get diagnostics v_answered = row_count;

  return v_ringing + v_answered;
end;
$function$
