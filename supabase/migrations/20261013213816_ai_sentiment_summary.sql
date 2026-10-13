-- ai_sentiment_summary
-- Rollback: drop function if exists public.ai_sentiment_summary(integer);
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.ai_sentiment_summary(integer);
--
-- IA-DB-002 — o resumo de sentimento do widget de IA (PF-10) era montado no
-- navegador: useAIStats baixava as linhas cruas de conversation_analyses,
-- messages e audit_logs e somava tudo no cliente. Duas consequências medidas:
--   (a) o total exibido nunca passava dos 1000/limite de linhas do PostgREST —
--       uma janela com mais de 1000 análises devolvia um número truncado;
--   (b) a média do período anterior era recalculada sobre as mesmas linhas
--       achatadas, então "período anterior vazio" virava divisão por zero.
-- Esta migration move o cálculo para o servidor, numa única RPC, e devolve o
-- agregado real (sem truncar), as classes de sentimento, a série diária e o
-- mesmo agregado do bloco de dias imediatamente anterior.
--
-- Contrato (leia antes de consumir no front):
--   * STAFF-ONLY. Só admin/supervisor executam; agente comum, anon e
--     service_role recebem erro 42501 (fail-closed, sem oráculo).
--   * A janela é de `p_days` DIAS DE CALENDÁRIO em America/Sao_Paulo,
--     INCLUINDO o dia de hoje (ex.: p_days=7 => os 7 dias terminando hoje).
--     O período anterior são os `p_days` dias de calendário imediatamente
--     antes dessa janela.
--   * `sentiment` é o vocabulário canônico (positivo|neutro|negativo|critico,
--     garantido por ai_is_canonical_sentiment em conversation_analyses).
--     `critico` conta como NEGATIVO (regra IA-SENTIMENT-001) — é o extremo
--     da escala, nunca neutro. Valor desconhecido/ausente não vira classe.
--   * `media` só existe quando há ao menos uma nota (`sentiment_score`) no
--     bloco; sem amostra válida volta NULL (nunca 0/50 inventado). O `total`
--     conta TODAS as análises, inclusive as sem nota.
--   * `anterior` volta NULL (não um objeto zerado) quando o período anterior
--     não tem nenhuma análise — o consumidor lê "sem base de comparação", não
--     queda de 100%.

create or replace function public.ai_sentiment_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
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
$fn$;

comment on function public.ai_sentiment_summary(integer) is
  'Agregado de sentimento do widget IA (IA-DB-002): staff-only, janela de p_days dias em America/Sao_Paulo + mesmo bloco anterior.';

-- Fail-closed: nasce fechada. Só authenticated (staff checado dentro) executa.
revoke all on function public.ai_sentiment_summary(integer) from public, anon, service_role;
grant execute on function public.ai_sentiment_summary(integer) to authenticated;
