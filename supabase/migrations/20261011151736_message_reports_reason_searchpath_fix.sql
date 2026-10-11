-- message_reports_reason_searchpath_fix (INB-246, refazer 2)
-- Rollback: ALTERs inversos de search_path/CHECK + corpo anterior de report_message (bloco comentado no fim).
-- Correção da migration 20261011125915 (já aplicada no banco local da tarefa,
-- por isso não foi editada): alinha ao cartão (O QUE FAZER item 3 e REGRAS DE BANCO).
--   1. message_reports.reason passa a aceitar exatamente
--      ('spam','improprio','urgencia','outro') — antes estava 'conteudo_improprio'
--      no lugar de 'improprio', no CHECK e na validação de report_message().
--   2. As 5 funções SECURITY DEFINER passam a usar
--      SET search_path = pg_catalog, public (antes public, pg_temp).
-- Privilégios (REVOKE/GRANT) foram criados certos na migration anterior e ficam
-- como estão; CREATE OR REPLACE preserva os privilégios existentes.
--
-- Rollback: inverte os ALTERs abaixo e reaplica o corpo anterior de report_message (bloco comentado no fim do arquivo).
-- Rollback (SQL executável, na ordem — restaura o estado da migration anterior):
--   alter function public.toggle_message_favorite(uuid) set search_path = public, pg_temp;
--   alter function public.pin_message(uuid) set search_path = public, pg_temp;
--   alter function public.unpin_message(uuid) set search_path = public, pg_temp;
--   alter function public.message_pins_force_contact_id() set search_path = public, pg_temp;
--   alter table public.message_reports drop constraint if exists message_reports_reason_check;
--   alter table public.message_reports add constraint message_reports_reason_check check (reason in ('spam', 'conteudo_improprio', 'urgencia', 'outro'));
--   (report_message: reaplicar o corpo com a lista antiga — ver bloco comentado no fim;
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

-- ===================== Rollback: corpo anterior de report_message =====================
-- (Descomente e execute para reverter o item 2 junto com os ALTERs do cabeçalho.
-- Corpo idêntico ao aplicado pela migration anterior: lista antiga + search_path antigo.)
-- create or replace function public.report_message(
--   p_message_id uuid,
--   p_reason text,
--   p_note text default null
-- )
-- returns uuid
-- language plpgsql
-- security definer
-- set search_path = public, pg_temp
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
--   if p_reason is null or p_reason not in ('spam', 'conteudo_improprio', 'urgencia', 'outro') then
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
