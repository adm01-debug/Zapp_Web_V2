-- rate_limit_alerts_cron_limiar
-- Rollback: desagenda o job, dropa a funcao avaliadora e a tabela de limiares (a linha semente sai com a tabela).
-- Rollback (SQL executável, na ordem):
--   select cron.unschedule(jobid) from cron.job where jobname = 'rate-limit-alerts';
--   drop function if exists public.evaluate_rate_limit_alerts();
--   drop table if exists public.rate_limit_alert_settings;
--
-- R3-FIX / pico de bloqueios do rate limit nao alertava ninguem. O painel
-- (src/pages/admin/RateLimitDashboard.tsx) so mostrava contagens na tela: um pico de
-- requisicoes bloqueadas passava sem alerta no War Room e sem push. A Edge
-- send-rate-limit-alert existe, mas o contrato dela e OUTRO (um IP bloqueado por vez,
-- corpo com ip_address/endpoint/request_count, secret interno no Vault): nao serve para
-- um limiar agregado e nao foi chamada aqui (registrado no relato). A avaliacao e um job
-- de banco, que grava direto em warroom_alerts — canal que o War Room ja assina por realtime.
--
--      1. public.rate_limit_alert_settings — UMA linha (id boolean PK = true): limiar de
--      bloqueios por janela (blocked_threshold, padrao 20), tamanho da janela em minutos
--      (window_minutes, padrao 5), gravidade minima para alertar (min_severity) e liga/desliga
--      (is_active). RLS habilitada, leitura/escrita so para admin; sem policy de DELETE.
--      2. public.evaluate_rate_limit_alerts() — SECURITY DEFINER, EXECUTE so do dono (cron):
--      conta os rate_limit_logs com blocked = true na janela, calcula a gravidade pelo
--      multiplo do limiar (>= 3x critical, >= 2x warning, >= 1x info), respeita a
--      gravidade minima e grava UM warroom_alerts com source = 'rate_limit'.
--      Idempotencia por janela: dedupe_key = 'rate-limit:v1:<bucket>' + ON CONFLICT no
--      indice unico parcial ux_warroom_alerts_dedupe_key (20261006155408) — a mesma janela
--      nao gera segundo alerta nem segundo push, sem corrida.
--      3. cron.schedule('rate-limit-alerts', '*/5 * * * *', ...) — reaplicavel (desagenda o
--      homonimo antes).
--
-- Nao manda IP, telefone nem qualquer dado de cliente na mensagem: o alerta e agregado
-- (contagem + janela + limiar). Nada de DROP/TRUNCATE/DELETE de objeto vivo.
--
-- Depende de: public.is_admin(uuid) (20260830080000), public.update_updated_at_column(),
-- public.secd_caller_ok(uuid, boolean) (M-DB-05, 20261007004545), warroom_alerts.dedupe_key
-- + ux_warroom_alerts_dedupe_key (20261006155408), public.rate_limit_logs (20251231115910).

-- ---------------------------------------------------------------------------
-- 1. Limiares (linha unica)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limit_alert_settings (
  id boolean primary key default true,
  blocked_threshold integer not null default 20,
  window_minutes integer not null default 5,
  min_severity text not null default 'info',
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint rate_limit_alert_settings_singleton check (id),
  constraint rate_limit_alert_settings_threshold_check check (blocked_threshold between 1 and 100000),
  constraint rate_limit_alert_settings_window_check check (window_minutes between 1 and 60),
  constraint rate_limit_alert_settings_severity_check check (min_severity in ('info', 'warning', 'critical'))
);

insert into public.rate_limit_alert_settings (id) values (true) on conflict (id) do nothing;

create or replace trigger update_rate_limit_alert_settings_updated_at
  before update on public.rate_limit_alert_settings
  for each row execute function public.update_updated_at_column();

alter table public.rate_limit_alert_settings enable row level security;

-- Tabela nova nasce fechada: sem EXECUTE/ACL para PUBLIC nem anon; so o admin le e edita.
revoke all on public.rate_limit_alert_settings from public, anon, authenticated;
grant select, insert, update on public.rate_limit_alert_settings to authenticated;
grant all on public.rate_limit_alert_settings to service_role;

drop policy if exists "Admins leem os limiares de alerta de rate limit" on public.rate_limit_alert_settings;
create policy "Admins leem os limiares de alerta de rate limit"
  on public.rate_limit_alert_settings for select to authenticated
  using (public.is_admin((select auth.uid())));

drop policy if exists "Admins inserem os limiares de alerta de rate limit" on public.rate_limit_alert_settings;
create policy "Admins inserem os limiares de alerta de rate limit"
  on public.rate_limit_alert_settings for insert to authenticated
  with check (public.is_admin((select auth.uid())));

drop policy if exists "Admins atualizam os limiares de alerta de rate limit" on public.rate_limit_alert_settings;
create policy "Admins atualizam os limiares de alerta de rate limit"
  on public.rate_limit_alert_settings for update to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

comment on table public.rate_limit_alert_settings is
  'Linha unica com o limiar de bloqueios que dispara alerta de War Room (source = rate_limit). Leitura/escrita so admin; EXECUTE/ACL fechados para anon/PUBLIC.';

-- ---------------------------------------------------------------------------
-- 2. Avaliador
-- ---------------------------------------------------------------------------
create or replace function public.evaluate_rate_limit_alerts()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_limite   integer;
  v_janela   integer;
  v_min_sev  text;
  v_ativo    boolean;
  v_bloqueios integer;
  v_sev      text;
  v_bucket   text;
  v_rank_sev integer;
  v_rank_min integer;
  v_inseridos integer := 0;
begin
  -- Cron roda sem JWT (auth.uid() nulo) => contexto interno; admin tambem passa. Agente
  -- comum nao pode disparar a avaliacao nem que um GRANT apareca no futuro.
  if not public.secd_caller_ok(null, true) then
    raise exception 'evaluate_rate_limit_alerts: apenas contexto interno ou admin'
      using errcode = '42501';
  end if;

  select s.blocked_threshold, s.window_minutes, s.min_severity, s.is_active
    into v_limite, v_janela, v_min_sev, v_ativo
    from public.rate_limit_alert_settings s
   where s.id;

  -- Sem configuracao: nada a fazer (fail-closed, nunca assume limiar).
  if v_limite is null or v_ativo is not true then
    return 0;
  end if;

  select count(*) into v_bloqueios
    from public.rate_limit_logs l
   where l.blocked is true
     and l.created_at >= now() - make_interval(mins => v_janela);

  if v_bloqueios < v_limite then
    return 0;
  end if;

  v_sev := case
             when v_bloqueios >= v_limite * 3 then 'critical'
             when v_bloqueios >= v_limite * 2 then 'warning'
             else 'info'
           end;

  v_rank_sev := case v_sev when 'critical' then 3 when 'warning' then 2 else 1 end;
  v_rank_min := case v_min_sev when 'critical' then 3 when 'warning' then 2 else 1 end;

  if v_rank_sev < v_rank_min then
    return 0;
  end if;

  -- Bucket da janela: mesmo incidente dentro da mesma janela nao repete.
  v_bucket := (floor(extract(epoch from now()) / (v_janela * 60)))::bigint::text;

  insert into public.warroom_alerts (alert_type, title, message, source, dedupe_key, is_read)
  values (
    v_sev,
    'Pico de bloqueios no rate limit: ' || v_bloqueios || ' em ' || v_janela || ' min',
    'O rate limit bloqueou ' || v_bloqueios || ' requisicoes nos ultimos ' || v_janela
      || ' min (limiar ' || v_limite || '). Reveja os endpoints e a whitelist em Administracao > Rate Limit.',
    'rate_limit',
    'rate-limit:v1:' || v_bucket,
    false
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_inseridos = row_count;
  return v_inseridos;
end;
$function$;

revoke all on function public.evaluate_rate_limit_alerts() from public, anon, authenticated;

comment on function public.evaluate_rate_limit_alerts() is
  'Conta rate_limit_logs.blocked na janela configurada e grava um warroom_alerts (source = rate_limit) por janela, gravidade pelo multiplo do limiar. Idempotente por dedupe_key; EXECUTE so do dono (cron).';

-- ---------------------------------------------------------------------------
-- 3. Agendamento (5 em 5 minutos, reaplicavel)
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid)
from cron.job
where jobname = 'rate-limit-alerts';

select cron.schedule(
  'rate-limit-alerts',
  '*/5 * * * *',
  $$select public.evaluate_rate_limit_alerts();$$
);
