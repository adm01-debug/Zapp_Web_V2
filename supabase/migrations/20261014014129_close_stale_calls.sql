-- close_stale_calls
-- Rollback: desagenda o job 'close-stale-calls' (se pg_cron existir) e dropa a funcao.
-- Rollback (SQL executavel, na ordem):
--   do $$ begin if exists (select 1 from pg_extension where extname = 'pg_cron') then perform cron.unschedule(jobid) from cron.job where jobname = 'close-stale-calls'; end if; end $$;
--   drop function if exists public.close_stale_calls();
--
-- Telefonia: chamadas que entravam em 'ringing' ou 'answered' e nunca recebiam o
-- evento de fim ficavam para sempre "em andamento", distorcendo a tela de
-- Telefonia e os KPIs (CallHistoryTable trata 'ringing' como em andamento).
-- Esta migration cria o varredor `close_stale_calls()` e o job pg_cron que o
-- dispara a cada 5 min. Só ADITIVO: nenhuma coluna, tabela, policy ou dado
-- existente é alterado — a função só toca linhas presas (ended_at is null).
--
-- Permissão: a rotina é de manutenção (roda pelo job). EXECUTE é negado a
-- PUBLIC, anon e authenticated; só service_role (o job/dono) executa.
-- Sem PII em log: a função devolve apenas a contagem de linhas fechadas.

create or replace function public.close_stale_calls()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

comment on function public.close_stale_calls() is
  'Varredor de telefonia: fecha chamadas presas em ringing (>2 min) e answered (>4 h). Devolve quantas linhas fechou.';

-- Negar por padrão: função de manutenção, executada só pelo job (service_role).
revoke all on function public.close_stale_calls() from public, anon, authenticated;
grant execute on function public.close_stale_calls() to service_role;

-- Agendamento: só quando pg_cron estiver instalado (local e produção têm o
-- extension). Idempotente: desagenda o job homônimo antes de recriar.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid)
      from cron.job
     where jobname = 'close-stale-calls';
    perform cron.schedule(
      'close-stale-calls',
      '*/5 * * * *',
      'select public.close_stale_calls()'
    );
  end if;
end $$;
