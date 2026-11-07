-- rollback: drop function if exists public.e2e_fixture_message(text);
--
-- GA11 (plano de GitHub Actions, fase 0 — P0): fixture E2E sem violar o
-- trigger de proveniencia (`guard_message_provenance_fields`, 20261006114108).
--
-- A fixture inseria `messages` com `sender='contact'` por REST: o trigger
-- recusa (HTTP 403 `message_sender_forbidden`), 16–22 vezes por run, e a
-- suite logada estoura o `--global-timeout` desde 06/10 (0 sucessos em 7 dias).
--
-- A RPC abaixo faz a MESMA insercao com o JWT do proprio usuario de teste,
-- no mesmo padrao da `e2e_cleanup_conversation_closures` (20261009142650):
--   1. SECURITY DEFINER — roda como owner (bypassa o trigger, como
--      `postgres`/`service_role`); `authenticated` nao insere `sender=contact`.
--   2. so o contato de fixture — `contact_id` fixo do contato de teste
--      ([E2E] Contato de teste - nao apagar; e2e/fixtures/e2e-contact.ts).
--   3. so o usuario de teste — `auth.uid()` tem de ser o usuario de CI
--      (aaa9b766-3b72-403d-95ad-f9cd7301ebca). Sem esta trava a funcao seria
--      um INSERT generico em `messages` para qualquer `authenticated`.
--   4. conteudo fixo `[E2E fixture setup]` — insert e cleanup operam so
--      nessas linhas; reexecutar nao duplica nada fora do escopo.
--
-- `p_op='insert'` insere 1 mensagem fresca (inbox visivel); `p_op='cleanup'`
-- apaga as mensagens do fixture. DDL entra no lote (GA07); ate o apply, a
-- fixture cai de volta para o modo legado (ver e2e-contact.ts).

create or replace function public.e2e_fixture_message(p_op text default 'insert')
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $e2e_fixture_message$
declare
  v_contato constant uuid := '04dff4dc-c6b1-4283-ac22-bd8639804759';
  v_usuario constant uuid := 'aaa9b766-3b72-403d-95ad-f9cd7301ebca';
  v_conteudo constant text := '[E2E fixture setup]';
  v_afetadas integer := 0;
begin
  if auth.uid() is distinct from v_usuario then
    raise exception 'e2e_fixture_message: chamador nao e o usuario de teste do E2E'
      using errcode = '42501';
  end if;

  if p_op = 'cleanup' then
    delete from public.messages
    where contact_id = v_contato and content = v_conteudo;
    get diagnostics v_afetadas = row_count;
    return v_afetadas;
  elsif p_op = 'insert' then
    insert into public.messages (contact_id, sender, content, message_type)
    values (v_contato, 'contact', v_conteudo, 'text');
    return 1;
  else
    raise exception 'e2e_fixture_message: op invalida (use insert|cleanup)'
      using errcode = '22023';
  end if;
end;
$e2e_fixture_message$;

comment on function public.e2e_fixture_message(text) is
  'GA11: insere/apaga a mensagem [E2E fixture setup] do E2E logado sem violar o trigger de proveniencia; so o usuario de teste do E2E (auth.uid()), so o contato fixo do fixture e so o conteudo do fixture.';

revoke all on function public.e2e_fixture_message(text) from public;
grant execute on function public.e2e_fixture_message(text) to authenticated;
