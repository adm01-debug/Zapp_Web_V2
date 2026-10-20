-- testa o rollback do cabecalho (roda e desfaz)
begin;
create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $f$;
create or replace function public.is_admin_or_supervisor(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor')) $f$;
create or replace function public.is_admin(_user_id uuid) returns boolean language sql stable security definer set search_path = public as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin'::public.app_role) $f$;
create or replace function public.get_profile_role_for_check(p_user_id uuid) returns table(role text, access_level text, permissions jsonb) language sql stable security definer set search_path = public as $f$ select p.role, p.access_level, p.permissions from public.profiles p where p.user_id = p_user_id limit 1 $f$;
drop trigger if exists trg_bind_conversation_closure_author on public.conversation_closures;
drop trigger if exists trg_bind_conversation_event_author on public.conversation_events;
drop function if exists public.bind_conversation_closure_author();
drop function if exists public.bind_conversation_event_author();
drop policy if exists "Agents can create closures for their contacts" on public.conversation_closures;
create policy "Agents can create closures for their contacts" on public.conversation_closures for insert to authenticated with check (public.is_contact_visible_to_user(contact_id, auth.uid()));
drop policy if exists "Authorized users can insert events" on public.conversation_events;
create policy "Authorized users can insert events" on public.conversation_events for insert to authenticated with check ((performed_by is null or performed_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)) and (public.is_admin_or_supervisor(auth.uid()) or contact_id in (select c.id from public.contacts c where c.assigned_to = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1))));
drop policy if exists "Users can update their calls" on public.calls;
create policy "Users can update their calls" on public.calls for update to authenticated using (agent_id in (select id from public.profiles where user_id = auth.uid()));
drop policy if exists "Users can update messages of own accounts" on public.email_messages;
create policy "Users can update messages of own accounts" on public.email_messages for update to authenticated using (exists (select 1 from public.gmail_accounts ga where ga.id = gmail_account_id and (ga.user_id = auth.uid() or public.is_admin_or_supervisor(auth.uid()))));

do $$
declare v_t int; v_def text;
begin
  select count(*) into v_t from pg_trigger where tgname in ('trg_bind_conversation_closure_author','trg_bind_conversation_event_author');
  if v_t <> 0 then raise exception 'rollback FALHOU: gatilhos de autoria ainda existem (%)', v_t; end if;
  if exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname='bind_conversation_closure_author') then
    raise exception 'rollback FALHOU: funcao de gatilho ainda existe';
  end if;
  raise notice 'ROLLBACK OK: gatilhos/funcoes de autoria removidos';

  v_def := pg_get_functiondef('public.is_admin_or_supervisor(uuid)'::regprocedure);
  if v_def like '%secd_caller_ok%' then raise exception 'rollback FALHOU: is_admin_or_supervisor ainda usa secd_caller_ok'; end if;
  v_def := pg_get_functiondef('public.has_role(uuid,app_role)'::regprocedure);
  if v_def like '%secd_caller_ok%' then raise exception 'rollback FALHOU: has_role ainda usa secd_caller_ok'; end if;
  v_def := pg_get_functiondef('public.get_profile_role_for_check(uuid)'::regprocedure);
  if v_def like '%secd_caller_ok%' then raise exception 'rollback FALHOU: get_profile_role_for_check ainda usa secd_caller_ok'; end if;
  raise notice 'ROLLBACK OK: corpos antigos das funcoes de papel restaurados';
end $$;
rollback;
