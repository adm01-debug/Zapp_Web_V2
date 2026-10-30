-- recuperacao_anonima_pedido_reset
-- Rollback: recria a funcao de gatilho com o corpo ANTERIOR exato (inclusive a referencia a coluna
--   morta reset_token, que E o defeito), reafirma o REVOKE e derruba a policy nova:
--     CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
--      RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
--     AS $function$
--     BEGIN
--       IF auth.uid() IS NOT NULL THEN
--         NEW.reset_token := NULL;
--         NEW.token_expires_at := NULL;
--         NEW.reviewed_by := NULL;
--         NEW.reviewed_at := NULL;
--         NEW.rejection_reason := NULL;
--         NEW.status := 'pending';
--       END IF;
--       RETURN NEW;
--     END;
--     $function$;
--     REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated;
--     DROP POLICY IF EXISTS "Anon can file a password reset request" ON public.password_reset_requests;
--   Nenhuma linha de dado foi gravada, alterada ou apagada por esta migration: nao ha dado a desfazer.
--
-- R2-AUTH-006 (item 72 / #72c): "Recuperacao anonima consulta profiles protegido e nao cria
-- solicitacao". A tela /forgot-password (pessoa SEM sessao) montava o pedido no cliente:
--   1) lia a conta por `profiles` (policies SELECT sao TO authenticated) -> 0 linhas para anon;
--   2) com a conta "inexistente", mostrava sucesso generico e NUNCA chegava ao INSERT;
--   3) mesmo chegando, o INSERT nao tinha caminho: a policy de INSERT e TO authenticated com
--      `user_id = auth.uid()` e o anon nao tem como (nem deve) descobrir o user_id;
--   4) e o gatilho BEFORE INSERT public.sanitize_reset_request() ainda escrevia em
--      NEW.reset_token, coluna REMOVIDA em 20260827170000_drop_dead_reset_token_subsystem:
--      TODO INSERT na tabela morria com `record "new" has no field "reset_token"` (defeito medido
--      no banco local tambem no caminho authenticated, ver .tmp/exp4.sql).
-- Resultado: o pedido real nunca era entregue ao administrador.
--
-- Correcao (fronteira server-side anonima, sem expor existencia de conta e sem abrir funcao
-- SECURITY DEFINER para anon — o que a guarda scripts/db-audit/check-secdef-public-execute.sql
-- proibe):
--   a) public.sanitize_reset_request() deixa de citar a coluna morta reset_token e passa a
--      resolver a identidade NO SERVIDOR quando nao existe sessao (auth.uid() IS NULL).
--      O cliente anonimo envia SO email/reason/user_agent; user_id e email canonicos vem de
--      auth.users. Conta inexistente ou conta com 3 pendentes na ultima hora -> devolve NULL:
--      nada e gravado e a resposta publica e a mesma (nao enumera emails nem limite). O caminho
--      authenticated fica identico ao anterior e continua passando pelo rate_limit_reset_requests().
--   b) policy de INSERT TO anon em public.password_reset_requests: a tabela ja concede INSERT a
--      anon, faltava a policy. O WITH CHECK so aceita a linha canonica que o gatilho produz
--      (pedido pendente, sem campos de revisao/token) — o gatilho e a fronteira, e o remendo
--      impede que um INSERT direto se disfarce de pedido ja revisado.
--   c) REVOKE EXECUTE da funcao de gatilho (regra do repo 20261001191230): gatilho nao confere
--      EXECUTE do chamador no disparo, entao fechar o privilegio nao afeta o disparo.

CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_canonical_email text;
  v_pending_count integer;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Caminho autenticado: inalterado (o pedido e sempre do proprio usuario).
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  ELSE
    -- Fronteira anonima (/forgot-password): o cliente informa somente o email; a conta e
    -- resolvida AQUI, no servidor, contra auth.users (fonte do link de reset que o
    -- administrador gera). Nada de profiles (o email de profiles pode estar nulo/divergente).
    SELECT u.id, u.email
      INTO v_user_id, v_canonical_email
      FROM auth.users u
     WHERE lower(btrim(u.email)) = lower(btrim(NEW.email))
     LIMIT 1;

    IF v_user_id IS NULL THEN
      -- Conta inexistente: nao persiste e nao revela (mesma resposta publica).
      RETURN NULL;
    END IF;

    SELECT COUNT(*)
      INTO v_pending_count
      FROM public.password_reset_requests
     WHERE user_id = v_user_id
       AND status = 'pending'
       AND created_at > now() - interval '1 hour';

    IF v_pending_count >= 3 THEN
      -- Conta existente, mas limitada: mesmo resultado publico de conta inexistente.
      RETURN NULL;
    END IF;

    NEW.user_id := v_user_id;
    NEW.email := v_canonical_email;
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$function$;

-- Gatilho nao e RPC: nao precisa (nem pode) ter EXECUTE para os papeis da API.
REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated;

-- Caminho anonimo de escrita: a tabela ja concede INSERT a anon; faltava a policy.
DROP POLICY IF EXISTS "Anon can file a password reset request" ON public.password_reset_requests;
CREATE POLICY "Anon can file a password reset request"
  ON public.password_reset_requests
  FOR INSERT
  TO anon
  WITH CHECK (
    user_id IS NOT NULL
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
    AND token_expires_at IS NULL
  );
