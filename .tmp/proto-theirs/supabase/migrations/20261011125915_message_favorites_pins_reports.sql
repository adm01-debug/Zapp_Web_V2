-- message_favorites_pins_reports
-- Rollback: dropa as 4 RPCs, o gatilho de pin e as 3 tabelas, na ordem inversa.
-- Rollback (SQL executável, na ordem):
--   drop trigger if exists message_pins_force_contact_id on public.message_pins;
--   drop function if exists public.unpin_message(uuid);
--   drop function if exists public.pin_message(uuid);
--   drop function if exists public.report_message(uuid, text, text);
--   drop function if exists public.toggle_message_favorite(uuid);
--   drop function if exists public.message_pins_force_contact_id();
--   drop table if exists public.message_reports;
--   drop table if exists public.message_pins;
--   drop table if exists public.message_favorites;
--
-- Favoritar, fixar (no maximo 3 por conversa) e reportar mensagem, tudo no banco:
--   1. message_favorites: par (user_id, message_id) por usuario. RLS so das proprias
--      linhas; o INSERT direto exige contato visivel e o RPC toggle_message_favorite()
--      tambem. Ler nao muda nada, mas a escrita carrega o mesmo predicado da policy
--      de SELECT de messages (is_contact_visible_to_user), entao quem nao enxerga a
--      mensagem tambem nao a favorita.
--   2. message_pins: fixar e por conversa (contact_id), nao por usuario; todos que
--      enxergam o contato enxergam os fixos. Nao ha policy de escrita: so
--      pin_message()/unpin_message() escrevem (a funcao roda como definer). O
--      contact_id e derivado da mensagem por gatilho, para nao aceitar contacto
--      forjado do cliente.
--   3. message_reports: uma linha por (mensagem, denunciante). O relato grava so o
--      motivo e a nota opcional — nunca texto de mensagem. SELECT so do proprio
--      relato (ou admin/supervisor); UPDATE de status so admin/supervisor, e
--      resolved_by/resolved_at sao carimbados pelo proprio revisor.
--   4. Auditoria: pin/unpin/report gravam em audit_logs SEM texto de mensagem
--      (apenas ids, motivo e contagem).
--
-- Ledger: migration nova, registrada pelo fluxo local (hermes-db-migrar).

-- ===================== 1. Favoritos por usuario =====================
create table if not exists public.message_favorites (
  user_id    uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.message_favorites enable row level security;

drop policy if exists message_favorites_select_own on public.message_favorites;
create policy message_favorites_select_own on public.message_favorites
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists message_favorites_insert_own on public.message_favorites;
create policy message_favorites_insert_own on public.message_favorites
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.messages m
      where m.id = message_id
        and public.is_contact_visible_to_user(m.contact_id, (select auth.uid()))
    )
  );

drop policy if exists message_favorites_delete_own on public.message_favorites;
create policy message_favorites_delete_own on public.message_favorites
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.message_favorites from anon;
grant select, insert, delete on table public.message_favorites to authenticated;

-- ===================== 2. Fixos por conversa =====================
create table if not exists public.message_pins (
  id         uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by  uuid not null references auth.users(id) on delete cascade,
  pinned_at  timestamptz not null default now(),
  unique (contact_id, message_id)
);

alter table public.message_pins enable row level security;

drop policy if exists message_pins_select_visible on public.message_pins;
create policy message_pins_select_visible on public.message_pins
  for select to authenticated
  using (public.is_contact_visible_to_user(contact_id, (select auth.uid())));
-- Sem policy de INSERT/UPDATE/DELETE: escrita so por pin_message()/unpin_message().

create or replace function public.message_pins_force_contact_id()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_contact uuid;
begin
  select m.contact_id into v_contact
  from public.messages m
  where m.id = new.message_id;

  if v_contact is null then
    raise exception 'message_without_contact' using errcode = '22023';
  end if;

  new.contact_id := v_contact;
  return new;
end;
$$;

drop trigger if exists message_pins_force_contact_id on public.message_pins;
create trigger message_pins_force_contact_id
  before insert or update on public.message_pins
  for each row execute function public.message_pins_force_contact_id();

revoke all on function public.message_pins_force_contact_id() from public, anon, authenticated;
revoke all on table public.message_pins from anon;
grant select on table public.message_pins to authenticated;

-- ===================== 3. Relatos de mensagem =====================
create table if not exists public.message_reports (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references public.messages(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('spam', 'improprio', 'urgencia', 'outro')),
  note        text check (note is null or char_length(note) between 1 and 500),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at  timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  unique (message_id, reporter_id)
);

alter table public.message_reports enable row level security;

drop policy if exists message_reports_select_own_or_admin on public.message_reports;
create policy message_reports_select_own_or_admin on public.message_reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_admin_or_supervisor((select auth.uid()))
  );

drop policy if exists message_reports_update_admin on public.message_reports;
create policy message_reports_update_admin on public.message_reports
  for update to authenticated
  using (public.is_admin_or_supervisor((select auth.uid())))
  with check (
    public.is_admin_or_supervisor((select auth.uid()))
    and (status = 'open' or resolved_by = (select auth.uid()))
  );
-- Sem policy de INSERT: gravar so por report_message().

revoke all on table public.message_reports from anon;
grant select on table public.message_reports to authenticated;
grant update (status, resolved_by, resolved_at) on table public.message_reports to authenticated;

-- ===================== 4. RPCs =====================
create or replace function public.toggle_message_favorite(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_removed integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and public.is_contact_visible_to_user(m.contact_id, v_user)
  ) then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  delete from public.message_favorites
  where user_id = v_user and message_id = p_message_id;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    return false;
  end if;

  insert into public.message_favorites (user_id, message_id)
  values (v_user, p_message_id);

  return true;
end;
$$;

create or replace function public.pin_message(p_message_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_pin_id  uuid;
  v_count   integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id
    and public.is_contact_visible_to_user(m.contact_id, v_user);

  if v_contact is null then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  select id into v_pin_id
  from public.message_pins
  where contact_id = v_contact and message_id = p_message_id;

  if v_pin_id is not null then
    return v_pin_id;  -- idempotente: fixar de novo devolve o mesmo id
  end if;

  -- trava por conversa: o limite de 3 nao pode ser furado por dois chamadores
  perform pg_advisory_xact_lock(hashtextextended(v_contact::text, 0));

  select count(*) into v_count
  from public.message_pins
  where contact_id = v_contact;

  if v_count >= 3 then
    raise exception 'pin_limit_reached' using errcode = '23514';
  end if;

  insert into public.message_pins (contact_id, message_id, pinned_by)
  values (v_contact, p_message_id, v_user)
  returning id into v_pin_id;

  insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
  values (v_user, 'message_pinned', 'message', p_message_id,
          jsonb_build_object('contact_id', v_contact, 'pin_id', v_pin_id));

  return v_pin_id;
end;
$$;

create or replace function public.unpin_message(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_removed integer;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id;

  if v_contact is null or not public.is_contact_visible_to_user(v_contact, v_user) then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  delete from public.message_pins
  where contact_id = v_contact and message_id = p_message_id;
  get diagnostics v_removed = row_count;

  if v_removed > 0 then
    insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
    values (v_user, 'message_unpinned', 'message', p_message_id,
            jsonb_build_object('contact_id', v_contact));
  end if;

  return v_removed > 0;
end;
$$;

create or replace function public.report_message(
  p_message_id uuid,
  p_reason text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user    uuid := auth.uid();
  v_contact uuid;
  v_note    text;
  v_id      uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_reason is null or p_reason not in ('spam', 'improprio', 'urgencia', 'outro') then
    raise exception 'invalid_report_reason' using errcode = '22023';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'invalid_report_note' using errcode = '22023';
  end if;

  select m.contact_id into v_contact
  from public.messages m
  where m.id = p_message_id
    and public.is_contact_visible_to_user(m.contact_id, v_user);

  if v_contact is null then
    raise exception 'message_not_visible' using errcode = '42501';
  end if;

  insert into public.message_reports (message_id, reporter_id, reason, note)
  values (p_message_id, v_user, p_reason, v_note)
  on conflict (message_id, reporter_id) do nothing
  returning id into v_id;

  if v_id is null then
    -- ja havia relato deste usuario para esta mensagem: devolve o existente
    select id into v_id
    from public.message_reports
    where message_id = p_message_id and reporter_id = v_user;
  else
    insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
    values (v_user, 'message_reported', 'message', p_message_id,
            jsonb_build_object('report_id', v_id, 'reason', p_reason));
  end if;

  return v_id;
end;
$$;

revoke all on function public.toggle_message_favorite(uuid) from public, anon, authenticated;
revoke all on function public.pin_message(uuid) from public, anon, authenticated;
revoke all on function public.unpin_message(uuid) from public, anon, authenticated;
revoke all on function public.report_message(uuid, text, text) from public, anon, authenticated;

grant execute on function public.toggle_message_favorite(uuid) to authenticated, service_role;
grant execute on function public.pin_message(uuid) to authenticated, service_role;
grant execute on function public.unpin_message(uuid) to authenticated, service_role;
grant execute on function public.report_message(uuid, text, text) to authenticated, service_role;
