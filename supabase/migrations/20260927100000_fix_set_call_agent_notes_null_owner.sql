-- Correção de segurança (27/09, achado da auditoria de 5 agentes pós-deploy do
-- 20260926900000_fix_set_call_agent_notes_null_profile.sql — CRÍTICO, mesmo
-- padrão do bug anterior, ângulo diferente).
--
-- A correção anterior tratou v_profile (perfil do CHAMADOR) NULL, mas não
-- tratou v_owner (dono da CHAMADA, calls.agent_id) NULL. calls.agent_id
-- aceita NULL (FK ON DELETE SET NULL) e há chamadas reais em produção com
-- agent_id NULL (inbound sem agente atribuído ainda). Para essas chamadas,
-- "if not (v_owner = v_profile or is_admin_or_supervisor(...))" avalia
-- v_owner = v_profile como NULL (NULL = uuid); se o chamador não é
-- admin/supervisor, "NULL or false" também é NULL, e "IF NULL THEN" é
-- tratado como falso em PL/pgSQL — o bloco de exceção era pulado e
-- QUALQUER authenticated com perfil (não precisa ser dono nem admin)
-- conseguia sobrescrever agent_notes de uma chamada sem dono atribuído.
-- Confirmado ao vivo: 10 das 22 chamadas em produção têm agent_id NULL, e
-- "(NOT (NULL::uuid = gen_random_uuid() OR false)) IS NULL" = true.
--
-- Fix: coalesce(v_owner = v_profile, false) força FALSE quando v_owner é
-- NULL (chamada sem dono só pode ser anotada por admin/supervisor), em vez
-- de deixar a comparação virar NULL e escapar do IF. upsert_my_call não
-- tem o mesmo problema porque usa "WHERE calls.agent_id = v_profile" (um
-- WHERE com NULL nunca "passa" por engano) seguido de "v_id is null" como
-- guarda, não uma comparação direta dentro de IF.
--
-- Arquivo NOVO, não editando 20260926900000_fix_set_call_agent_notes_null_profile.sql
-- (já mergeada em main — guard "Rejeitar edicao de migration ja existente"
-- de .github/workflows/db-guard.yml bloqueia editar migration existente).

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
  'Grava somente agent_notes (anotação humana) na chamada do dono ou por admin/supervisor. Apêndice B.4. Corrigido 2x: exige perfil do chamador (v_profile not null, ver 20260926900000) e trata dono NULL como não-dono via coalesce (ver 20260927100000) — chamada sem agent_id só pode ser anotada por admin/supervisor.';
