-- admin_unlock_login
-- Rollback: dropa a RPC nova; nenhuma tabela, coluna, gatilho ou ACL existente e tocada.
-- Rollback (SQL executável, na ordem):
--   drop function if exists public.admin_unlock_login(text);
--
-- LA — o painel de tentativas de login (LA1/LA2) mostra QUEM esta bloqueado, mas
-- nao havia caminho nenhum para o ADMIN destravar uma conta sem ir ao banco. A
-- unica funcao existente, public.clear_login_attempts(text), apaga a linha de
-- public.login_attempts sem exigir papel nenhum alem de `authenticated` (a
-- 20260827130600 so tirou o anon/PUBLIC): quem destrava hoje e o proprio usuario
-- apos um login bem-sucedido, nunca um admin, e nada fica registrado. Este cartao
-- cria a RPC administrativa, com guard de admin e trilha de auditoria.
--
-- CONTRATO
--   public.admin_unlock_login(p_email text) returns void
--   - exige JWT de usuario com role 'admin' em public.user_roles (public.is_admin).
--     Sem isso: raise 'admin_required' SQLSTATE 42501, ANTES de qualquer efeito.
--   - valida a entrada ANTES do efeito: e-mail NULL/vazio -> raise 'invalid_email'
--     SQLSTATE 22023 (mesmo vocabulario de validacao de ai_jobs).
--   - normaliza o e-mail (btrim + lower), o mesmo formato com que
--     record_failed_login/is_account_locked gravam e leem public.login_attempts
--     (UNIQUE(email)), e apaga a linha — o DELETE zera attempt_count e
--     locked_until de uma vez, sem UPDATE (nao dispara gatilho de updated_at e
--     nao ha linha parcial a reescrever).
--   - sem linha para o e-mail (conta ja destravada): no-op silencioso, SEM
--     auditoria — nao houve mudanca a registrar. O admin confere o resultado
--     pela propria lista de tentativas (LA1/LA2).
--   - auditoria: exatamente 1 linha por destravamento REAL em public.audit_logs
--     (action='login_unlock', entity_type='login_attempts',
--     user_id = auth.uid() = QUEM destravou, entity_id = id da linha apagada).
--     O log NAO guarda o e-mail completo: grava email_masked
--     (1o caractere do local-part + dominio) e quantas tentativas havia / se
--     estava bloqueado.
--
-- SEGURANCA
--   SECURITY DEFINER + search_path fixo ('public', 'pg_temp') para nao depender
--   do search_path de quem chama. O DELETE roda como owner (postgres, dono da
--   tabela) e nao ha FORCE ROW LEVEL SECURITY em public.login_attempts: a RLS
--   (hoje DELETE liberado por is_admin_or_supervisor em "Only admins can delete
--   login attempts") NAO se aplica a esta funcao. Por isso a barreira tem de ser
--   o guard INTERNO — e e ele que faz a RPC ser mais estrita que o DELETE direto.
--   ACL: REVOKE de PUBLIC e anon; so `authenticated` executa (o admin da app usa
--   o proprio JWT). Nao ha grant novo para service_role: o guard exige
--   auth.uid() e o claim nao esta la, entao conceder seria ACL morta.
--   Nao ha funcao-overload novo: a assinatura e unica.
--   Sem BEGIN/COMMIT: o gateway aplica a migration numa unica transacao.

CREATE OR REPLACE FUNCTION public.admin_unlock_login(p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_email        text := lower(btrim(p_email));
  v_attempt_id   uuid;
  v_attempts     integer;
  v_locked_until timestamptz;
BEGIN
  -- Autorizacao ANTES de qualquer efeito: um nao-admin nao pode inferir o
  -- estado da conta pelo silencio da RPC.
  IF NOT public.is_admin(v_actor) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.login_attempts
  WHERE email = v_email
  RETURNING id, attempt_count, locked_until
  INTO v_attempt_id, v_attempts, v_locked_until;

  IF NOT FOUND THEN
    RETURN;  -- nada a destravar: sem efeito, sem trilha
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_actor,
    'login_unlock',
    'login_attempts',
    v_attempt_id,
    jsonb_build_object(
      'email_masked', CASE
        WHEN position('@' IN v_email) > 0
          THEN left(split_part(v_email, '@', 1), 1) || '***@' || split_part(v_email, '@', 2)
        ELSE '***'
      END,
      'attempts', v_attempts,
      'was_locked', (v_locked_until IS NOT NULL AND v_locked_until > now())
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unlock_login(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_unlock_login(text) TO authenticated;
