-- sla_delivery_rules
-- Rollback: dropa a RPC resolve_sla_delivery_rule, o gatilho de updated_at e a tabela sla_delivery_rules (com o seed 30/60).
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.resolve_sla_delivery_rule(uuid);
--   drop trigger if exists sla_delivery_rules_set_updated_at on public.sla_delivery_rules;
--   drop table if exists public.sla_delivery_rules;
--
-- Paridade V3 -> V2 (auditoria 11/10/2026, documento 08-chat-1): trazer o alerta de
-- atraso de ENTREGA, com configuração. Regra da V3: avisar quando a última mensagem
-- ENTREGUE do agente fica sem resposta do cliente além de um limite — padrão 30 min de
-- atenção (warning) e 60 min de estouro (breach), com regra mais específica por contato;
-- entre regras ativas de mesmo escopo vale a mais recente.
--
-- Conferência do que já existe (11/10): public.sla_rules e public.sla_configurations
-- cuidam de OUTRA métrica (first_response_minutes / resolution_minutes). Nenhuma das
-- duas tem os limites de ENTREGA (warning/breach) nem a resolução contato->global desta
-- tabela; não há nada a reaproveitar, por isso a tabela nasce aqui.
--
-- Classe: aditiva — tabela nova, políticas, RPC nova e seed idempotente; sem DROP de
-- objeto vivo, sem DML em dado existente, tudo `if not exists` / `on conflict`-livre.

create table if not exists public.sla_delivery_rules (
  id              uuid        primary key default gen_random_uuid(),
  contact_id      uuid        references public.contacts (id) on delete cascade,
  warning_minutes integer     not null check (warning_minutes between 1 and 10080),
  breach_minutes  integer     not null check (breach_minutes >= warning_minutes and breach_minutes <= 10080),
  is_active       boolean     not null default true,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.sla_delivery_rules is
  'Paridade V3: limites de atraso de entrega (ub_delivery_sla). contact_id nulo = regra global; '
  'regra ativa do contato vence a global, e entre ativas de mesmo escopo vale a mais recente '
  '(resolve_sla_delivery_rule).';

comment on column public.sla_delivery_rules.warning_minutes is
  'Minutos sem resposta do cliente, após a última entrega do agente, para o aviso de atencao.';
comment on column public.sla_delivery_rules.breach_minutes is
  'Minutos sem resposta do cliente, após a última entrega do agente, para o estouro.';

-- Resolução lê sempre "a ativa mais recente do escopo": índice parcial cobre as duas buscas.
create index if not exists sla_delivery_rules_active_contact_idx
  on public.sla_delivery_rules (contact_id, created_at desc, id desc)
  where is_active;

create index if not exists sla_delivery_rules_active_global_idx
  on public.sla_delivery_rules (created_at desc, id desc)
  where is_active and contact_id is null;

-- updated_at: gatilho reutiliza o helper canônico do repositório.
drop trigger if exists sla_delivery_rules_set_updated_at on public.sla_delivery_rules;
create trigger sla_delivery_rules_set_updated_at
  before update on public.sla_delivery_rules
  for each row execute function public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- RLS: leitura para qualquer autenticado (é configuração operacional que a tela
-- de atendimento lê); escrita só admin/supervisor. Anônimo não lê nem escreve.
-- ---------------------------------------------------------------------------
alter table public.sla_delivery_rules enable row level security;

create policy sla_delivery_rules_select on public.sla_delivery_rules
  for select to authenticated
  using (auth.uid() is not null);

create policy sla_delivery_rules_admin_insert on public.sla_delivery_rules
  for insert to authenticated
  with check (public.is_admin_or_supervisor(auth.uid()));

create policy sla_delivery_rules_admin_update on public.sla_delivery_rules
  for update to authenticated
  using (public.is_admin_or_supervisor(auth.uid()))
  with check (public.is_admin_or_supervisor(auth.uid()));

create policy sla_delivery_rules_admin_delete on public.sla_delivery_rules
  for delete to authenticated
  using (public.is_admin_or_supervisor(auth.uid()));

-- ACL: nada para anon; authenticated lê e escreve (a escrita é barrada pela RLS);
-- service_role faz manutenção. Sem EXECUTE/privilegio herdado do PUBLIC.
revoke all on table public.sla_delivery_rules from public, anon, authenticated;
grant select, insert, update, delete on table public.sla_delivery_rules to authenticated;
grant all on table public.sla_delivery_rules to service_role;

-- ---------------------------------------------------------------------------
-- Seed aditivo e idempotente: uma regra global ativa 30/60, só quando ainda não
-- existe nenhuma regra global (replay da migration não duplica).
-- ---------------------------------------------------------------------------
insert into public.sla_delivery_rules (contact_id, warning_minutes, breach_minutes, is_active, created_by)
select null, 30, 60, true, null
where not exists (
  select 1 from public.sla_delivery_rules where contact_id is null
);

-- ---------------------------------------------------------------------------
-- RPC canônica de resolução: contato ativo mais recente; senão global ativa mais
-- recente; senão o padrão 30/60. SECURITY DEFINER com portão de auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.resolve_sla_delivery_rule(p_contact_id uuid)
returns table (
  rule_id         uuid,
  contact_id      uuid,
  warning_minutes integer,
  breach_minutes  integer,
  source          text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_rule public.sla_delivery_rules%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_contact_id is not null then
    select r.* into v_rule
      from public.sla_delivery_rules r
     where r.contact_id = p_contact_id
       and r.is_active
     order by r.created_at desc, r.id desc
     limit 1;
    if found then
      return query select v_rule.id, v_rule.contact_id, v_rule.warning_minutes, v_rule.breach_minutes, 'contact'::text;
      return;
    end if;
  end if;

  select r.* into v_rule
    from public.sla_delivery_rules r
   where r.contact_id is null
     and r.is_active
   order by r.created_at desc, r.id desc
   limit 1;
  if found then
    return query select v_rule.id, v_rule.contact_id, v_rule.warning_minutes, v_rule.breach_minutes, 'global'::text;
    return;
  end if;

  return query select null::uuid, null::uuid, 30, 60, 'default'::text;
end;
$$;

comment on function public.resolve_sla_delivery_rule(uuid) is
  'Paridade V3: regra efetiva de atraso de entrega do contato — contato ativo mais recente, '
  'senão global ativa mais recente, senão 30/60 (source = contact|global|default).';

revoke all on function public.resolve_sla_delivery_rule(uuid) from public, anon, authenticated;
grant execute on function public.resolve_sla_delivery_rule(uuid) to authenticated, service_role;
