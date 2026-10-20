-- Prova do vermelho-antes (nao comitado): reverte a migration DENTRO da transacao,
-- exercita os defeitos reais (autoria NULL e oraculo de papel) e mostra o estado antigo.
-- Termina com ROLLBACK. Roda: zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < .tmp/vermelho_antes.sql
begin;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $f$;
create or replace function public.is_admin_or_supervisor(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $f$ select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','supervisor')) $f$;

drop trigger if exists trg_bind_conversation_closure_author on public.conversation_closures;
drop trigger if exists trg_bind_conversation_event_author on public.conversation_events;

-- restaura as policies de INSERT antigas (sem exigir autoria)
drop policy if exists "Agents can create closures for their contacts" on public.conversation_closures;
create policy "Agents can create closures for their contacts" on public.conversation_closures
for insert to authenticated with check (public.is_contact_visible_to_user(contact_id, auth.uid()));
drop policy if exists "Authorized users can insert events" on public.conversation_events;
create policy "Authorized users can insert events" on public.conversation_events
for insert to authenticated with check (
  (performed_by is null or performed_by = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1))
  and (public.is_admin_or_supervisor(auth.uid()) or contact_id in (
    select c.id from public.contacts c
    where c.assigned_to = (select p.id from public.profiles p where p.user_id = auth.uid() limit 1)))
);

set local session_replication_role = replica;
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000a0001'),
  ('00000000-0000-0000-0000-0000000a0002');
insert into public.profiles (id, user_id, name, role, access_level, permissions, is_active) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000a0001', 'Admin Alvo', 'admin', 'full', '{}'::jsonb, true),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000a0002', 'Agente', 'agent', 'basic', '{}'::jsonb, true);
insert into public.user_roles (user_id, role) values
  ('00000000-0000-0000-0000-0000000a0001', 'admin'),
  ('00000000-0000-0000-0000-0000000a0002', 'agent');
insert into public.contacts (id, name, phone, assigned_to) values
  ('00000000-0000-0000-0000-0000000c0001', 'Contato', '+5511900000001', '00000000-0000-0000-0000-0000000f0002');
set local session_replication_role = origin;

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000a0002","role":"authenticated"}';
set local role authenticated;

-- RED F1: fecha sem autor -> closed_by fica NULL
insert into public.conversation_closures (id, contact_id, close_reason) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000c0001', 'resolvido');
insert into public.conversation_events (id, contact_id, event_type) values
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000c0001', 'note');
reset role;

select 'RED-F1 closed_by=' || coalesce(closed_by::text, 'NULL') from public.conversation_closures where id = '00000000-0000-0000-0000-0000000d0001';
select 'RED-F1 performed_by=' || coalesce(performed_by::text, 'NULL') from public.conversation_events where id = '00000000-0000-0000-0000-0000000d0003';

set local role authenticated;
select 'RED-F3 is_admin_or_supervisor(admin alheio)=' || public.is_admin_or_supervisor('00000000-0000-0000-0000-0000000a0001')::text;
reset role;

rollback;
