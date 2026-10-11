-- warroom_alerts_resolve
-- versão 20261011181949 reservada para hermes-warroom-alerts-resolve-261011151032c6 (hermes-db-migrar --nova)
-- Rollback: desfaz só o que esta migration criou: dropa as duas funções novas, os dois índices,
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.resolve_warroom_alert(uuid, text);
--   drop function if exists public.warroom_alerts_summary(interval);
--   drop index if exists public.idx_warroom_alerts_active;
--   drop index if exists public.idx_warroom_alerts_created_at;
--   alter table public.warroom_alerts drop constraint if exists warroom_alerts_resolution_note_len;
--   alter table public.warroom_alerts drop column if exists resolution_note;
--   alter table public.warroom_alerts drop column if exists resolved_by;
--   alter table public.warroom_alerts drop column if exists resolved_at;
-- Rollback: e a constraint de tamanho; nenhuma linha existente foi tocada, então não há dado a restaurar.
--
-- Paridade V3 -> V2 (auditoria de 11/10/2026, docs/audits/AUDITORIA_PARIDADE_V3_FRONTEND_PARTE6):
-- a sala de crise (War Room) só sabia marcar is_read (src/hooks/business/useWarRoomAlerts.ts);
-- não existia "resolver" nem histórico. A V3 tinha histórico com filtros e resolver
-- (projetos/Zapp_Web_V3/src/pages/AdminAlertHistoryPage.tsx). Esta migration fecha a lacuna NO
-- BANCO: colunas de resolução, índices de consulta e duas RPCs (resolver + contagens).
--
-- Substância aditiva: colunas NULLABLE novas, índices novos e funções NOVAS (create function, sem
-- tocar objeto vivo, sem DML, sem DROP). O único ponto que o classificador V1 lê como "contrato"
-- (sql_classe.py) é o REVOKE do EXECUTE que o Público ganha por padrão em toda função NOVA — não
-- há ACL de objeto existente sendo alterada; é o "negar por padrão" pedido no cartão.

-- 1. Colunas de resolução -----------------------------------------------------------
alter table public.warroom_alerts add column if not exists resolved_at timestamptz;
alter table public.warroom_alerts add column if not exists resolved_by uuid references public.profiles(id);
alter table public.warroom_alerts add column if not exists resolution_note text;

-- Limite de 500 caracteres da nota. NOT VALID + VALIDATE: nenhuma linha existente é reescrita nem
-- revalidada (a coluna é nova e está toda NULL); a validação roda em seguida e passa sempre; o
-- limite passa a valer para todo INSERT/UPDATE daqui pra frente. Guarda de idempotência na constraint.
do $do$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'warroom_alerts_resolution_note_len'
      and conrelid = 'public.warroom_alerts'::regclass
  ) then
    alter table public.warroom_alerts
      add constraint warroom_alerts_resolution_note_len
      check (resolution_note is null or char_length(resolution_note) <= 500) not valid;
  end if;
end;
$do$;
alter table public.warroom_alerts validate constraint warroom_alerts_resolution_note_len;

-- 2. Índices de consulta ------------------------------------------------------------
-- Histórico por data (a tela ordena e filtra por created_at).
create index if not exists idx_warroom_alerts_created_at
  on public.warroom_alerts (created_at);

-- Alertas ATIVOS (resolved_at is null): índice parcial, só cobre o que ainda está aberto.
create index if not exists idx_warroom_alerts_active
  on public.warroom_alerts (resolved_at) where resolved_at is null;

-- 3. RPC resolve_warroom_alert(id, nota) — staff (admin/supervisor) resolve um alerta --------
-- SECURITY DEFINER: roda com o dono e ignora a RLS de warroom_alerts para gravar; o portão é o
-- auth.uid()/is_admin_or_supervisor checado AQUI. Idempotente: alerta já resolvido não é
-- reescrito (não troca quem/quando). Auditoria via log_audit_event SEM dado pessoal: só o tipo,
-- a origem e o COMPRIMENTO da nota (nunca o texto da nota).
create function public.resolve_warroom_alert(p_alert_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_now timestamptz := now();
  v_alert public.warroom_alerts%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_alert_id is null then
    raise exception 'invalid_alert_id' using errcode = '22023';
  end if;

  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'note_too_long' using errcode = '22023';
  end if;

  select * into v_alert from public.warroom_alerts where id = p_alert_id;
  if not found then
    raise exception 'alert_not_found' using errcode = 'P0002';
  end if;

  -- Já resolvido: nada é reescrito (serve de resposta idempotente para reenvio/clique duplo).
  if v_alert.resolved_at is not null then
    return jsonb_build_object('ok', true, 'already_resolved', true,
                              'alert_id', v_alert.id, 'resolved_at', v_alert.resolved_at);
  end if;

  v_profile_id := public.current_profile_id();

  update public.warroom_alerts
     set resolved_at = v_now,
         resolved_by = v_profile_id,
         resolution_note = p_note
   where id = p_alert_id
     and resolved_at is null;

  -- Corrida: outro operador resolveu entre o select e o update. Devolve o estado real, sem auditoria dupla.
  if not found then
    select * into v_alert from public.warroom_alerts where id = p_alert_id;
    return jsonb_build_object('ok', true, 'already_resolved', true,
                              'alert_id', v_alert.id, 'resolved_at', v_alert.resolved_at);
  end if;

  perform public.log_audit_event(
    p_action => 'warroom_alert_resolved',
    p_entity_type => 'warroom_alerts',
    p_entity_id => p_alert_id::text,
    p_details => jsonb_build_object(
      'alert_type', v_alert.alert_type,
      'source', v_alert.source,
      'note_length', coalesce(char_length(p_note), 0)
    )
  );

  return jsonb_build_object('ok', true, 'already_resolved', false,
                            'alert_id', p_alert_id, 'resolved_at', v_now);
end;
$fn$;

-- 4. RPC warroom_alerts_summary(periodo) — contagens do painel ------------------------------
-- Janela sobre created_at (padrão 24 horas; periodo negativo cai no padrão). "criticos" segue a
-- mesma leitura da V3 (alert_type contendo 'critical'). SECURITY DEFINER com o mesmo portão.
create function public.warroom_alerts_summary(p_periodo interval default '24 hours'::interval)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_periodo interval := coalesce(p_periodo, '24 hours'::interval);
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if v_periodo < interval '0 second' then
    v_periodo := '24 hours'::interval;
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'ativos', count(*) filter (where resolved_at is null),
      'resolvidos', count(*) filter (where resolved_at is not null),
      'criticos', count(*) filter (where lower(alert_type) like '%critical%')
    )
    from public.warroom_alerts
    where created_at >= now() - v_periodo
  );
end;
$fn$;

-- 5. Permissões: só o papel necessário (authenticated); nada para o Público/anon ------------
revoke execute on function public.resolve_warroom_alert(uuid, text) from public, anon;
grant execute on function public.resolve_warroom_alert(uuid, text) to authenticated;

revoke execute on function public.warroom_alerts_summary(interval) from public, anon;
grant execute on function public.warroom_alerts_summary(interval) to authenticated;

-- 6. Documentação ------------------------------------------------------------------------
comment on column public.warroom_alerts.resolved_at is
  'paridade V3->V2: quando o alerta foi resolvido (NULL = ainda ativo). Escrito só por resolve_warroom_alert().';
comment on column public.warroom_alerts.resolved_by is
  'paridade V3->V2: profile que resolveu o alerta (FK profiles.id). Escrito só por resolve_warroom_alert().';
comment on column public.warroom_alerts.resolution_note is
  'paridade V3->V2: nota de resolução do operador, no máximo 500 caracteres (warroom_alerts_resolution_note_len).';
comment on function public.resolve_warroom_alert(uuid, text) is
  'paridade V3->V2: resolve um alerta do War Room (admin/supervisor), grava auditoria (sem dado pessoal) e é idempotente.';
comment on function public.warroom_alerts_summary(interval) is
  'paridade V3->V2: contagens de alertas do War Room na janela (total, ativos, resolvidos, criticos).';
