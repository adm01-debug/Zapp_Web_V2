CREATE OR REPLACE FUNCTION public.talkx_benchmarks(p_days integer DEFAULT 90, p_limit integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
