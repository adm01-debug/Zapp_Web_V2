-- supervisor_copilot_snapshot
-- Rollback: remove a RPC gerencial do Copiloto; nada mais foi criado ou alterado.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.supervisor_copilot_snapshot();
-- ============================================================================
-- RPC única que alimenta o Copiloto do Supervisor (persona gerencial) com um
-- snapshot VERDADEIRO do que o Zapp Web V2 já registra hoje — sem inventar dado.
--
-- Contrato (jsonb):
--   queues[]           — por fila: conversas abertas, sem resposta há mais de
--                        1h, SLA em risco e SLA estourado no dia;
--   agents[]           — por atendente (papel 'agent'): conversas abertas
--                        atribuídas, 1ªs respostas do dia e tempo médio da 1ª
--                        resposta do dia (segundos);
--   closureReasons7d[] — motivos de encerramento dos últimos 7 dias;
--   unavailable{}      — CSAT, NPS, capacidade e fila de espera de integração
--                        (Singu) NÃO existem no V2: devolvidos como
--                        'indisponivel' em vez de número inventado.
--
-- Regras (espelham o dashboard existente, para não duplicar semântica):
--   * "aberta"   = contacts.deleted_at IS NULL AND conversation_status NOT IN
--                  ('resolved','archived')  (mesmo predicado de
--                  public.dashboard_contact_counts);
--   * recorte do dia e "últimos 7 dias" no fuso America/Sao_Paulo;
--   * risco de 1ª resposta = conversa aberta ainda sem resposta e já passado o
--     limite de 1ª resposta do motor de SLA (5 min — ver
--     register_first_response_internal);
--   * contagens devolvem 0 (nunca NULL).
--
-- Autorização: SECURITY DEFINER com o MESMO predicado das telas gerenciais
-- (public.is_admin_or_supervisor) — anon e atendente comum são negados.
-- ============================================================================

create or replace function public.supervisor_copilot_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_now      timestamptz := now();
  v_today    timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
  v_jwt_role text;
  v_result   jsonb;
begin
  v_jwt_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');

  -- Só admin/supervisor (telas gerenciais) ou service_role (chamadas internas).
  if v_jwt_role <> 'service_role' and not public.is_admin_or_supervisor(auth.uid()) then
    raise exception 'supervisor_copilot_snapshot: acesso restrito a admin/supervisor'
      using errcode = '42501';
  end if;

  with open_contacts as (
    select c.id, c.queue_id, c.assigned_to
      from public.contacts c
     where c.deleted_at is null
       and c.conversation_status not in ('resolved', 'archived')
  ),
  latest_sla as (
    select distinct on (s.contact_id)
           s.contact_id, s.first_message_at, s.first_response_at
      from public.conversation_sla s
     order by s.contact_id, s.first_message_at desc, s.created_at desc
  ),
  queue_rows as (
    select q.id as queue_id,
           q.name as queue_name,
           count(oc.id) as open_conversations,
           count(oc.id) filter (
             where ls.first_response_at is null
               and ls.first_message_at <= v_now - interval '1 hour'
           ) as unanswered_over_1h,
           count(oc.id) filter (
             where ls.first_response_at is null
               and ls.first_message_at <= v_now - interval '5 minutes'
           ) as sla_at_risk,
           (select count(distinct c2.id)
              from public.contacts c2
              join public.conversation_sla s2 on s2.contact_id = c2.id
             where c2.queue_id = q.id
               and c2.deleted_at is null
               and s2.first_response_breached is true
               and s2.first_message_at >= v_today) as sla_breached_today
      from public.queues q
      left join open_contacts oc on oc.queue_id = q.id
      left join latest_sla ls on ls.contact_id = oc.id
     group by q.id, q.name
  ),
  agent_rows as (
    select p.id as agent_id,
           p.name as agent_name,
           (select count(*)
              from open_contacts oc
             where oc.assigned_to = p.id) as open_assigned,
           (select count(*)
              from public.contacts c
              join public.conversation_sla s on s.contact_id = c.id
             where c.assigned_to = p.id
               and c.deleted_at is null
               and s.first_response_at is not null
               and s.first_response_at >= v_today) as responses_today,
           (select round(avg(extract(epoch from (s.first_response_at - s.first_message_at)))::numeric)
              from public.contacts c
              join public.conversation_sla s on s.contact_id = c.id
             where c.assigned_to = p.id
               and c.deleted_at is null
               and s.first_response_at is not null
               and s.first_response_at >= v_today) as avg_first_response_seconds_today
      from public.profiles p
     where p.is_active is true
       and exists (
         select 1
           from public.user_roles ur
          where ur.user_id = p.user_id
            and ur.role = 'agent'
       )
  ),
  closure_rows as (
    select cl.close_reason as reason,
           count(*) as total
      from public.conversation_closures cl
     where cl.created_at >= v_today - interval '6 days'
     group by cl.close_reason
  )
  select jsonb_build_object(
    'generatedAt', to_jsonb(v_now),
    'timezone', 'America/Sao_Paulo',
    'todayStart', to_jsonb(v_today),
    'queues', coalesce((
      select jsonb_agg(jsonb_build_object(
        'queueId', queue_id,
        'queueName', queue_name,
        'openConversations', open_conversations,
        'unansweredOver1h', unanswered_over_1h,
        'slaAtRisk', sla_at_risk,
        'slaBreachedToday', sla_breached_today) order by queue_name, queue_id)
        from queue_rows), '[]'::jsonb),
    'agents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'agentId', agent_id,
        'agentName', agent_name,
        'openAssigned', open_assigned,
        'responsesToday', responses_today,
        'avgFirstResponseSecondsToday', avg_first_response_seconds_today) order by agent_name, agent_id)
        from agent_rows), '[]'::jsonb),
    'closureReasons7d', coalesce((
      select jsonb_agg(jsonb_build_object('reason', reason, 'count', total) order by total desc, reason)
        from closure_rows), '[]'::jsonb),
    'unavailable', jsonb_build_object(
      'csat', 'indisponivel: o V2 nao registra pesquisa de satisfacao (CSAT)',
      'nps', 'indisponivel: o V2 nao registra NPS',
      'capacidadeAtendente', 'indisponivel: o V2 nao mede capacidade/limite por atendente',
      'filaEsperaIntegracao', 'indisponivel: o V2 nao tem fila de espera de integracao (Singu)')
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.supervisor_copilot_snapshot() from public, anon, authenticated;
grant execute on function public.supervisor_copilot_snapshot() to authenticated, service_role;

comment on function public.supervisor_copilot_snapshot() is
  'Snapshot gerencial do Copiloto do Supervisor: por fila (abertas, sem resposta >1h, SLA em risco/estourado do dia), por atendente (abertas atribuidas, 1a resposta do dia), motivos de encerramento dos ultimos 7 dias e marcacao explicita de indisponivel para CSAT/NPS/capacidade/fila de integracao. SECURITY DEFINER, restrita a admin/supervisor (is_admin_or_supervisor). Fuso America/Sao_Paulo; contagens nunca NULL.';
