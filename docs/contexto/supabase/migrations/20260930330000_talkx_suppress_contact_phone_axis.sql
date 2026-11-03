create or replace function public.talkx_suppress_contact(
  p_contact_id uuid,
  p_phone text,
  p_reason text,
  p_reason_code public.talkx_blacklist_reason,
  p_origin text,
  p_source_message_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service_role_required' using errcode = '42501';
  end if;

  insert into public.talkx_blacklist
    (contact_id, phone, reason, reason_code, origin, source_message_id)
  values
    (p_contact_id, p_phone, p_reason, p_reason_code, p_origin, p_source_message_id)
  on conflict do nothing
  returning id into v_id;

  return v_id; -- NULL => já havia supressão ATIVA (idempotente, em qualquer eixo)
end;
$fn$

revoke all on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  from public, anon, authenticated

grant execute on function public.talkx_suppress_contact(uuid, text, text, public.talkx_blacklist_reason, text, uuid)
  to service_role
