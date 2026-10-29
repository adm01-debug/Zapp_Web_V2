-- talkx_v4_x075_benchmarks_period_names
-- Rollback: dropa a assinatura nova talkx_benchmarks(integer, integer) e recria talkx_benchmarks() sem argumentos com o corpo anterior (20260916220000), com os REVOKE/GRANT originais.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_benchmarks(integer, integer);
--   create or replace function public.talkx_benchmarks() returns jsonb language plpgsql stable security definer set search_path = public as $rb$ declare v_cutoff timestamptz := now() - interval '90 days'; v_global jsonb; v_by_seg jsonb; v_by_tpl jsonb; v_is_admin boolean := coalesce(public.is_admin_or_supervisor(auth.uid()), false); begin select jsonb_build_object('campaign_count', count(*), 'avg_delivery_rate_pct', round(avg(delivery_rate_pct)::numeric, 1), 'avg_reply_rate_pct', round(avg(reply_rate_pct)::numeric, 1), 'avg_duration_secs', round(avg(duration_secs)::numeric), 'p50_delivery_rate_pct', round((percentile_cont(0.5) within group (order by delivery_rate_pct))::numeric, 1), 'p90_delivery_rate_pct', round((percentile_cont(0.9) within group (order by delivery_rate_pct))::numeric, 1), 'avg_recipients', round(avg(total_recipients)::numeric)) into v_global from public.talkx_campaign_metrics where completed_at >= v_cutoff; if v_is_admin then select coalesce(jsonb_agg(row order by (row->>'avg_reply_rate_pct')::numeric desc), '[]'::jsonb) into v_by_seg from (select jsonb_build_object('segment_id', segment_id, 'campaign_count', count(*), 'avg_delivery_rate_pct', round(avg(delivery_rate_pct)::numeric, 1), 'avg_reply_rate_pct', round(avg(reply_rate_pct)::numeric, 1)) as row from public.talkx_campaign_metrics where completed_at >= v_cutoff and segment_id is not null group by segment_id order by avg(reply_rate_pct) desc limit 5) sub; else v_by_seg := '[]'::jsonb; end if; select coalesce(jsonb_agg(row order by (row->>'avg_delivery_rate_pct')::numeric desc), '[]'::jsonb) into v_by_tpl from (select jsonb_build_object('template_id', template_id, 'campaign_count', count(*), 'avg_delivery_rate_pct', round(avg(delivery_rate_pct)::numeric, 1), 'avg_reply_rate_pct', round(avg(reply_rate_pct)::numeric, 1)) as row from public.talkx_campaign_metrics where completed_at >= v_cutoff and template_id is not null group by template_id order by avg(delivery_rate_pct) desc limit 5) sub; return jsonb_build_object('window_days', 90, 'as_of', now(), 'global', coalesce(v_global, '{}'::jsonb), 'by_segment', coalesce(v_by_seg, '[]'::jsonb), 'by_template', coalesce(v_by_tpl, '[]'::jsonb)); end; $rb$;
--   revoke all on function public.talkx_benchmarks() from public;
--   revoke execute on function public.talkx_benchmarks() from anon;
--   grant execute on function public.talkx_benchmarks() to service_role, authenticated;
--
-- N-123 (X075; P3, lista aprovada pelo Joaquim em 09/10): comparativos por periodo com nomes.
-- talkx_benchmarks ganha a janela (p_days, default 90) e o limite (p_limit, default 5); a
-- assinatura antiga sem argumentos e removida porque, mantendo as duas com defaults, a chamada
-- sem argumentos ficaria ambigua. Acrescenta nome de segmento (so para admin/supervisor, como
-- ja acontecia com by_segment) e de template, volume enviado (sent_count), ordena os templates
-- por taxa de resposta e devolve has_baseline (true com 5+ campanhas concluidas na janela).
-- A assinatura nova preserva a postura de seguranca de 20260916220000: SECURITY DEFINER com
-- search_path fixo (agora public, pg_temp), by_segment so para admin/supervisor e REVOKE de
-- PUBLIC/anon. talkx_templates ja e visivel a qualquer authenticated (policy auth.uid() is not
-- null), entao expor template_name em by_template nao cria vazamento incremental.

drop function if exists public.talkx_benchmarks();

create or replace function public.talkx_benchmarks(
  p_days  integer default 90,
  p_limit integer default 5
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_days     integer := coalesce(p_days, 90);
  v_limit    integer := coalesce(p_limit, 5);
  v_cutoff   timestamptz;
  v_global   jsonb;
  v_by_seg   jsonb;
  v_by_tpl   jsonb;
  v_is_admin boolean := coalesce(public.is_admin_or_supervisor(auth.uid()), false);
  v_count    integer := 0;
begin
  if v_days < 1 or v_days > 3650 then
    raise exception 'invalid_talkx_benchmarks_days' using errcode = '22023';
  end if;
  if v_limit < 1 or v_limit > 50 then
    raise exception 'invalid_talkx_benchmarks_limit' using errcode = '22023';
  end if;

  v_cutoff := now() - make_interval(days => v_days);

  select jsonb_build_object(
    'campaign_count',        count(*),
    'avg_delivery_rate_pct', round(avg(metric.delivery_rate_pct)::numeric, 1),
    'avg_reply_rate_pct',    round(avg(metric.reply_rate_pct)::numeric, 1),
    'avg_duration_secs',     round(avg(metric.duration_secs)::numeric),
    'p50_delivery_rate_pct', round((percentile_cont(0.5) within group (order by metric.delivery_rate_pct))::numeric, 1),
    'p90_delivery_rate_pct', round((percentile_cont(0.9) within group (order by metric.delivery_rate_pct))::numeric, 1),
    'avg_recipients',        round(avg(metric.total_recipients)::numeric)
  ) into v_global
  from public.talkx_campaign_metrics metric
  where metric.completed_at >= v_cutoff;

  v_count := coalesce((v_global ->> 'campaign_count')::integer, 0);

  if v_is_admin then
    select coalesce(jsonb_agg(row order by (row ->> 'avg_reply_rate_pct')::numeric desc), '[]'::jsonb)
    into v_by_seg
    from (
      select jsonb_build_object(
        'segment_id',            metric.segment_id,
        'segment_name',          segment.name,
        'campaign_count',        count(*),
        'sent_count',            coalesce(sum(metric.sent_count), 0),
        'avg_delivery_rate_pct', round(avg(metric.delivery_rate_pct)::numeric, 1),
        'avg_reply_rate_pct',    round(avg(metric.reply_rate_pct)::numeric, 1)
      ) as row
      from public.talkx_campaign_metrics metric
      left join public.talkx_segments segment on segment.id = metric.segment_id
      where metric.completed_at >= v_cutoff and metric.segment_id is not null
      group by metric.segment_id, segment.name
      order by avg(metric.reply_rate_pct) desc
      limit v_limit
    ) sub;
  else
    v_by_seg := '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(row order by (row ->> 'avg_reply_rate_pct')::numeric desc), '[]'::jsonb)
  into v_by_tpl
  from (
    select jsonb_build_object(
      'template_id',           metric.template_id,
      'template_name',         template.name,
      'campaign_count',        count(*),
      'sent_count',            coalesce(sum(metric.sent_count), 0),
      'avg_delivery_rate_pct', round(avg(metric.delivery_rate_pct)::numeric, 1),
      'avg_reply_rate_pct',    round(avg(metric.reply_rate_pct)::numeric, 1)
    ) as row
    from public.talkx_campaign_metrics metric
    left join public.talkx_templates template on template.id = metric.template_id
    where metric.completed_at >= v_cutoff and metric.template_id is not null
    group by metric.template_id, template.name
    order by avg(metric.reply_rate_pct) desc
    limit v_limit
  ) sub;

  return jsonb_build_object(
    'window_days',  v_days,
    'limit',        v_limit,
    'as_of',        now(),
    'has_baseline', (v_count >= 5),
    'global',       coalesce(v_global, '{}'::jsonb),
    'by_segment',   coalesce(v_by_seg, '[]'::jsonb),
    'by_template',  coalesce(v_by_tpl, '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.talkx_benchmarks(integer, integer) from public;
revoke execute on function public.talkx_benchmarks(integer, integer) from anon;
grant execute on function public.talkx_benchmarks(integer, integer) to service_role, authenticated;
