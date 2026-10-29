-- sentiment_trend_rpc
-- Rollback: drop function if exists public.sentiment_trend(integer);
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.sentiment_trend(integer);
--
-- HZ2-003 (doc 26, hooks raiz S-Z) — a tendência de sentimento do Dashboard era
-- montada no navegador: `useRealSentimentData` (components/dashboard/SentimentHelpers.tsx)
-- fazia `.select('created_at, sentiment, sentiment_score')` SEM `range`/limite e
-- `.order('created_at')` ASCENDENTE. O PostgREST corta a resposta em 1000 linhas por
-- padrão, então a janela de 30 dias parava nas 1000 análises MAIS ANTIGAS: os dias
-- recentes simplesmente não existiam no gráfico ("perde os dias mais novos").
--
-- Esta migration move o agregado para o servidor. A RPC devolve UMA LINHA POR DIA
-- de calendário (inclusive dias sem análise), no fuso do app, sem corte de linhas.
--
-- Contrato (leia antes de consumir no front):
--   * SECURITY INVOKER — roda com o papel do chamador e a RLS de
--     conversation_analyses continua valendo: agente só soma as análises dos
--     contatos que ele vê; admin/supervisor somam tudo. NÃO é staff-only e NÃO
--     enxerga além do que o chamador enxerga.
--   * `p_days` é o número de dias de CALENDÁRIO em America/Sao_Paulo, INCLUINDO
--     hoje (ex.: 30 => os 30 dias terminando hoje). Entrada inválida (nulo, <1
--     ou >366) é RECUSADA com 22023 — não existe janela silenciosamente cortada.
--   * Saída por dia: `total` (todas as análises, inclusive as sem nota),
--     `positivos`/`neutros`/`negativos` (contagem canônica; `critico` conta como
--     NEGATIVO — regra IA-SENTIMENT-001 —, valor desconhecido não entra em balde
--     nenhum, por isso a soma dos baldes pode ser menor que `total`),
--     `media` = média REAL de `sentiment_score` (0..100, 2 casas) e `indice` =
--     (positivos - negativos)/total em [-1,1] (4 casas). `media` e `indice` são
--     NULL no dia sem amostra — nunca 0 nem 50 inventados.
--   * O gráfico converte `indice` para a escala 0..100 com `(indice + 1) * 50`.
--
-- Segue a mesma forma de `ai_sentiment_summary` (t_e3c75d53), que é a RPC do
-- painel de estatísticas de IA: LÁ o agregado é staff-only (SECURITY DEFINER),
-- com período anterior; AQUI a série precisa seguir a RLS de quem pediu, porque o
-- gráfico de tendência também é visto por agente. Mesma tabela, contratos e
-- consumidores diferentes — sem duplicação.

create or replace function public.sentiment_trend(p_days integer default 30)
returns table (
  dia       date,
  total     integer,
  positivos integer,
  neutros   integer,
  negativos integer,
  media     numeric,
  indice    numeric
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $fn$
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
$fn$;

comment on function public.sentiment_trend(integer) is
  'Serie diaria de sentimento para o Dashboard (HZ2-003): p_days dias de calendario em America/Sao_Paulo, incluindo hoje, contagem canonica por classe, media real de sentiment_score e indice (pos-neg)/total em [-1,1]; respeita a RLS do chamador (SECURITY INVOKER).';

-- Funcao nasce com EXECUTE para PUBLIC: fecha tudo e abre so para o front.
revoke all on function public.sentiment_trend(integer) from public;
revoke all on function public.sentiment_trend(integer) from anon;
revoke all on function public.sentiment_trend(integer) from service_role;
grant execute on function public.sentiment_trend(integer) to authenticated;
