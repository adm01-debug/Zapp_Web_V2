-- web_vitals_samples
-- Rollback: derruba o job do pg_cron, as RPCs public.purge_web_vitals_samples(interval) e public.record_web_vital(jsonb), a policy de leitura admin e a tabela public.web_vitals_samples (com os indices); a tabela nasce vazia e nao ha dado anterior para devolver.
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule('purge-web-vitals-samples');
--   drop function if exists public.purge_web_vitals_samples(interval);
--   drop function if exists public.record_web_vital(jsonb);
--   drop policy if exists "Admins leem web vitals" on public.web_vitals_samples;
--   drop table if exists public.web_vitals_samples;
--
-- PE-108 (item 25 do plano de 50 etapas) / SL-231 — "medicao de campo dos Web
-- Vitals sem coletor no servidor": src/lib/web-vitals.ts mede LCP/FID/CLS/INP/
-- TTFB/FCP/TTI no navegador e compara com performance-budget.json, mas o dado
-- morre no cliente — nenhuma metrica chega ao servidor e nao existe par de
-- campo para o orcamento (a V3 resolve com a Edge `client-observability`
-- gravando em query_telemetry). Aqui a trilha e do navegador para a RPC.
--
-- SEM PII: guarda ROTA normalizada (sem query string nem fragmento) no lugar da
-- URL completa, e nao guarda user-agent, IP nem identificador de sessao. O
-- user_id existe so para rate limit e para a leitura admin.
--
-- Contrato (para o coletor do cliente):
--     public.record_web_vital(p_samples jsonb) -> integer
--     p_samples = array (1..50) de {metric, value, route?, app_version?}
--       metric       in ('LCP','FID','CLS','INP','TTFB','FCP','TTI')
--       value        numero; CLS 0..10, as demais metricas 0..600000 (ms)
--       route        pathname normalizado, comeca com '/' (o '?' e o '#' sao
--                    cortados no servidor); ausente => '/'
--       app_version  ate 40 caracteres, sem espaco; ausente => 'unknown'
--     devolve quantas linhas gravou; 0 = nada a gravar (lote vazio) ou
--     descarte silencioso pelo rate limit (observabilidade nao deve virar
--     enxurrada de erro no cliente)
--     public.purge_web_vitals_samples(p_keep interval default '30 days') -> integer
--     retencao: apaga amostras mais antigas que p_keep (so service_role)
--
-- Seguranca: o cliente NUNCA escreve na tabela. Nao ha policy nem GRANT de
-- INSERT/UPDATE/DELETE; o unico caminho de escrita e a RPC SECURITY DEFINER
-- public.record_web_vital, que valida o lote inteiro ANTES de gravar (uma
-- entrada invalida recusa tudo, nada pela metade) e limita por usuario. Leitura
-- so para admin (policy + GRANT SELECT); anon nao tem EXECUTE nem SELECT.
--
-- Rate limit: reusa public.consume_rate_limit (edge_rate_limits), a fonte de
-- verdade do time, com chave por usuario e janela de 60 s (30 chamadas).
--
-- Retencao: public.purge_web_vitals_samples apaga o que passou de 30 dias e o
-- job 'purge-web-vitals-samples' roda as 04:25 UTC. Coordenacao com PE-102
-- (agendador central): o nome do job e distinto e a limpeza central pode
-- reassumir este passo sem tocar na tabela; ate la a retencao ja roda.

create table public.web_vitals_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  metric text not null,
  value double precision not null,
  route text not null default '/',
  app_version text not null default 'unknown',
  sampled_on date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  constraint web_vitals_samples_metric_check
    check (metric in ('LCP','FID','CLS','INP','TTFB','FCP','TTI')),
  constraint web_vitals_samples_value_check
    check (value >= 0 and value <= case when metric = 'CLS' then 10 else 600000 end),
  constraint web_vitals_samples_route_check
    check (route ~ '^/[^?#[:space:]]*$' and char_length(route) <= 200),
  constraint web_vitals_samples_version_check
    check (app_version <> '' and app_version !~ '[[:space:]]' and char_length(app_version) <= 40)
);

comment on table public.web_vitals_samples is 'Amostras de Web Vitals dos navegadores (PE-108/SL-231), sem PII: rota normalizada, sem URL/UA/IP. Escrita so pela RPC record_web_vital; leitura admin; retencao de 30 dias pelo job purge-web-vitals-samples.';
comment on column public.web_vitals_samples.route is 'Pathname normalizado (sem query string nem fragmento), comeca com /.'; 
comment on column public.web_vitals_samples.sampled_on is 'Dia (UTC) do descarregamento, para relatorios e retencao.';

create index web_vitals_samples_sampled_on_idx on public.web_vitals_samples (sampled_on);
create index web_vitals_samples_metric_sampled_on_idx on public.web_vitals_samples (metric, sampled_on);

alter table public.web_vitals_samples enable row level security;

revoke all on table public.web_vitals_samples from public, anon, authenticated;
grant select on table public.web_vitals_samples to authenticated;

create policy "Admins leem web vitals"
  on public.web_vitals_samples
  for select
  to authenticated
  using (public.is_admin((select auth.uid())));

-- Escrita: so por esta RPC. Valida o lote inteiro antes de gravar; o limite por
-- usuario usa a mesma fonte de verdade das Edge Functions.
create or replace function public.record_web_vital(p_samples jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  v_count integer;
  v_total integer;
  v_allowed boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Rate limit por usuario, 30 chamadas por minuto (ate 1500 amostras/min).
  select c.allowed into v_allowed
    from public.consume_rate_limit('web-vital:' || v_uid::text, 30, 60) as c;
  if not v_allowed then
    return 0;
  end if;

  if p_samples is null or jsonb_typeof(p_samples) is distinct from 'array' then
    raise exception 'invalid_samples' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_samples);
  if v_count = 0 then
    return 0;
  end if;
  if v_count > 50 then
    raise exception 'invalid_samples_length' using errcode = '22023';
  end if;

  -- VALIDA TUDO antes de gravar: uma amostra invalida recusa o lote inteiro
  -- (atomicidade) — o mesmo criterio dos CHECKs da tabela, com erro 22023.
  if exists (
    select 1
      from jsonb_array_elements(p_samples) as e(s)
     where jsonb_typeof(e.s) is distinct from 'object'
        or e.s->>'metric' is null
        or e.s->>'metric' <> all (array['LCP','FID','CLS','INP','TTFB','FCP','TTI'])
        or coalesce(
             case when jsonb_typeof(e.s->'value') = 'number'
                  then (e.s->>'value')::double precision end, -1)
           not between 0 and (case when e.s->>'metric' = 'CLS' then 10 else 600000 end)
        or (e.s ? 'route' and (
             jsonb_typeof(e.s->'route') <> 'string'
             or coalesce(regexp_replace(btrim(e.s->>'route'), '[?#].*$', ''), '') !~ '^/[^[:space:]]*$'
             or char_length(coalesce(regexp_replace(btrim(e.s->>'route'), '[?#].*$', ''), '')) not between 1 and 200
           ))
        or (e.s ? 'app_version' and (
             jsonb_typeof(e.s->'app_version') <> 'string'
             or btrim(e.s->>'app_version') = ''
             or btrim(e.s->>'app_version') ~ '[[:space:]]'
             or char_length(btrim(e.s->>'app_version')) > 40
           ))
  ) then
    raise exception 'invalid_sample' using errcode = '22023';
  end if;

  insert into public.web_vitals_samples (user_id, metric, value, route, app_version, sampled_on)
  select v_uid,
         e.s->>'metric',
         (e.s->>'value')::double precision,
         coalesce(nullif(regexp_replace(btrim(e.s->>'route'), '[?#].*$', ''), ''), '/'),
         coalesce(nullif(btrim(e.s->>'app_version'), ''), 'unknown'),
         (now() at time zone 'utc')::date
    from jsonb_array_elements(p_samples) as e(s);

  get diagnostics v_total = row_count;
  return v_total;
end;
$fn$;

revoke all on function public.record_web_vital(jsonb) from public, anon, authenticated;
grant execute on function public.record_web_vital(jsonb) to authenticated;

-- Retencao (30 dias por padrao). p_keep nulo = fail closed (nada e apagado).
create or replace function public.purge_web_vitals_samples(p_keep interval default interval '30 days')
returns integer
language sql
security definer
set search_path = public, pg_temp
as $fn$
  with removed as (
    delete from public.web_vitals_samples
     where p_keep is not null
       and sampled_on < ((now() at time zone 'utc')::date - p_keep)::date
    returning 1
  )
  select coalesce(count(*), 0)::integer from removed;
$fn$;

revoke all on function public.purge_web_vitals_samples(interval) from public, anon, authenticated;
grant execute on function public.purge_web_vitals_samples(interval) to service_role;

select cron.schedule('purge-web-vitals-samples', '25 4 * * *', $cron$select public.purge_web_vitals_samples()$cron$);
