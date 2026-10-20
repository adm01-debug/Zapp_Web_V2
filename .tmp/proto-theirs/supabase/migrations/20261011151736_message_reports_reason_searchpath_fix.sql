-- message_reports_reason_searchpath_fix (INB-246, refazer 2)
-- Rollback: no diff final, a migration 20261011125915 já contém os mesmos valores
-- corretos; portanto o rollback desta migration redundante reaplica o estado correto
-- (CHECK com 'improprio' e search_path = pg_catalog, public) e não volta a um estado
-- intermediário da rodada anterior.
-- Correção redundante/safety net da migration 20261011125915: alinha ao cartão
-- (O QUE FAZER item 3 e REGRAS DE BANCO) caso esta migration seja aplicada sobre
-- uma tentativa intermediária, mas no diff final a migration original já está correta.
--   1. message_reports.reason aceita exatamente
--      ('spam','improprio','urgencia','outro') no CHECK e em report_message().
--   2. As 5 funções SECURITY DEFINER usam SET search_path = pg_catalog, public.
-- Privilégios (REVOKE/GRANT) foram criados certos na migration anterior e ficam
-- como estão; CREATE OR REPLACE preserva os privilégios existentes.
--
-- Rollback: reexecuta o estado correto da migration original final (no-op seguro).
-- Rollback (SQL executável, na ordem):
--   alter function public.toggle_message_favorite(uuid) set search_path = pg_catalog, public;
--   alter function public.pin_message(uuid) set search_path = pg_catalog, public;
--   alter function public.unpin_message(uuid) set search_path = pg_catalog, public;
--   alter function public.message_pins_force_contact_id() set search_path = pg_catalog, public;
--   alter table public.message_reports drop constraint if exists message_reports_reason_check;
--   alter table public.message_reports add constraint message_reports_reason_check check (reason in ('spam', 'improprio', 'urgencia', 'outro'));
--   (report_message: reaplicar o corpo correto — ver bloco comentado no fim;
--   CREATE OR REPLACE abaixo preserva REVOKE/GRANT, então o rollback não os toca.)

-- ===================== 1. search_path das 4 funções =====================
alter function public.toggle_message_favorite(uuid) set search_path = pg_catalog, public;
alter function public.pin_message(uuid) set search_path = pg_catalog, public;
alter function public.unpin_message(uuid) set search_path = pg_catalog, public;
alter function public.message_pins_force_contact_id() set search_path = pg_catalog, public;

-- ===================== 2. report_message: corpo com a lista do cartão =====================
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

-- ===================== 3. CHECK do reason com os valores do cartão =====================
alter table public.message_reports drop constraint if exists message_reports_reason_check;
alter table public.message_reports add constraint message_reports_reason_check check (reason in ('spam', 'improprio', 'urgencia', 'outro'));

-- ===================== Rollback: corpo correto de report_message =====================
-- (Descomente e execute junto com os ALTERs do cabeçalho. No diff final, este corpo
-- é idêntico ao estado correto da migration original, então o rollback é no-op seguro.)
-- create or replace function public.report_message(
--   p_message_id uuid,
--   p_reason text,
--   p_note text default null
-- )
-- returns uuid
-- language plpgsql
-- security definer
-- set search_path = pg_catalog, public
-- as $$
-- declare
--   v_user    uuid := auth.uid();
--   v_contact uuid;
--   v_note    text;
--   v_id      uuid;
-- begin
--   if v_user is null then
--     raise exception 'not_authenticated' using errcode = '42501';
--   end if;
--   if p_reason is null or p_reason not in ('spam', 'improprio', 'urgencia', 'outro') then
--     raise exception 'invalid_report_reason' using errcode = '22023';
--   end if;
--   v_note := nullif(btrim(coalesce(p_note, '')), '');
--   if v_note is not null and char_length(v_note) > 500 then
--     raise exception 'invalid_report_note' using errcode = '22023';
--   end if;
--   select m.contact_id into v_contact
--   from public.messages m
--   where m.id = p_message_id
--     and public.is_contact_visible_to_user(m.contact_id, v_user);
--   if v_contact is null then
--     raise exception 'message_not_visible' using errcode = '42501';
--   end if;
--   insert into public.message_reports (message_id, reporter_id, reason, note)
--   values (p_message_id, v_user, p_reason, v_note)
--   on conflict (message_id, reporter_id) do nothing
--   returning id into v_id;
--   if v_id is null then
--     select id into v_id
--     from public.message_reports
--     where message_id = p_message_id and reporter_id = v_user;
--   else
--     insert into public.audit_logs (user_id, action, entity_type, entity_id, details)
--     values (v_user, 'message_reported', 'message', p_message_id,
--             jsonb_build_object('report_id', v_id, 'reason', p_reason));
--   end if;
--   return v_id;
-- end;
-- $$;
