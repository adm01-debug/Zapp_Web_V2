-- autoria_e_oraculo_de_papel
-- Rollback: devolve os 4 corpos anteriores das funcoes de papel, recria as 4 policies originais (sem autoria/WITH CHECK) e remove os 2 gatilhos + 2 funcoes de gatilho desta migration.
-- Rollback (SQL executável, na ordem):
--   create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $f$;
--   create or replace function public.is_admin_or_supervisor(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor')) $f$;
--   create or replace function public.is_admin(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin'::public.app_role) $f$;
--   create or replace function public.get_profile_role_for_check(p_user_id uuid) returns table(role text, access_level text, permissions jsonb) language sql stable security definer set search_path = public as $f$ select p.role, p.access_level, p.permissions from public.profiles p where p.user_id = p_user_id limit 1 $f$;
--   drop trigger if exists trg_bind_conversation_closure_author on public.conversation_closures;
--   drop trigger if exists trg_bind_conversation_event_author on public.conversation_events;
--   drop function if exists public.bind_conversation_closure_author();
--   drop function if exists public.bind_conversation_event_author();
--   drop policy if exists "Agents can create closures for their contacts" on public.conversation_closures;
--   create policy "Agents can create closures for their contacts" on public.conversation_closures for insert to authenticated with check (public.is_contact_visible_to_user(contact_id, auth.uid()));
--   drop policy if exists "Authorized users can insert events" on public.conversation_events;
--   create policy "Authorized users can insert events" on public.conversation_events for insert to authenticated with check ((performed_by is null or performed_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)) and (public.is_admin_or_supervisor(auth.uid()) or contact_id in (select c.id from public.contacts c where c.assigned_to = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1))));
--   drop policy if exists "Users can update their calls" on public.calls;
--   create policy "Users can update their calls" on public.calls for update to authenticated using (agent_id in (select id from public.profiles where user_id = auth.uid()));
--   drop policy if exists "Users can update messages of own accounts" on public.email_messages;
--   create policy "Users can update messages of own accounts" on public.email_messages for update to authenticated using (exists (select 1 from public.gmail_accounts ga where ga.id = gmail_account_id and (ga.user_id = auth.uid() or public.is_admin_or_supervisor(auth.uid()))));
--
-- Defeitos corrigidos (um por frente):
--   F1 (autoria)  conversation_closures.closed_by e conversation_events.performed_by nao
--                 ficavam vinculados ao chamador. O caminho FSM (set_conversation_status)
--                 gravava closed_by NULL e eventos com performed_by NULL, deixando a
--                 autoria forjavel/ausente. Agora um BEFORE INSERT carimba o autor a
--                 partir de auth.uid(); quando nao ha JWT (service_role/interno) o valor
--                 explicito e preservado.
--   F2 (UPDATE)   calls e email_messages tinham policy de UPDATE so com USING, sem
--                 WITH CHECK: o agente podia reescrever agent_id/gmail_account_id do
--                 registro e reatribui-lo a outro dono. WITH CHECK espelha o USING.
--   F3 (oraculo)  has_role/is_admin_or_supervisor/is_admin/get_profile_role_for_check
--                 respondiam por qualquer _user_id: qualquer autenticado descobria se
--                 OUTRO usuario e admin. Passam a usar public.secd_caller_ok (mesmo
--                 helper do 20261007004545): interno e admin/supervisor passam; usuario
--                 comum so consulta o proprio uid. Fail-closed (retorna false/vazio),
--                 sem excecao que distinga usuario existente de inexistente.
--
-- Sem DDL destrutivo: nenhum DROP de tabela/coluna, nenhum DELETE/TRUNCATE, nenhum GRANT
-- novo. As funcoes de gatilho nascem com EXECUTE fechado (PUBLIC/anon/authenticated),
-- como manda 20261001191230.

-- ============================================================================
-- F1. Autoria nao falsificavel (gatilho BEFORE INSERT)
-- ============================================================================

create or replace function public.bind_conversation_closure_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null then
    new.closed_by := public.get_profile_id_for_user(auth.uid());
  end if;
  return new;
end;
$function$;

revoke all on function public.bind_conversation_closure_author() from public, anon, authenticated;

drop trigger if exists trg_bind_conversation_closure_author on public.conversation_closures;
create trigger trg_bind_conversation_closure_author
before insert on public.conversation_closures
for each row execute function public.bind_conversation_closure_author();

create or replace function public.bind_conversation_event_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if auth.uid() is not null then
    new.performed_by := public.get_profile_id_for_user(auth.uid());
  end if;
  return new;
end;
$function$;

revoke all on function public.bind_conversation_event_author() from public, anon, authenticated;

drop trigger if exists trg_bind_conversation_event_author on public.conversation_events;
create trigger trg_bind_conversation_event_author
before insert on public.conversation_events
for each row execute function public.bind_conversation_event_author();

-- WITH CHECK espelhando o gatilho: a linha inserida tem de portar a autoria do chamador.
drop policy if exists "Agents can create closures for their contacts" on public.conversation_closures;
create policy "Agents can create closures for their contacts"
on public.conversation_closures for insert to authenticated
with check (
  public.is_contact_visible_to_user(contact_id, auth.uid())
  and closed_by = public.get_profile_id_for_user(auth.uid())
);

drop policy if exists "Authorized users can insert events" on public.conversation_events;
create policy "Authorized users can insert events"
on public.conversation_events for insert to authenticated
with check (
  performed_by = public.get_profile_id_for_user(auth.uid())
  and (
    public.is_admin_or_supervisor(auth.uid())
    or contact_id in (
      select c.id from public.contacts c
      where c.assigned_to = public.get_profile_id_for_user(auth.uid())
    )
  )
);

-- ============================================================================
-- F2. WITH CHECK nas policies de UPDATE citadas
-- ============================================================================

drop policy if exists "Users can update their calls" on public.calls;
create policy "Users can update their calls"
on public.calls for update to authenticated
using (agent_id in (select id from public.profiles where user_id = auth.uid()))
with check (agent_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "Users can update messages of own accounts" on public.email_messages;
create policy "Users can update messages of own accounts"
on public.email_messages for update to authenticated
using (
  exists (
    select 1 from public.gmail_accounts ga
    where ga.id = gmail_account_id
      and (ga.user_id = auth.uid() or public.is_admin_or_supervisor(auth.uid()))
  )
)
with check (
  exists (
    select 1 from public.gmail_accounts ga
    where ga.id = gmail_account_id
      and (ga.user_id = auth.uid() or public.is_admin_or_supervisor(auth.uid()))
  )
);

-- ============================================================================
-- F3. Funcoes de papel sem oraculo (secd_caller_ok)
-- ============================================================================

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.secd_caller_ok(_user_id, false)
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = _user_id and ur.role = _role
     );
$function$;

create or replace function public.is_admin_or_supervisor(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.secd_caller_ok(_user_id, false)
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = _user_id and ur.role in ('admin', 'supervisor')
     );
$function$;

create or replace function public.is_admin(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select public.secd_caller_ok(_user_id, false)
     and exists (
       select 1 from public.user_roles ur
       where ur.user_id = _user_id and ur.role = 'admin'::public.app_role
     );
$function$;

create or replace function public.get_profile_role_for_check(p_user_id uuid)
returns table(role text, access_level text, permissions jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select p.role, p.access_level, p.permissions
  from public.profiles p
  where p.user_id = p_user_id
    and public.secd_caller_ok(p_user_id, false)
  limit 1;
$function$;

-- CREATE OR REPLACE preserva a ACL existente. Reafirmamos o fechamento de PUBLIC/anon
-- e o EXECUTE de authenticated/service_role (as policies chamam estas funcoes como
-- authenticated; a guarda check-secdef-public-execute exige nenhum DEFINER alcancavel
-- por anon/PUBLIC).
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;

revoke all on function public.is_admin_or_supervisor(uuid) from public, anon;
grant execute on function public.is_admin_or_supervisor(uuid) to authenticated, service_role;

revoke all on function public.is_admin(uuid) from public, anon;
grant execute on function public.is_admin(uuid) to authenticated, service_role;

revoke all on function public.get_profile_role_for_check(uuid) from public, anon;
grant execute on function public.get_profile_role_for_check(uuid) to authenticated, service_role;
