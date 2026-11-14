-- reaplica_update_own_profile_sem_email
-- Rollback: remove a versao de 5 parametros e recria a de 6 parametros (com p_email) exatamente
-- como estava em producao em 2026-11-14 (corpo quebrado: display_name inexistente, text em date),
-- com search_path public, pg_temp e EXECUTE so para authenticated/service_role.
-- Rollback (SQL executavel, na ordem):
--   drop function if exists public.update_own_profile(text, text, text, text, text);
--   create or replace function public.update_own_profile(p_display_name text default null, p_avatar_url text default null, p_phone text default null, p_email text default null, p_signature text default null, p_birthday text default null) returns boolean language plpgsql security definer set search_path = public, pg_temp as $fn$ declare v_profile_id uuid; begin select id into v_profile_id from profiles where user_id = auth.uid(); if v_profile_id is null then return false; end if; update profiles set display_name = coalesce(p_display_name, display_name), avatar_url = coalesce(p_avatar_url, avatar_url), phone = coalesce(p_phone, phone), email = coalesce(p_email, email), signature = coalesce(p_signature, signature), birthday = coalesce(p_birthday, birthday), updated_at = now() where id = v_profile_id; return true; end; $fn$;
--   revoke all on function public.update_own_profile(text, text, text, text, text, text) from public, anon;
--   grant execute on function public.update_own_profile(text, text, text, text, text, text) to authenticated, service_role;
--
-- Por que existe: 20261014023945_update_own_profile_sem_email esta registrada no ledger
-- (supabase_migrations.schema_migrations) com `statements` NULL e o estado vivo NAO bate com o
-- arquivo. Prova (SELECT no projeto oficial, 2026-11-14 01:23 UTC):
--   * pg_proc de public.update_own_profile: 1 sobrecarga so, a ANTIGA de 6 parametros
--     (p_display_name, p_avatar_url, p_phone, p_email, p_signature, p_birthday);
--     md5(pg_get_functiondef) = 80d677d192b1c6f947b399101158afb6;
--   * o corpo vivo faz `display_name = COALESCE(p_display_name, display_name)`,
--     `email = COALESCE(p_email, email)` e `birthday = COALESCE(p_birthday, birthday)`;
--   * information_schema.columns: public.profiles NAO tem display_name (tem name text NOT NULL)
--     e birthday e date.
-- Efeito hoje: o hook src/hooks/auth/useSecureProfile.ts (5 parametros nomeados, sem p_email)
-- resolve para a versao de 6 (p_email cai no default) e a chamada estoura 42703
-- (column "display_name" does not exist) — editar o proprio perfil por esta RPC falha sempre.
-- O caminho de troca do proprio e-mail (R2-DB-030) segue declarado na assinatura viva; hoje so nao
-- grava porque a funcao inteira quebra antes do UPDATE — consertar o corpo sem tirar p_email abriria
-- a brecha.
--
-- O que faz: reaplica 20261014023945 (dropa a assinatura de 6, cria a de 5 sem p_email, mapeia
-- p_display_name -> name e converte p_birthday para date; REVOKE de PUBLIC/anon e EXECUTE para
-- authenticated/service_role). Corpo byte-identico ao arquivo original, com UMA diferenca
-- deliberada: `SET search_path = public, pg_temp` em vez de `public`. O endurecimento com pg_temp
-- (20261011003027_funcoes_definer_pg_temp_search_path) ja esta em vigor nesta funcao em producao;
-- reaplicar `public` puro desfaria esse reparo de seguranca.
-- Sem reparo de dados. Nada depende da assinatura antiga (pg_depend vazio); a unica chamadora e o
-- hook acima, que ja usa a assinatura nova. Idempotente: DROP IF EXISTS + CREATE OR REPLACE +
-- REVOKE/GRANT.

DROP FUNCTION IF EXISTS public.update_own_profile(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.update_own_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_signature TEXT DEFAULT NULL,
  p_birthday TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET
    name = COALESCE(p_display_name, name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    phone = COALESCE(p_phone, phone),
    signature = COALESCE(p_signature, signature),
    birthday = COALESCE(NULLIF(p_birthday, '')::date, birthday),
    updated_at = now()
  WHERE id = v_profile_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_profile(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_profile(text, text, text, text, text) TO authenticated, service_role;
