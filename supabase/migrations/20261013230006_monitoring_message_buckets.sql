-- monitoring_message_buckets
-- Rollback: dropa a função nova (não existia antes) e os grants somem com ela.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.get_monitoring_message_buckets(timestamptz, timestamptz, interval);
--
-- R2-INF-028 (item 374): a tela de monitoramento montava os baldes do gráfico no
-- navegador a partir de no máximo 1.000 mensagens (`limit 1000`). Em período
-- movimentado o gráfico perdia as linhas acima de 1.000 — a curva cortava e a
-- soma dos baldes ficava MENOR que o total real. Esta função agrega NO BANCO, por
-- balde de tempo, sem limite de linhas, e devolve uma linha por balde
-- (bucket_start, incoming, outgoing). O balde é ancorado no início da hora cheia /
-- dia civil no fuso America/Sao_Paulo, que é como o gráfico rotula.
--
-- Direção: `incoming` = sender 'contact' (recebida); `outgoing` = qualquer outro
-- sender (enviada) — preserva exatamente a semântica anterior do hook.
--
-- Acesso: só staff (admin/supervisor). Hoje é o mesmo conjunto que a policy SELECT
-- de public.messages já deixava ver TODAS as mensagens (`is_admin_or_supervisor`),
-- então o SECURITY DEFINER não amplia o que o papel já enxergava. anon e service_role
-- são negados no GRANT (não há caminho de serviço para esta leitura de tela);
-- authenticated fora do staff leva 42501 no guard interno.
--
-- Parâmetros:
--   p_from, p_to — janela (timestamptz). p_bucket — tamanho do balde (interval),
--   de '1 minute' a '31 days'; a janela aceita no máximo 5.000 baldes.

create or replace function public.get_monitoring_message_buckets(
  p_from   timestamptz,
  p_to     timestamptz,
  p_bucket interval
)
returns table (bucket_start timestamptz, incoming bigint, outgoing bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_step_s numeric;
  v_start  timestamptz;
begin
  if not coalesce(public.is_admin_or_supervisor(auth.uid()), false) then
    raise exception 'monitoring_staff_required' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_bucket is null then
    raise exception 'monitoring_invalid_window' using errcode = '22023';
  end if;
  if p_bucket < interval '1 minute' or p_bucket > interval '31 days' then
    raise exception 'monitoring_invalid_bucket' using errcode = '22023';
  end if;
  if p_to <= p_from then
    raise exception 'monitoring_invalid_window' using errcode = '22023';
  end if;
  if extract(epoch from (p_to - p_from)) / extract(epoch from p_bucket) > 5000 then
    raise exception 'monitoring_window_too_wide' using errcode = '22023';
  end if;

  v_step_s := extract(epoch from p_bucket);

  -- Ancora no início do balde no fuso de São Paulo (hora cheia / dia civil local).
  -- floor sobre o epoch do relógio-de-parede local; SP é offset fixo -03 (sem DST).
  v_start := (timestamp '1970-01-01 00:00:00'
              + (floor(extract(epoch from (p_from at time zone 'America/Sao_Paulo')) / v_step_s)
                 * v_step_s) * interval '1 second')
             at time zone 'America/Sao_Paulo';

  return query
    with serie as (
      select gs as b_start
      from generate_series(v_start, p_to, p_bucket) as gs
      where gs < p_to
    )
    select
      serie.b_start,
      count(m.id) filter (where m.sender = 'contact')::bigint as incoming,
      count(m.id) filter (where m.sender is distinct from 'contact')::bigint as outgoing
    from serie
    left join public.messages m
      on m.created_at >= greatest(serie.b_start, p_from)
     and m.created_at <  least(serie.b_start + p_bucket, p_to)
    group by serie.b_start
    order by serie.b_start;
end;
$fn$;

revoke all on function public.get_monitoring_message_buckets(timestamptz, timestamptz, interval) from public, anon;
grant execute on function public.get_monitoring_message_buckets(timestamptz, timestamptz, interval) to authenticated;
