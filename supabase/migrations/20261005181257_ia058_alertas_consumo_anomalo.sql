-- ia058_alertas_consumo_anomalo
-- Rollback: SELECT cron.unschedule('ia058-avaliador-anomalias'); DROP FUNCTION IF EXISTS public.ai_capability_resume(text, text); DROP FUNCTION IF EXISTS public.ai_capability_active_block(text); DROP FUNCTION IF EXISTS public.ai_anomaly_evaluate(timestamptz); DROP TABLE IF EXISTS public.ai_capability_blocks; DROP TABLE IF EXISTS public.ai_anomaly_incidents; DROP TABLE IF EXISTS public.ai_anomaly_configs;
--
-- IA-058 — runtime de alertas de consumo anômalo de IA (antes era só projeto
-- documental). Três peças locais ao Postgres:
--
--  1. CONFIGURAÇÃO persistida (`ai_anomaly_configs`): uma linha por
--     (scope, signal) — escopo user|department|capability × sinal
--     cost|errors|concurrency — com janela (segundos), limiar e amostra mínima.
--     O avaliador NUNCA carrega limiar em código: todo número vem da tabela,
--     então ajustar sensibilidade é UPDATE, não deploy. `enabled = false`
--     desliga a combinação sem apagar a configuração.
--
--  2. INCIDENTE deduplicado (`ai_anomaly_incidents`): a identidade do
--     incidente é (scope, target_id, signal, window_start) — o BALDE da janela,
--     não o instante da checagem — materializada por índice único: duplicar é
--     impossível, mesmo com dois avaliadores concorrentes. Ciclo
--     open -> acknowledged -> resolved; re-detecção no mesmo balde só atualiza
--     (detections, max_value). Reconhecimento NÃO é silenciador permanente:
--     acknowledged/resolved reabre e volta a notificar somente quando a medida
--     supera o pior valor já visto (max_value) — "piora mensurável".
--
--  3. BLOQUEIO por capacidade (`ai_capability_blocks`): bloqueia SOMENTE
--     function_name — a capacidade canônica já passada a enforceAiGuards —
--     sempre com incident_id e motivo; ativo enquanto resumed_at é NULL e a
--     retomada é manual (ai_capability_resume). enforceAiGuards consulta
--     ai_capability_active_block ANTES de consumir contador/cota e recusa
--     explicitamente; falha de infraestrutura falha aberta (não simula
--     bloqueio).
--
--  Sinais (dado insuficiente NUNCA dispara — mesma regra da IA-057):
--    cost        = soma (tarifa vigente × total_tokens) dos logs da janela;
--                  chamada sem tarifa não entra nem na medida nem na amostra
--                  (ausência de tarifa nunca entra como zero — IA-055).
--    errors      = erros / chamadas com desfecho próprio (success|error);
--                  fallback não é erro nem acerto (IA-057).
--    concurrency = maior hits num balde de edge_rate_limits do alvo na janela
--                  (chaves 'ai:<escopo>:<fn>:<identidade>:<ISO>' do guard IA-043).
--
--  Canal operacional: public.notifications para usuários distintos com papel admin,
--  escrito no mesmo fluxo do incidente, com metadata.incident_id. Sem
--  e-mail/WhatsApp/Slack e sem HTTP externo no job.
--
--  Agendador: job pg_cron 'ia058-avaliador-anomalias' a cada 5 min fora do
--  minuto 0 (2-59/5, medida do TALK X sobre contenção do agendador). Rodar de
--  novo não duplica o job (unschedule condicional antes do schedule).
--
--  Grants/RLS fail-closed: escrita só por service_role; leitura operacional só
--  para admin/supervisor via is_admin_or_supervisor (mesmo papel das policies
--  de ai_usage_logs).

-- ============================================================================
-- Configuração: uma linha por (escopo, sinal) — tudo ajustável sem deploy
-- ============================================================================

create table if not exists public.ai_anomaly_configs (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null
                   constraint ai_anomaly_configs_scope_check
                   check (scope in ('user', 'department', 'capability')),
  signal         text not null
                   constraint ai_anomaly_configs_signal_check
                   check (signal in ('cost', 'errors', 'concurrency')),
  window_seconds integer not null
                   constraint ai_anomaly_configs_window_check
                   check (window_seconds > 0),
  threshold      numeric not null,
  min_sample     integer not null default 1
                   constraint ai_anomaly_configs_min_sample_check
                   check (min_sample >= 1),
  enabled        boolean not null default true,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists uq_ai_anomaly_configs_escopo_sinal
  on public.ai_anomaly_configs (scope, signal);

comment on table public.ai_anomaly_configs is
  'IA-058: limiares ajustáveis por (scope, signal). scope: user|department|capability; signal: cost|errors|concurrency. O avaliador lê daqui — nada de limiar em código.';

alter table public.ai_anomaly_configs enable row level security;

revoke all on table public.ai_anomaly_configs from public, anon, authenticated;
grant select on table public.ai_anomaly_configs to authenticated;
grant all on table public.ai_anomaly_configs to service_role;

drop policy if exists ai058_configs_leitura_operacional on public.ai_anomaly_configs;
create policy ai058_configs_leitura_operacional
  on public.ai_anomaly_configs for select
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

-- Semente: as 9 combinações ligadas, com limiares iniciais conservadores —
-- ponto de partida documentado, ajustável por UPDATE (não por deploy).
insert into public.ai_anomaly_configs (scope, signal, window_seconds, threshold, min_sample, notes)
values
  ('user',       'cost',        3600, 10,   10, 'gasto por usuário acima de 10 (moeda da tarifa) na hora'),
  ('department', 'cost',        3600, 50,   30, 'gasto do departamento acima de 50 na hora'),
  ('capability', 'cost',        3600, 20,   20, 'gasto da capacidade acima de 20 na hora'),
  ('user',       'errors',      3600, 0.5,  10, 'taxa de erro do usuário acima de 50% com amostra >= 10'),
  ('department', 'errors',      3600, 0.4,  30, 'taxa de erro do departamento acima de 40% com amostra >= 30'),
  ('capability', 'errors',      3600, 0.3,  20, 'taxa de erro da capacidade acima de 30% com amostra >= 20'),
  ('user',       'concurrency', 3600, 100,  5,  'balde de rate limit do usuário passou de 100 hits na hora'),
  ('department', 'concurrency', 3600, 200,  10, 'balde de rate limit do departamento passou de 200 hits na hora'),
  ('capability', 'concurrency', 3600, 150,  5,  'balde de rate limit da capacidade passou de 150 hits na hora')
on conflict (scope, signal) do nothing;

-- ============================================================================
-- Incidentes: a deduplicação é o índice único — repetir o balde atualiza
-- ============================================================================

create table if not exists public.ai_anomaly_incidents (
  id                 uuid primary key default gen_random_uuid(),
  scope              text not null
                       constraint ai_anomaly_incidents_scope_check
                       check (scope in ('user', 'department', 'capability')),
  target_id          text not null,
  signal             text not null
                       constraint ai_anomaly_incidents_signal_check
                       check (signal in ('cost', 'errors', 'concurrency')),
  window_start       timestamptz not null,
  window_seconds     integer not null
                       constraint ai_anomaly_incidents_window_check
                       check (window_seconds > 0),
  status             text not null default 'open'
                       constraint ai_anomaly_incidents_status_check
                       check (status in ('open', 'acknowledged', 'resolved')),
  measured_value     numeric not null,
  max_value          numeric not null,
  threshold          numeric not null,
  sample_size        integer not null,
  detections         integer not null default 1,
  notification_count integer not null default 0,
  first_detected_at  timestamptz not null default now(),
  last_detected_at   timestamptz not null default now(),
  acknowledged_at    timestamptz,
  acknowledged_by    uuid,
  resolved_at        timestamptz,
  resolved_by        uuid,
  created_at         timestamptz not null default now()
);

create unique index if not exists uq_ai_anomaly_incidents_dedup
  on public.ai_anomaly_incidents (scope, target_id, signal, window_start);

create index if not exists idx_ai_anomaly_incidents_status
  on public.ai_anomaly_incidents (status);

comment on table public.ai_anomaly_incidents is
  'IA-058: incidente único por (scope, target_id, signal, window_start). Re-detecção no mesmo balde atualiza; acknowledged/resolved reabre e notifica só com piora mensurável (measured > max_value).';

alter table public.ai_anomaly_incidents enable row level security;

revoke all on table public.ai_anomaly_incidents from public, anon, authenticated;
grant select on table public.ai_anomaly_incidents to authenticated;
grant all on table public.ai_anomaly_incidents to service_role;

drop policy if exists ai058_incidents_leitura_operacional on public.ai_anomaly_incidents;
create policy ai058_incidents_leitura_operacional
  on public.ai_anomaly_incidents for select
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

-- ============================================================================
-- Bloqueio por capacidade: function_name + incident_id + motivo, retomada manual
-- ============================================================================

create table if not exists public.ai_capability_blocks (
  id            uuid primary key default gen_random_uuid(),
  function_name text not null,
  incident_id   uuid not null
                  references public.ai_anomaly_incidents (id) on delete restrict,
  reason        text not null,
  blocked_by    text not null default 'manual',
  blocked_at    timestamptz not null default now(),
  resumed_at    timestamptz,
  resumed_by    text,
  created_at    timestamptz not null default now()
);

-- Um bloqueio ATIVO por capacidade: resumed_at NULL é o bloqueio vigente;
-- a linha fica como histórico depois da retomada.
create unique index if not exists uq_ai_capability_blocks_ativo
  on public.ai_capability_blocks (function_name) where resumed_at is null;

create index if not exists idx_ai_capability_blocks_incidente
  on public.ai_capability_blocks (incident_id);

comment on table public.ai_capability_blocks is
  'IA-058: bloqueio de capacidade por function_name, sempre com incident_id e motivo. Ativo enquanto resumed_at IS NULL; a retomada é manual (ai_capability_resume).';

alter table public.ai_capability_blocks enable row level security;

revoke all on table public.ai_capability_blocks from public, anon, authenticated;
grant select on table public.ai_capability_blocks to authenticated;
grant all on table public.ai_capability_blocks to service_role;

drop policy if exists ai058_blocks_leitura_operacional on public.ai_capability_blocks;
create policy ai058_blocks_leitura_operacional
  on public.ai_capability_blocks for select
  to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

-- ============================================================================
-- Consulta do guard: bloqueio ativo da capacidade (uma linha ou nada)
-- ============================================================================

create or replace function public.ai_capability_active_block(p_function_name text)
returns table (incident_id uuid, reason text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.incident_id, b.reason, b.blocked_at
    from public.ai_capability_blocks b
   where b.function_name = p_function_name
     and b.resumed_at is null
   order by b.blocked_at desc
   limit 1;
$$;

revoke all on function public.ai_capability_active_block(text) from public, anon, authenticated;
grant execute on function public.ai_capability_active_block(text) to service_role;

comment on function public.ai_capability_active_block(text) is
  'IA-058: devolve o bloqueio ATIVO (resumed_at IS NULL) de uma function_name, com incident_id e motivo. Vazio = capacidade livre.';

-- Retomada manual: encerra o bloqueio ativo e devolve quantos saíram (0|1).
create or replace function public.ai_capability_resume(p_function_name text, p_resumed_by text)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with r as (
    update public.ai_capability_blocks b
       set resumed_at = now(),
           resumed_by = p_resumed_by
     where b.function_name = p_function_name
       and b.resumed_at is null
    returning 1
  )
  select coalesce(count(*), 0)::integer from r;
$$;

revoke all on function public.ai_capability_resume(text, text) from public, anon, authenticated;
grant execute on function public.ai_capability_resume(text, text) to service_role;

comment on function public.ai_capability_resume(text, text) is
  'IA-058: retomada manual — marca resumed_at no bloqueio ativo da capacidade. Nenhuma auto-liberação por tempo existe.';

-- ============================================================================
-- Avaliador: lê configs, mede a janela FECHADA anterior e deduplica incidentes
-- ============================================================================

create or replace function public.ai_anomaly_evaluate(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  cfg       record;
  cand      record;
  prev      record;
  v_ws      timestamptz;
  v_ws_end  timestamptz;
  v_id      uuid;
  v_notify  boolean;
  v_touched integer := 0;
begin
  for cfg in
    select c.id, c.scope, c.signal, c.window_seconds, c.threshold, c.min_sample
      from public.ai_anomaly_configs c
     where c.enabled
     order by c.scope, c.signal
  loop
    -- A janela avaliada é o balde FECHADO imediatamente anterior a p_now:
    -- alarme sobre janela completa, e duas execuções no mesmo balde reavaliam
    -- a mesma janela (é a deduplicação que segura a repetição, não o relógio).
    v_ws_end := date_bin(make_interval(secs => cfg.window_seconds), p_now, '1970-01-01'::timestamptz);
    v_ws     := v_ws_end - make_interval(secs => cfg.window_seconds);

    for cand in
      select x.target_id, x.measured::numeric as measured, x.sample
        from (
          -- COST: soma (tarifa vigente x total_tokens) por alvo na janela.
          -- Amostra = só chamadas COM tarifa: sem preço, o custo não existe
          -- medido — nunca entra como zero (IA-055).
          select case cfg.scope
                   when 'user'       then l.user_id::text
                   when 'department' then pr.department_id::text
                   else                   l.function_name
                 end as target_id,
                 sum(t.unit_price * l.total_tokens) as measured,
                 count(*) filter (where t.unit_price is not null) as sample
            from public.ai_usage_logs l
            left join (
              select p.user_id, min(p.department_id::text) as department_id
                from public.profiles p
               where p.department_id is not null
               group by p.user_id
            ) pr on pr.user_id = l.user_id and cfg.scope = 'department'
            left join lateral (
              select mp.unit_price
                from public.ai_model_prices mp
               where mp.model = l.model
                 and mp.unit = 'token'
                 and mp.valid_from <= l.created_at
                 and (mp.valid_to is null or l.created_at < mp.valid_to)
               order by mp.valid_from desc,
                        (mp.source = 'provider_statement') desc,
                        mp.created_at desc
               limit 1
            ) t on true
           where cfg.signal = 'cost'
             and l.created_at >= v_ws and l.created_at < v_ws_end
           group by 1

          union all

          -- ERRORS: erros / chamadas com desfecho próprio (success|error).
          -- 'fallback' não é erro nem acerto (IA-057): fica fora do denominador.
          select case cfg.scope
                   when 'user'       then l.user_id::text
                   when 'department' then pr.department_id::text
                   else                   l.function_name
                 end as target_id,
                 count(*) filter (where l.status = 'error')::numeric / count(*) as measured,
                 count(*) as sample
            from public.ai_usage_logs l
            left join (
              select p.user_id, min(p.department_id::text) as department_id
                from public.profiles p
               where p.department_id is not null
               group by p.user_id
            ) pr on pr.user_id = l.user_id and cfg.scope = 'department'
           where cfg.signal = 'errors'
             and l.status in ('success', 'error')
             and l.created_at >= v_ws and l.created_at < v_ws_end
           group by 1

          union all

          -- CONCURRENCY: maior hits num balde de edge_rate_limits do alvo.
          -- Chave do guard (IA-043): 'ai:<escopo>:<fn>:<identidade>:<ISO>' —
          -- parte 2 = escopo do contador, 3 = function_name, 4 = identidade.
          select case cfg.scope
                   when 'user'       then split_part(e.key, ':', 4)
                   when 'department' then pr.department_id::text
                   else                   split_part(e.key, ':', 3)
                 end as target_id,
                 max(e.hits)::numeric as measured,
                 count(*) as sample
            from public.edge_rate_limits e
            left join (
              select p.user_id, min(p.department_id::text) as department_id
                from public.profiles p
               where p.department_id is not null
               group by p.user_id
            ) pr on pr.user_id::text = split_part(e.key, ':', 4) and cfg.scope = 'department'
           where cfg.signal = 'concurrency'
             and e.key like 'ai:%'
             and e.window_start >= v_ws and e.window_start < v_ws_end
             and (cfg.scope = 'capability' or split_part(e.key, ':', 2) = 'user')
           group by 1
        ) x
       where x.target_id is not null
         and x.sample >= cfg.min_sample
         and x.measured > cfg.threshold
    loop
      -- Primeira detecção no balde: INSERT protegido pelo índice único —
      -- dois avaliadores concorrentes não podem criar dois incidentes.
      insert into public.ai_anomaly_incidents
        (scope, target_id, signal, window_start, window_seconds, status,
         measured_value, max_value, threshold, sample_size, detections,
         first_detected_at, last_detected_at)
      values
        (cfg.scope, cand.target_id, cfg.signal, v_ws, cfg.window_seconds, 'open',
         cand.measured, cand.measured, cfg.threshold, cand.sample, 1,
         p_now, p_now)
      on conflict (scope, target_id, signal, window_start) do nothing
      returning id into v_id;

      if v_id is not null then
        v_notify := true;
      else
        -- Recorrência no mesmo balde: atualiza sem notificar de novo.
        -- Reconhecido/resolvido reabre e notifica SÓ com piora mensurável
        -- (medida acima do pior valor já visto).
        select i.id, i.status, i.max_value into prev
          from public.ai_anomaly_incidents i
         where i.scope = cfg.scope
           and i.target_id = cand.target_id
           and i.signal = cfg.signal
           and i.window_start = v_ws
         for update;
        v_notify := prev.status <> 'open' and cand.measured > prev.max_value;
        update public.ai_anomaly_incidents i
           set detections        = i.detections + 1,
               measured_value    = cand.measured,
               sample_size       = cand.sample,
               threshold         = cfg.threshold,
               max_value         = greatest(i.max_value, cand.measured),
               last_detected_at  = p_now,
               status            = case when v_notify then 'open' else i.status end
         where i.id = prev.id
        returning i.id into v_id;
      end if;

      v_touched := v_touched + 1;

      if v_notify then
        update public.ai_anomaly_incidents
           set notification_count = notification_count + 1
         where id = v_id;
        insert into public.notifications (user_id, title, message, type, metadata)
          select distinct ur.user_id,
                 'Consumo anômalo de IA: ' || cfg.signal || ' em ' || cfg.scope || ' ' || cand.target_id,
                 'Incidente ' || v_id || ': escopo ' || cfg.scope || ', sinal ' || cfg.signal
                   || ', alvo ' || cand.target_id || ', medido ' || round(cand.measured, 4)
                   || ' acima do limiar ' || cfg.threshold || ' (amostra ' || cand.sample
                   || ', janela ' || v_ws || ').',
                 'ai_anomaly_alert',
                 jsonb_build_object(
                   'incident_id', v_id,
                   'scope', cfg.scope,
                   'target_id', cand.target_id,
                   'signal', cfg.signal,
                   'measured', cand.measured,
                   'threshold', cfg.threshold,
                   'sample', cand.sample,
                   'window_start', v_ws,
                   'window_seconds', cfg.window_seconds)
            from public.user_roles ur
           where ur.role = 'admin';
      end if;
    end loop;
  end loop;

  return v_touched;
end;
$$;

revoke all on function public.ai_anomaly_evaluate(timestamptz) from public, anon, authenticated;
grant execute on function public.ai_anomaly_evaluate(timestamptz) to service_role;

comment on function public.ai_anomaly_evaluate(timestamptz) is
  'IA-058: avalia o balde FECHADO anterior a p_now para cada (scope, signal) habilitado em ai_anomaly_configs. Dedup por índice único; acknowledged/resolved reabre só com piora mensurável. Devolve quantos incidentes tocou.';

-- ============================================================================
-- Agendador: job pg_cron local, idempotente, sem HTTP externo
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ia058-avaliador-anomalias') then
    perform cron.unschedule('ia058-avaliador-anomalias');
  end if;

  -- A cada 5 min fora do minuto 0 (2,7,...,57): a medição do TALK X mostrou o
  -- minuto 0 saturado de jobs concorrentes; 2-59/5 mantém a cadência sem o pico.
  perform cron.schedule(
    'ia058-avaliador-anomalias',
    '2-59/5 * * * *',
    'select public.ai_anomaly_evaluate()'
  );
end
$$;
