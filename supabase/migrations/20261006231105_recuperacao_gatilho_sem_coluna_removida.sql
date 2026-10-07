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
-- TODO INSERT autenticado morre. Como a policy de INSERT e TO authenticated com `user_id = auth.uid()`
-- e a rota /forgot-password nao exclui quem tem sessao, o pedido do usuario LOGADO (payload valido,
-- email do proprio usuario, permitido pela RLS) e abortado pelo gatilho. O pedido de recuperacao
-- autenticado fica indisponivel.
--
-- Correcao: reescreve public.sanitize_reset_request() SEM citar a coluna removida. A fronteira de
-- confianca do caminho autenticado nao muda: o cliente so manda email/reason/user_agent; status,
-- revisao e token_expires_at continuam saneados no servidor. Sem sessao, a funcao segue devolvendo
-- NEW como antes.
--
-- Fronteira com R2-AUTH-006 (#72): aquele cartao tambem substitui a MESMA funcao por outro motivo.
-- Este cartao nao incorpora o lookup anonimo nem o RETURN NULL daquele escopo; aqui a funcao perde
-- somente a citacao da coluna removida reset_token e preserva o comportamento anterior do caminho
-- sem sessao. A policy de INSERT para anon NAO e deste cartao e nao e tocada aqui. Sem DDL de dado,
-- sem ALTER TABLE, sem tocar em policy/gatilho.

CREATE OR REPLACE FUNCTION public.sanitize_reset_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  END IF;

  RETURN NEW;
END;
$function$;

-- Regra do repo (20261001191230): funcao de gatilho sem EXECUTE para os papeis da API. O gatilho
-- nao confere EXECUTE do chamador no disparo, entao fechar o privilegio nao afeta o funcionamento.
REVOKE EXECUTE ON FUNCTION public.sanitize_reset_request() FROM PUBLIC, anon, authenticated;
