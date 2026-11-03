create or replace function public.set_call_agent_notes(p_call_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_profile uuid;
  v_owner uuid;
begin
  select pr.id into v_profile from public.profiles pr where pr.user_id = auth.uid();
  if v_profile is null then
    raise exception 'perfil nao encontrado para o usuario autenticado' using errcode = '42501';
  end if;
  select c.agent_id into v_owner from public.calls c where c.id = p_call_id;
  if not found then
    raise exception 'chamada nao encontrada' using errcode = 'P0002';
  end if;
  if not (coalesce(v_owner = v_profile, false) or public.is_admin_or_supervisor(auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.calls set agent_notes = p_notes where id = p_call_id;
end;
$$;

comment on function public.set_call_agent_notes is
  'Grava somente agent_notes (anotação humana) na chamada do dono ou por admin/supervisor. Apêndice B.4. Corrigido 2x: exige perfil do chamador (v_profile not null, ver 20260926900000) e trata dono NULL como não-dono via coalesce (ver 20260927100000) — chamada sem agent_id só pode ser anotada por admin/supervisor.'
