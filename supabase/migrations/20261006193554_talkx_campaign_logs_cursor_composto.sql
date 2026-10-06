-- talkx_campaign_logs_cursor_composto
-- Rollback: DROP FUNCTION IF EXISTS public.talkx_campaign_logs(uuid, timestamptz, integer, uuid); CREATE FUNCTION public.talkx_campaign_logs(p_campaign_id uuid, p_after timestamptz DEFAULT NULL, p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, campaign_id uuid, recipient_id uuid, attempt integer, stage text, outcome text, http_status integer, error_code text, worker_id text, duration_ms integer, created_at timestamptz) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE v_limit integer; BEGIN IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501'; END IF; IF p_campaign_id IS NULL THEN RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023'; END IF; v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000); RETURN QUERY SELECT l.id, l.campaign_id, l.recipient_id, l.attempt, l.stage, l.outcome, l.http_status, l.error_code, l.worker_id, l.duration_ms, l.created_at FROM public.talkx_delivery_log AS l WHERE l.campaign_id = p_campaign_id AND (p_after IS NULL OR l.created_at > p_after) ORDER BY l.created_at, l.id LIMIT v_limit; END; $function$; REVOKE ALL ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer) TO authenticated, service_role; COMMENT ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer) IS 'X033: leitura paginada do talkx_delivery_log de uma campanha (admin/supervisor). p_after = cursor por created_at; p_limit 1..1000.'
-- (A linha 2 e SQL executavel: so a assinatura da funcao volta a de 20261003242707.
--  Nada de dado se perde: nenhuma tabela e criada, alterada ou apagada.)
--
-- Item 122 (BACKLOG_VERIFICADO / R3-DELTA-003): o cursor de log do Talk X por
-- timestamp perde linhas empatadas.
--
-- DEFEITO (confirmado no codigo vigente, 20261003242707_talkx_log_saude_alertas.sql):
--   public.talkx_campaign_logs(p_campaign_id, p_after timestamptz, p_limit) lia
--   `WHERE campaign_id = p_campaign_id AND (p_after IS NULL OR created_at > p_after)`
--   com `ORDER BY created_at, id`. O log e gravado EM LOTE: a edge talkx-send insere
--   varias linhas na mesma transacao, todas com o MESMO created_at (now() de transacao).
--   A pagina seguinte recebe p_after = created_at da ultima linha lida e o filtro
--   `created_at > p_after` descarta TODA a cauda empatada — as linhas de mesmo
--   created_at que ordenam depois da ultima lida nunca aparecem. Perda silenciosa:
--   a paginacao devolve menos linhas do que existem, sem erro.
--
-- CORRECAO: cursor COMPOSTO (created_at, id) — o mesmo keyset do ORDER BY. A pagina
--   seguinte repete p_after (created_at da ultima linha) E passa p_after_id (o id da
--   ultima linha); o filtro vira a comparacao de linha `(created_at, id) > (p_after, p_after_id)`.
--   `id` e a PK (uuid, unico) e desempata a ordem de forma determinista.
--
-- COMPATIBILIDADE: p_after_id entra como ULTIMO argumento com DEFAULT NULL para nao
--   quebrar a chamada de primeira pagina ja documentada em docs/talkx/OPERACAO.md
--   (p_campaign_id, NULL, limite). Nenhum cliente do navegador chama esta RPC (so o
--   exemplo da doc e o teste db-audit). Para o defeito nao voltar em silencio,
--   p_after sem p_after_id agora ERRA (talkx_campaign_logs_cursor_incompleto) em vez de
--   devolver menos linhas.
--
-- Classe: CONTRATO (assinatura de funcao + ACL). Idempotente: DROP IF EXISTS do contrato
-- antigo + CREATE OR REPLACE do novo. Troca de assinatura: DROP FUNCTION f(uuid,timestamptz,integer)
-- + CREATE f(uuid,timestamptz,integer,uuid) mantem o NOME no catalogo (o gate de remocoes
-- destrutivas observa o objeto, nao a assinatura).

DROP FUNCTION IF EXISTS public.talkx_campaign_logs(uuid, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.talkx_campaign_logs(
  p_campaign_id uuid,
  p_after timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_after_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  campaign_id uuid,
  recipient_id uuid,
  attempt integer,
  stage text,
  outcome text,
  http_status integer,
  error_code text,
  worker_id text,
  duration_ms integer,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limit integer;
BEGIN
  IF NOT (public.is_admin_or_supervisor(auth.uid()) OR COALESCE(auth.role(), '') = 'service_role') THEN
    RAISE EXCEPTION 'talkx_admin_required' USING ERRCODE = '42501';
  END IF;
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_campaign_id' USING ERRCODE = '22023';
  END IF;
  -- Cursor composto: so created_at (p_after) nao identifica a posicao quando ha
  -- empate e perde linhas. Exigir o id torna o defeito impossivel, e ruidoso se
  -- alguem repetir o padrao antigo.
  IF p_after IS NOT NULL AND p_after_id IS NULL THEN
    RAISE EXCEPTION 'talkx_campaign_logs_cursor_incompleto' USING ERRCODE = '22023';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);

  RETURN QUERY
    SELECT l.id, l.campaign_id, l.recipient_id, l.attempt, l.stage, l.outcome,
           l.http_status, l.error_code, l.worker_id, l.duration_ms, l.created_at
      FROM public.talkx_delivery_log AS l
     WHERE l.campaign_id = p_campaign_id
       AND (p_after IS NULL OR (l.created_at, l.id) > (p_after, p_after_id))
     ORDER BY l.created_at, l.id
     LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.talkx_campaign_logs(uuid, timestamptz, integer, uuid) IS
  'X033/#122: leitura paginada do talkx_delivery_log de uma campanha (admin/supervisor). Cursor COMPOSTO (created_at, id): a 1a pagina usa p_after NULL; a seguinte repete p_after = created_at e passa p_after_id = id da ultima linha. p_after sem p_after_id erra (talkx_campaign_logs_cursor_incompleto) para nao perder linhas empatadas. p_limit 1..1000.';
