CREATE OR REPLACE FUNCTION public.ai_sentiment_summary(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dias         integer;
  v_fim          timestamptz := now();
  v_hoje         date;
  v_ini_dia      date;
  v_inicio       timestamptz;
  v_ant_ini      timestamptz;
  v_atual        jsonb;
  v_anterior     jsonb;
  v_serie        jsonb;
  v_transcricoes integer := 0;
  v_transc_ant   integer := 0;
begin
  -- Fail-closed: sem papel de staff a função não responde nada além do erro.
  -- Não revela se há ou não dados (mesma resposta para qualquer agente).
  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'ai_sentiment_summary requires admin or supervisor'
      using errcode = '42501';
  end if;

  -- Entrada inválida é normalizada (1..366 dias), nunca gera janela absurda.
  v_dias := least(greatest(coalesce(p_days, 30), 1), 366);

  v_hoje    := (v_fim at time zone 'America/Sao_Paulo')::date;
  v_ini_dia := v_hoje - (v_dias - 1);
  v_inicio  := (v_ini_dia::timestamp at time zone 'America/Sao_Paulo');
  v_ant_ini := ((v_ini_dia - v_dias)::timestamp at time zone 'America/Sao_Paulo');

  -- Agregado da janela atual. `count(*)` conta tudo; `avg` ignora NULL.
  select jsonb_build_object(
           'total',     count(*),
           'positivos', count(*) filter (where a.sentiment = 'positivo'),
           'neutros',   count(*) filter (where a.sentiment = 'neutro'),
           'negativos', count(*) filter (where a.sentiment in ('negativo', 'critico')),
           'media',     round(avg(a.sentiment_score)::numeric, 2)
         )
    into v_atual
  from public.conversation_analyses a
  where a.created_at >= v_inicio and a.created_at < v_fim;

  -- Agregado da janela anterior (mesma forma).
  select jsonb_build_object(
           'total',     count(*),
           'positivos', count(*) filter (where a.sentiment = 'positivo'),
           'neutros',   count(*) filter (where a.sentiment = 'neutro'),
           'negativos', count(*) filter (where a.sentiment in ('negativo', 'critico')),
           'media',     round(avg(a.sentiment_score)::numeric, 2)
         )
    into v_anterior
  from public.conversation_analyses a
  where a.created_at >= v_ant_ini and a.created_at < v_inicio;

  -- Período anterior vazio => NULL, não objeto zerado.
  if (v_anterior->>'total')::integer = 0 then
    v_anterior := null;
  end if;

  -- Transcrições (o outro "total" do cartão), na janela atual.
  select count(*)
    into v_transcricoes
  from public.messages m
  where m.transcription is not null
    and m.created_at >= v_inicio and m.created_at < v_fim;

  -- Transcrições da janela anterior, anexadas ao objeto `anterior` (que só
  -- existe quando há análises no bloco — coerente com o restante do agregado).
  if v_anterior is not null then
    select count(*)
      into v_transc_ant
    from public.messages m
    where m.transcription is not null
      and m.created_at >= v_ant_ini and m.created_at < v_inicio;
    v_anterior := v_anterior || jsonb_build_object('transcricoes', v_transc_ant);
  end if;

  -- Série diária: exatamente v_dias baldes (um por dia, inclusive os vazios),
  -- no fuso America/Sao_Paulo, para o gráfico não pular dias sem análise.
  select jsonb_agg(
           jsonb_build_object(
             'dia',       to_char(g.dia, 'YYYY-MM-DD'),
             'total',     s.total,
             'positivos', s.positivos,
             'neutros',   s.neutros,
             'negativos', s.negativos,
             'media',     s.media
           ) order by g.dia
         )
    into v_serie
  from generate_series(v_ini_dia, v_hoje, interval '1 day') as g(dia)
  left join lateral (
    select count(*) as total,
           count(*) filter (where a.sentiment = 'positivo') as positivos,
           count(*) filter (where a.sentiment = 'neutro') as neutros,
           count(*) filter (where a.sentiment in ('negativo', 'critico')) as negativos,
           round(avg(a.sentiment_score)::numeric, 2) as media
      from public.conversation_analyses a
     where a.created_at >= v_inicio and a.created_at < v_fim
       and (a.created_at at time zone 'America/Sao_Paulo')::date = g.dia::date
  ) as s on true;

  return jsonb_build_object(
    'periodo_dias',  v_dias,
    'inicio',        v_inicio,
    'fim',           v_fim,
    'total',         v_atual->'total',
    'positivos',     v_atual->'positivos',
    'neutros',       v_atual->'neutros',
    'negativos',     v_atual->'negativos',
    'media',         v_atual->'media',
    'transcricoes',  v_transcricoes,
    'serie_diaria',  v_serie,
    'anterior',      v_anterior
  );
end;
$function$
