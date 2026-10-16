-- passkey_credentials_policies_endurecer
-- Rollback: recria a policy "Users can insert own passkeys" (definicao de
--           20260317222728, FOR INSERT TO authenticated WITH CHECK user_id = auth.uid())
--           e remove o gatilho e a funcao de guarda criados por esta migration.
--           Nenhum dado e alterado por esta migration, entao nao ha dado a restaurar.
-- Rollback (SQL executavel, na ordem):
--   drop trigger if exists passkey_credentials_guard_sensitive_columns on public.passkey_credentials;
--   drop function if exists public.passkey_credentials_guard_sensitive_columns();
--   create policy "Users can insert own passkeys" on public.passkey_credentials for insert to authenticated with check (user_id = auth.uid());
--
-- Endurecimento das policies de public.passkey_credentials (cartao t_45a3a4b4, pedido
-- pela Edge t_b0415cc5).
--
-- CONTEXTO: a Edge Function `webauthn` grava/le a tabela SEMPRE pelo client service_role
-- (admin); o cliente autenticado (browser) so faz SELECT na listagem, DELETE para remover
-- uma passkey e UPDATE para renomear (`friendly_name`) — `src/hooks/auth/useWebAuthn.ts`.
--
-- 1) INSERT por `authenticated`: policy removida. O cliente nunca insere (quem insere e a
--    Edge, como service_role). Enquanto ela existia, uma sessao comprometida podia gravar
--    uma credencial forjada (public_key arbitraria) direto na tabela, contornando a
--    verificacao de attestation da Edge.
DROP POLICY IF EXISTS "Users can insert own passkeys" ON public.passkey_credentials;

-- 2) UPDATE por `authenticated`: a RLS nao restringe coluna, entao a trava e um gatilho
--    BEFORE UPDATE. O rename de `friendly_name` continua passando; alterar public_key,
--    counter, credential_id ou user_id pelo cliente nao passa. A Edge (service_role),
--    as migrations e o dono (postgres) seguem livres.
CREATE OR REPLACE FUNCTION public.passkey_credentials_guard_sensitive_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') THEN
    IF NEW.public_key IS DISTINCT FROM OLD.public_key
       OR NEW.counter IS DISTINCT FROM OLD.counter
       OR NEW.credential_id IS DISTINCT FROM OLD.credential_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'passkey_sensitive_column_not_updatable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS passkey_credentials_guard_sensitive_columns ON public.passkey_credentials;
CREATE TRIGGER passkey_credentials_guard_sensitive_columns
  BEFORE UPDATE ON public.passkey_credentials
  FOR EACH ROW
  EXECUTE FUNCTION public.passkey_credentials_guard_sensitive_columns();

-- SELECT e DELETE (usados pelo cliente) ficam como estao, por pedido do cartao.
