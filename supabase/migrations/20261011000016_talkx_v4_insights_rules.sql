-- talkx_v4_insights_rules
-- Rollback: dropa a funcao public.talkx_insights(timestamptz, timestamptz); nao altera tabelas nem dados.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.talkx_insights(timestamptz, timestamptz);
--
-- N-124 (X075; P3): as "dicas" da tela 07 saem do navegador (INS:90-134) e passam
-- a ser calculadas no servidor por talkx_insights(p_from, p_to). Regras fixas:
--  (1) melhor faixa de 2 horas contra a media do periodo — exige 200 envios no
--      periodo e 30 na faixa, ganho relativo >= 20% -> acao 'prefill_send_window';
--  (2) campanhas com segmento contra campanhas sem segmento — exige 3 campanhas
--      de cada lado -> acao 'open_segments';
--  (3) template com maior taxa de resposta contra a media — exige 2 campanhas e
--      100 envios -> acao 'open_template';
--  (4) cliques baixos nas campanhas concluidas -> acao 'review_clicks'.
-- A regra de "contatos inativos" NAO entra (usava contacts.updated_at, que nao
-- mede inatividade). Cada insight devolve id, type, priority, params numericos,
-- sample e action. `summary.rule_count` conta as regras ativas e
-- `summary.estimated_lift_pct` so e preenchido com as 3 primeiras regras ativas e
-- 10+ campanhas concluidas no periodo (maior ganho medido, teto 50%); senao nulo.
-- Escopo: SECURITY DEFINER com search_path fixo, mas SO enxerga as campanhas que
-- o chamador ve (created_by do proprio perfil ou admin/supervisor) — quem nao ve
-- campanha nenhuma recebe `insights` vazio. A hora da faixa e lida em
-- America/Sao_Paulo, o mesmo fuso do app (appHour). REVOKE de PUBLIC/anon.

create or replace function public.talkx_insights(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_me         uuid := (select p.id from public.profiles p where p.user_id = auth.uid() limit 1);
  v_is_admin   boolean := coalesce(public.is_admin_or_supervisor(auth.uid()), false);
  v_insights   jsonb := '[]'::jsonb;
  v_count      integer := 0;
  v_has1       boolean := false;
  v_has2       boolean := false;
  v_has3       boolean := false;
  v_lift1      numeric;
  v_lift2      numeric;
  v_lift3      numeric;
  v_recent90   integer;
  v_est        numeric;
  -- regra 1
  v_total_sends integer;
  v_hour        integer;
  v_band_n      integer;
  v_band_rate   numeric;
  v_avg_rate    numeric;
  -- regra 2
  v_with_n      integer;
  v_without_n   integer;
  v_wrep        numeric;
  v_wsent       numeric;
  v_owrep       numeric;
  v_owsent      numeric;
  v_with_rate   numeric;
  v_without_rate numeric;
  -- regra 3
  v_tpl_id      uuid;
  v_tpl_camps   integer;
  v_tpl_sent    integer;
  v_tpl_rate    numeric;
  v_avg_tpl_rate numeric;
  -- regra 4
  v_done        integer;
  v_low         integer;
  v_clicks      numeric;
  v_camps_sent  numeric;
  v_avg_click   numeric;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'invalid_talkx_insights_period' using errcode = '22023';
  end if;

  -- (1) melhor faixa de 2 horas contra a media do periodo -------------------
  select count(*)::int into v_total_sends
  from public.talkx_recipients r
  join public.talkx_campaigns c on c.id = r.campaign_id
  where (v_is_admin or c.created_by = v_me)
    and r.sent_at >= p_from and r.sent_at < p_to;

  if v_total_sends >= 200 then
    select s.band, s.n, (s.rep::numeric / s.n), (g.rep::numeric / g.n)
      into v_hour, v_band_n, v_band_rate, v_avg_rate
    from (
      select (floor(extract(hour from (r.sent_at at time zone 'America/Sao_Paulo')) / 2) * 2)::int as band,
             (count(*))::int as n,
             (count(*) filter (where r.replied_at is not null))::int as rep
      from public.talkx_recipients r
      join public.talkx_campaigns c on c.id = r.campaign_id
      where (v_is_admin or c.created_by = v_me)
        and r.sent_at >= p_from and r.sent_at < p_to
      group by 1
    ) s
    cross join (
      select (count(*))::int as n,
             (count(*) filter (where r.replied_at is not null))::int as rep
      from public.talkx_recipients r
      join public.talkx_campaigns c on c.id = r.campaign_id
      where (v_is_admin or c.created_by = v_me)
        and r.sent_at >= p_from and r.sent_at < p_to
    ) g
    where s.n >= 30
    order by (s.rep::numeric / s.n) desc, s.band asc
    limit 1;

    if v_band_n is not null and coalesce(v_avg_rate, 0) > 0 then
      v_lift1 := round(((v_band_rate / v_avg_rate) - 1) * 100, 1);
      if v_lift1 >= 20 then
        v_has1 := true;
        v_count := v_count + 1;
        v_insights := v_insights || jsonb_build_object(
          'id', 'best-window', 'type', 'timing', 'priority', 'high',
          'action', 'prefill_send_window',
          'sample', v_band_n,
          'params', jsonb_build_object(
            'hour', v_hour,
            'window_hours', 2,
            'reply_rate_pct', round(v_band_rate * 100, 1),
            'avg_reply_rate_pct', round(v_avg_rate * 100, 1),
            'lift_pct', v_lift1
          ));
      end if;
    end if;
  end if;

  -- (2) campanhas com segmento contra campanhas sem segmento ------------------
  select
    (count(*) filter (where c.segment_id is not null))::int,
    (count(*) filter (where c.segment_id is null))::int,
    coalesce(sum(c.replied_count) filter (where c.segment_id is not null), 0)::numeric,
    coalesce(sum(c.sent_count)    filter (where c.segment_id is not null), 0)::numeric,
    coalesce(sum(c.replied_count) filter (where c.segment_id is null), 0)::numeric,
    coalesce(sum(c.sent_count)    filter (where c.segment_id is null), 0)::numeric
  into v_with_n, v_without_n, v_wrep, v_wsent, v_owrep, v_owsent
  from public.talkx_campaigns c
  where (v_is_admin or c.created_by = v_me)
    and c.status = 'completed'
    and c.completed_at >= p_from and c.completed_at < p_to;

  if v_with_n >= 3 and v_without_n >= 3 and v_wsent > 0 and v_owsent > 0 then
    v_with_rate := v_wrep / v_wsent;
    v_without_rate := v_owrep / v_owsent;
    if v_with_rate > v_without_rate then
      v_lift2 := round(((v_with_rate / v_without_rate) - 1) * 100, 1);
      v_has2 := true;
      v_count := v_count + 1;
      v_insights := v_insights || jsonb_build_object(
        'id', 'segment-lift', 'type', 'segment', 'priority', 'medium',
        'action', 'open_segments',
        'sample', v_with_n + v_without_n,
        'params', jsonb_build_object(
          'with_segment_campaigns', v_with_n,
          'without_segment_campaigns', v_without_n,
          'with_segment_reply_rate_pct', round(v_with_rate * 100, 1),
          'without_segment_reply_rate_pct', round(v_without_rate * 100, 1),
          'lift_pct', v_lift2
        ));
    end if;
  end if;

  -- (3) template com maior taxa de resposta contra a media -------------------
  select t.template_id, t.campaigns, t.sent, (t.replied::numeric / t.sent), (g.rep::numeric / g.sent)
    into v_tpl_id, v_tpl_camps, v_tpl_sent, v_tpl_rate, v_avg_tpl_rate
  from (
    select c.template_id,
           (count(*))::int as campaigns,
           coalesce(sum(c.sent_count), 0)::int as sent,
           coalesce(sum(c.replied_count), 0)::int as replied
    from public.talkx_campaigns c
    where (v_is_admin or c.created_by = v_me)
      and c.status = 'completed'
      and c.completed_at >= p_from and c.completed_at < p_to
      and c.template_id is not null
    group by c.template_id
  ) t
  cross join (
    select coalesce(sum(c.sent_count), 0)::numeric as sent,
           coalesce(sum(c.replied_count), 0)::numeric as rep
    from public.talkx_campaigns c
    where (v_is_admin or c.created_by = v_me)
      and c.status = 'completed'
      and c.completed_at >= p_from and c.completed_at < p_to
  ) g
  where t.campaigns >= 2 and t.sent >= 100 and g.sent > 0
  order by (t.replied::numeric / t.sent) desc, t.sent desc
  limit 1;

  if v_tpl_id is not null and coalesce(v_avg_tpl_rate, 0) > 0 and v_tpl_rate > v_avg_tpl_rate then
    v_lift3 := round(((v_tpl_rate / v_avg_tpl_rate) - 1) * 100, 1);
    v_has3 := true;
    v_count := v_count + 1;
    v_insights := v_insights || jsonb_build_object(
      'id', 'best-template', 'type', 'template', 'priority', 'medium',
      'action', 'open_template',
      'sample', v_tpl_sent,
      'params', jsonb_build_object(
        'template_id', v_tpl_id,
        'campaigns', v_tpl_camps,
        'sent', v_tpl_sent,
        'reply_rate_pct', round(v_tpl_rate * 100, 1),
        'avg_reply_rate_pct', round(v_avg_tpl_rate * 100, 1),
        'lift_pct', v_lift3
      ));
  end if;

  -- (4) cliques baixos nas campanhas concluidas ------------------------------
  select (count(*))::int,
         (count(*) filter (where x.clicks::numeric / x.sent_count < 0.05))::int,
         coalesce(sum(x.clicks), 0)::numeric,
         coalesce(sum(x.sent_count), 0)::numeric
    into v_done, v_low, v_clicks, v_camps_sent
  from (
    select c.sent_count,
           coalesce((
             select count(*) from public.talkx_link_clicks lc
             join public.talkx_links l on l.id = lc.link_id
             where l.campaign_id = c.id
               and lc.clicked_at >= p_from and lc.clicked_at < p_to
           ), 0)::int as clicks
    from public.talkx_campaigns c
    where (v_is_admin or c.created_by = v_me)
      and c.status = 'completed'
      and c.completed_at >= p_from and c.completed_at < p_to
      and c.sent_count >= 10
  ) x;

  if v_done > 0 and v_camps_sent > 0 then
    v_avg_click := v_clicks / v_camps_sent;
    if v_avg_click < 0.05 and v_low >= 3 then
      v_count := v_count + 1;
      v_insights := v_insights || jsonb_build_object(
        'id', 'low-clicks', 'type', 'links', 'priority', 'low',
        'action', 'review_clicks',
        'sample', v_done,
        'params', jsonb_build_object(
          'low_click_campaigns', v_low,
          'completed_campaigns', v_done,
          'avg_click_rate_pct', round(v_avg_click * 100, 1),
          'max_rate_pct', 5
        ));
    end if;
  end if;

  -- summary: estimated_lift_pct so com as 3 primeiras regras ativas e 10+
  -- campanhas concluidas nos ultimos 90 dias (maior ganho medido, teto 50%)
  if v_has1 and v_has2 and v_has3 then
    select (count(*))::int into v_recent90
    from public.talkx_campaigns c
    where (v_is_admin or c.created_by = v_me)
      and c.status = 'completed'
      and c.completed_at >= p_to - interval '90 days' and c.completed_at < p_to;
    if v_recent90 >= 10 then
      v_est := least(50, greatest(v_lift1, v_lift2, v_lift3));
    end if;
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'insights', v_insights,
    'summary', jsonb_build_object('rule_count', v_count, 'estimated_lift_pct', v_est)
  );
end;
$fn$;

revoke all on function public.talkx_insights(timestamptz, timestamptz) from public;
revoke execute on function public.talkx_insights(timestamptz, timestamptz) from anon;
grant execute on function public.talkx_insights(timestamptz, timestamptz) to service_role, authenticated;

comment on function public.talkx_insights(timestamptz, timestamptz) is
  'N-124/X075: dicas por regra fixa (janela, segmento, template, cliques) para a tela 07, restritas as campanhas visiveis ao chamador.';
