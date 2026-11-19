CREATE OR REPLACE FUNCTION public.ai_usage_summary(p_since timestamp with time zone, p_until timestamp with time zone DEFAULT NULL::timestamp with time zone, p_bucket_seconds integer DEFAULT 3600, p_top_functions integer DEFAULT 50, p_top_users integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with parametros as (
  select
    p_since as inicio,
    coalesce(p_until, now()) as fim,
    greatest(coalesce(p_bucket_seconds, 3600), 1) as balde,
    greatest(coalesce(p_top_functions, 50), 1) as limite_funcoes,
    greatest(coalesce(p_top_users, 20), 1) as limite_usuarios
),
janela as (
  select l.*
  from public.ai_usage_logs l, parametros p
  where l.created_at >= p.inicio
    and l.created_at < p.fim
),
resumo as (
  select
    count(*) as chamadas,
    count(*) filter (where j.status = 'error') as erros,
    count(distinct j.user_id) as usuarios,
    count(*) filter (where j.total_tokens is null) as sem_tokens,
    coalesce(sum(j.total_tokens), 0) as tokens,
    coalesce(sum(j.input_tokens), 0) as tokens_entrada,
    coalesce(sum(j.output_tokens), 0) as tokens_saida,
    count(*) filter (where j.duration_ms is not null) as amostra_duracao,
    round(avg(j.duration_ms))::bigint as duracao_media_ms,
    round((percentile_cont(0.95) within group (order by j.duration_ms))::numeric)::bigint as duracao_p95_ms,
    min(j.created_at) as primeiro_registro,
    max(j.created_at) as ultimo_registro
  from janela j
),
lista_funcoes as (
  select coalesce(jsonb_agg(x order by x.chamadas desc, x.funcao), '[]'::jsonb) as lista
  from (
    select j.function_name as funcao,
           count(*) as chamadas,
           coalesce(sum(j.total_tokens), 0) as tokens,
           count(*) filter (where j.status = 'error') as erros,
           count(*) filter (where j.total_tokens is null) as sem_tokens
    from janela j
    group by 1
    order by count(*) desc, j.function_name
    limit (select limite_funcoes from parametros)
  ) x
),
lista_usuarios as (
  select coalesce(jsonb_agg(z order by z.tokens desc, z.usuario), '[]'::jsonb) as lista
  from (
    select coalesce(j.user_id::text, 'sem-usuario') as usuario,
           count(*) as chamadas,
           coalesce(sum(j.total_tokens), 0) as tokens
    from janela j
    group by 1
    order by sum(j.total_tokens) desc nulls last, 1
    limit (select limite_usuarios from parametros)
  ) z
),
serie_balde as (
  select date_bin(make_interval(secs => p.balde), j.created_at, p.inicio) as inicio,
         j.function_name as funcao,
         count(*) as chamadas,
         coalesce(sum(j.total_tokens), 0) as tokens,
         count(*) filter (where j.status = 'error') as erros
  from janela j, parametros p
  group by 1, 2
),
serie as (
  -- A série mantém a quebra por função: o painel desenha uma área empilhada por
  -- função, e uma série só com o total global mudaria o significado do gráfico
  -- sem que ninguém pedisse.
  select coalesce(jsonb_agg(s order by s.inicio), '[]'::jsonb) as lista
  from (
    select sb.inicio,
           sum(sb.chamadas)::bigint as chamadas,
           sum(sb.tokens)::bigint as tokens,
           sum(sb.erros)::bigint as erros,
           jsonb_object_agg(sb.funcao, sb.chamadas) as por_funcao
    from serie_balde sb
    group by sb.inicio
  ) s
),
situacoes as (
  select coalesce(jsonb_object_agg(q.status, q.n), '{}'::jsonb) as mapa
  from (
    select coalesce(j.status, 'sem-status') as status, count(*) as n
    from janela j
    group by 1
  ) q
)
select jsonb_build_object(
  'fonte', 'ai_usage_logs',
  'escopo', 'permitido_ao_solicitante',
  'gerado_em', now(),
  'filtros', jsonb_build_object(
    'inicio', p.inicio,
    'fim', p.fim,
    'janela_segundos', extract(epoch from (p.fim - p.inicio))::bigint,
    'balde_segundos', p.balde,
    'limite_funcoes', p.limite_funcoes,
    'limite_usuarios', p.limite_usuarios
  ),
  'cobertura', jsonb_build_object(
    'chamadas', r.chamadas,
    'primeiro_registro', r.primeiro_registro,
    'ultimo_registro', r.ultimo_registro,
    'truncado', false,
    'chamadas_sem_tokens', r.sem_tokens,
    'amostra_duracao', r.amostra_duracao,
    'funcoes_distintas', (select count(*) from (
       select 1 from janela j group by j.function_name) g),
    'usuarios_distintos', r.usuarios
  ),
  'totais', jsonb_build_object(
    'chamadas', r.chamadas,
    'erros', r.erros,
    'usuarios', r.usuarios,
    'tokens', r.tokens,
    'tokens_entrada', r.tokens_entrada,
    'tokens_saida', r.tokens_saida
  ),
  'duracao_ms', jsonb_build_object(
    'media', r.duracao_media_ms,
    'p95', r.duracao_p95_ms,
    'amostra', r.amostra_duracao
  ),
  'situacoes', si.mapa,
  'por_funcao', lf.lista,
  'por_usuario', lu.lista,
  'serie', se.lista
)
from parametros p, resumo r, lista_funcoes lf, lista_usuarios lu, serie se, situacoes si;
$function$
