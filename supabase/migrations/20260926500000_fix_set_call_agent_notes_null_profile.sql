-- Correção de segurança (26/09, achado de auditoria de 5 agentes — CRÍTICO,
-- corrigido antes do apply de 20260926300000_calls_telefonia_v2.sql).
--
-- set_call_agent_notes tinha bypass de autorização: se o auth.uid() do
-- chamador não tem linha em public.profiles (v_profile fica NULL), o teste
-- "if not (v_owner = v_profile or is_admin_or_supervisor(...))" avalia para
-- NULL (nem TRUE nem FALSE) — em PL/pgSQL "IF NULL THEN" é tratado como
-- falso, então o bloco de exceção era pulado silenciosamente e o UPDATE
-- rodava: qualquer authenticated sem perfil sobrescrevia agent_notes de
-- qualquer chamada de qualquer agente, sem ser dono nem admin/supervisor.
-- upsert_my_call já tinha a guarda certa; esta migration aplica o mesmo
-- padrão a set_call_agent_notes. Arquivo novo (não edita
-- 20260926300000_calls_telefonia_v2.sql, que já está mergeada em main —
-- ver .github/workflows/db-guard.yml, guard "Rejeitar edicao de migration
-- ja existente").
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
  if not (v_owner = v_profile or public.is_admin_or_supervisor(auth.uid())) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.calls set agent_notes = p_notes where id = p_call_id;
end;
$$;

comment on function public.set_call_agent_notes is
  'Grava somente agent_notes (anotação humana) na chamada do dono ou por admin/supervisor. Apêndice B.4. Corrigido: exige perfil (v_profile not null) antes de comparar dono, ver 20260926500000.';
