-- rollback: drop function if exists public.e2e_fixture_message(text);
--
-- GA11 (docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-15.md):
-- substitui o INSERT/DELETE direto via REST na tabela `messages` pelo E2E
-- logado por uma RPC SECURITY DEFINER — elimina `message_sender_forbidden`.
--
-- Causa: `guard_message_provenance_fields()` (20261006114108) bloqueia INSERT
-- com sender != 'agent' para qualquer `authenticated`; o teardown usava sender
-- 'contact', o que levantava `message_sender_forbidden` no CI.
-- SECURITY DEFINER faz o INSERT rodar como `postgres` (dono da função),
-- que está na lista de bypass do trigger (`current_user IN ('postgres','service_role')`).
--
-- Três exigências, nenhuma cosmética:
--   1. SECURITY DEFINER — `authenticated` não pode inserir sender='contact'.
--   2. Só o contato de fixture — contact_id fixo; evita poluir outras conversas.
--   3. Só o usuário de teste — auth.uid() verificado; sem esse guarda a função
--      seria um INSERT/DELETE genérico para qualquer `authenticated`.

create or replace function public.e2e_fixture_message(p_op text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $e2e_fixture_message$
declare
  v_contato constant uuid := '04dff4dc-c6b1-4283-ac22-bd8639804759';
  v_usuario constant uuid := 'aaa9b766-3b72-403d-95ad-f9cd7301ebca';
  v_linhas  integer;
begin
  if auth.uid() is distinct from v_usuario then
    raise exception 'e2e_fixture_message: chamador nao e o usuario de teste do E2E'
      using errcode = '42501';
  end if;

  if p_op = 'insert' then
    insert into public.messages (contact_id, sender, content, message_type)
    values (v_contato, 'contact', '[E2E fixture setup]', 'text');
    v_linhas := 1;
  elsif p_op = 'delete' then
    delete from public.messages
    where contact_id = v_contato
      and content = '[E2E fixture setup]';
    get diagnostics v_linhas = row_count;
  else
    raise exception 'e2e_fixture_message: op invalida (esperado insert ou delete)'
      using errcode = '22023';
  end if;

  return v_linhas;
end;
$e2e_fixture_message$;

comment on function public.e2e_fixture_message(text) is
  'GA11: insere ou apaga a mensagem de fixture do E2E logado sem violar o trigger de proveniência; restrito ao usuário e contato fixos do E2E.';

revoke all on function public.e2e_fixture_message(text) from public;
grant execute on function public.e2e_fixture_message(text) to authenticated;
