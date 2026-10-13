-- profile_deactivate_ban
-- Rollback: dropa o trigger e a função criados por este arquivo; o trigger de revogação de sessões (20261004181921) permanece intacto.
-- Rollback (SQL executável, na ordem; o teste scripts/db-audit/revoke-auth-sessions.test.sh executa estas linhas):
--   drop trigger if exists trg_profile_deactivate_ban on public.profiles;
--   drop function if exists public.trg_profile_deactivate_ban();
-- Complementa o PD-02 (20261004181921_revoke_auth_sessions): desativar um perfil
-- (public.profiles.is_active = false) passa a BANIR o usuário no Auth real
-- (auth.users.banned_until no futuro), de modo que tokens já emitidos não possam
-- ser renovados e caminhos que não passam pela Edge auth-login (Google, passkey,
-- OTP) também fiquem barrados. Reativar o perfil limpa o ban.
-- Trigger próprio e idempotente: só age quando is_active MUDA de valor; a
-- revogação de sessões continua no trigger já existente.

-- 1. Função de ban/unban no Auth real. SECURITY DEFINER para escrever em
-- auth.users (schema não exposto ao cliente). search_path fixo.
CREATE OR REPLACE FUNCTION public.trg_profile_deactivate_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Só dispara em mudança REAL do valor (evita trabalho em update sem efeito).
  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    IF NEW.is_active = false THEN
      -- Bane o usuário: banned_until no futuro. O WHERE evita reescrever a
      -- linha quando já está banida por esta via (operação idempotente).
      UPDATE auth.users
         SET banned_until = now() + interval '100 years'
       WHERE id = NEW.user_id
         AND (banned_until IS NULL OR banned_until < now() + interval '100 years');
    ELSE
      -- Reativação libera o usuário.
      UPDATE auth.users
         SET banned_until = NULL
       WHERE id = NEW.user_id
         AND banned_until IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function nunca é chamada direto pelo cliente; fecha o EXECUTE padrão.
REVOKE ALL ON FUNCTION public.trg_profile_deactivate_ban() FROM PUBLIC, anon, authenticated;

-- 2. Trigger no MESMO evento do trigger de revogação de sessões (is_active).
-- Idempotente: recria sem duplicar.
DROP TRIGGER IF EXISTS trg_profile_deactivate_ban ON public.profiles;
CREATE TRIGGER trg_profile_deactivate_ban
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_deactivate_ban();
