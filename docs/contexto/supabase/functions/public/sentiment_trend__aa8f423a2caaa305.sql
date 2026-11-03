CREATE OR REPLACE FUNCTION public.sentiment_trend(p_days integer DEFAULT 30)
 RETURNS TABLE(dia date, total integer, positivos integer, neutros integer, negativos integer, media numeric, indice numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dias    integer;
  v_hoje    date;
  v_ini_dia date;
  v_inicio  timestamptz;
  v_fim     timestamptz;
begin
  if p_days is null or p_days < 1 or p_days > 366 then
    raise exception 'sentiment_trend: p_days deve estar entre 1 e 366 (recebido: %)', p_days
      using errcode = '22023';
  end if;

  v_dias    := p_days;
  v_hoje    := (now() at time zone 'America/Sao_Paulo')::date;
  v_ini_dia := v_hoje - (v_dias - 1);
  v_inicio  := (v_ini_dia::timestamp at time zone 'America/Sao_Paulo');
  v_fim     := ((v_hoje + 1)::timestamp at time zone 'America/Sao_Paulo');

  return query
  with agregado as (
    select date_trunc('day', a.created_at at time zone 'America/Sao_Paulo')::date as dia,
           count(*)::integer as total,
           count(*) filter (where a.sentiment = 'positivo')::integer as positivos,
           count(*) filter (where a.sentiment = 'neutro')::integer as neutros,
           count(*) filter (where a.sentiment in ('negativo', 'critico'))::integer as negativos,
           round(avg(a.sentiment_score)::numeric, 2) as media
      from public.conversation_analyses a
     where a.created_at >= v_inicio
       and a.created_at <  v_fim
     group by 1
  )
  select g.dia::date,
         coalesce(ag.total, 0),
         coalesce(ag.positivos, 0),
         coalesce(ag.neutros, 0),
         coalesce(ag.negativos, 0),
         ag.media,
         round((coalesce(ag.positivos, 0) - coalesce(ag.negativos, 0))::numeric
               / nullif(ag.total, 0), 4) as indice
    from generate_series(v_ini_dia, v_hoje, interval '1 day') as g(dia)
    left join agregado ag on ag.dia = g.dia::date
   order by g.dia;
end;
$function$
