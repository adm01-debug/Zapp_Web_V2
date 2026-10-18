-- rollback: drop function if exists public.e2e_cleanup_conversation_closures();
--
-- E25 (docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-01.md, achado G-09):
-- tira a chave mestra do banco (SUPABASE_SERVICE_ROLE_KEY) do teardown do E2E logado.
--
-- O passo "E2E teardown - limpar fixture de conversation_closures" do
-- .github/workflows/e2e-logado.yml apagava a linha de teste com um `curl DELETE`
-- autenticado pela service role -- a chave que ignora RLS e vale para o banco
-- inteiro, disponivel em um job que tambem roda `bun install`. A RPC abaixo faz a
-- MESMA limpeza com o JWT do proprio usuario de teste; a service role sai do CI.
--
-- As tres exigencias da RPC, e nenhuma delas e cosmetica:
--   1. SECURITY DEFINER -- `authenticated` nao tem DELETE em conversation_closures
--      (o CT-02 deixou so SELECT/INSERT), entao o DELETE precisa de privilegio
--      proprio da funcao.
--   2. so o contato de fixture -- `contact_id` fixo do contato de teste
--      ([E2E] Contato de teste - nao apagar; e2e/fixtures/e2e-contact.ts).
--   3. so o usuario de teste -- `auth.uid()` tem de ser o usuario de CI
--      (aaa9b766-3b72-403d-95ad-f9cd7301ebca), o mesmo dono do contato das
--      migrations de fixture (20261003182707). Sem esta trava a funcao seria um
--      DELETE generico de conversation_closures para qualquer `authenticated`.
--
-- Idempotente: DELETE escopado por `contact_id` exato; reexecutar nao altera nada.

create or replace function public.e2e_cleanup_conversation_closures()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $e2e_cleanup_conversation_closures$
declare
  v_contato constant uuid := '04dff4dc-c6b1-4283-ac22-bd8639804759';
  v_usuario constant uuid := 'aaa9b766-3b72-403d-95ad-f9cd7301ebca';
  v_apagadas integer;
begin
  if auth.uid() is distinct from v_usuario then
    raise exception 'e2e_cleanup_conversation_closures: chamador nao e o usuario de teste do E2E'
      using errcode = '42501';
  end if;

  delete from public.conversation_closures where contact_id = v_contato;
  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$e2e_cleanup_conversation_closures$;

comment on function public.e2e_cleanup_conversation_closures() is
  'E25: limpa a fixture de conversation_closures do E2E logado sem a service role; so o usuario de teste do E2E (auth.uid()) e so o contato fixo do fixture.';

revoke all on function public.e2e_cleanup_conversation_closures() from public;
grant execute on function public.e2e_cleanup_conversation_closures() to authenticated;
