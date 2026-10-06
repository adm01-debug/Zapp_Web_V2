-- recuperacao_gatilho_sem_coluna_removida
-- Rollback: recria a funcao de gatilho com o corpo ANTERIOR EXATO (inclusive a referencia a
--   coluna morta reset_token, que E o defeito) e reafirma o REVOKE. SQL executavel:
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
--   Nenhuma linha de dado foi gravada, alterada ou apagada por esta migration: nao ha dado a desfazer.
--   O gatilho sanitize_reset_request_trigger (BEFORE INSERT) NAO e tocado.
--
-- R2-DB-023 (item 304 / #304): "Trigger de recuperacao ainda escreve campo removido e bloqueia o
-- pedido autenticado". A migration 20260411111454 removeu a coluna reset_token e derrubou os
-- gatilhos hash_reset_token/protect_reset_token_trigger, mas deixou VIVO o gatilho
-- sanitize_reset_request_trigger e o corpo vencedor de public.sanitize_reset_request()
-- (20260410103156): esse corpo escreve `NEW.reset_token := NULL` quando auth.uid() existe. Com a
-- coluna ja removida, o plpgsql levanta `record "new" has no field "reset_token"` ANTES de gravar:
-- TODO INSERT na tabela morre. Como a policy de INSERT e TO authenticated com `user_id = auth.uid()`
-- e a rota /forgot-password nao exclui quem tem sessao, o pedido do usuario LOGADO (payload valido,
-- email do proprio usuario, permitido pela RLS) e abortado pelo gatilho. O pedido de recuperacao
-- autenticado fica indisponivel.
--
-- Correcao: reescreve public.sanitize_reset_request() SEM citar a coluna removida. O gatilho e a
-- fronteira de confianca (o cliente so manda email/reason/user_agent; status/revisao/token sao
-- sempre saneados no servidor) e isso NAO muda.
--
-- Fronteira com R2-AUTH-006 (#72, t_83fab83f, migration 20261006221242): aquele cartao substitui a
-- MESMA funcao (mesmo objeto, achados distintos na auditoria: AUTH006 = lookup anonimo; DB-023 = a
-- relacao entre a coluna removida e o gatilho alcancavel). Como a versao DESTA migration e a MAIS
-- NOVA, o corpo abaixo e o corpo COMPLETO e correto (superset): mantem a sanitizacao do caminho
-- autenticado E a resolucao server-side do caminho sem sessao ja estabelecida la, de modo que
-- reaplicar migrations em ordem de versao nunca regride o pedido anonimo. As duas sao idempotentes
-- entre si (mesmo CREATE OR REPLACE). A policy de INSERT para anon NAO e deste cartao e nao e tocada
-- aqui. Sem DDL de dado, sem ALTER TABLE, sem tocar em policy/gatilho.

CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_canonical_email text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    -- Caminho autenticado: o pedido e sempre do proprio usuario. Os campos de
    -- revisao/token nunca vem do cliente. (A coluna reset_token foi REMOVIDA da
    -- tabela em 20260411111454; cita-la aqui abortava o INSERT inteiro.)
    NEW.token_expires_at := NULL;
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
    NEW.status := 'pending';
  ELSE
    -- Sem sessao: a conta e resolvida AQUI, no servidor, contra auth.users (fonte do
    -- link de reset). Conta inexistente nao grava e nao revela (RETURN NULL).
    SELECT u.id, u.email
      INTO v_user_id, v_canonical_email
      FROM auth.users u
     WHERE lower(btrim(u.email)) = lower(btrim(NEW.email))
     LIMIT 1;

    IF v_user_id IS NULL THEN
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

-- Regra do repo (20261001191230): funcao de gatilho sem EXECUTE para os papeis da API. O gatilho
-- nao confere EXECUTE do chamador no disparo, entao fechar o privilegio nao afeta o funcionamento.
REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated;
