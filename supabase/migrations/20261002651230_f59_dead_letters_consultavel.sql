-- rollback: DROP FUNCTION IF EXISTS public.list_multiplix_dead_letters(integer, uuid);
-- rollback: DROP FUNCTION IF EXISTS public.count_multiplix_dead_letters(uuid);
--
-- F59 · dead letter do Multiplix consultável (sem tela nova).
--
-- O plano pedia "dead letter consultável (multiplix_delivery_items WHERE
-- status='failed_permanent' + evento) no monitor". Duas correções medidas antes de escrever:
--
--   1) NÃO existe status 'failed_permanent'. O enum multiplix_item_status é
--      (pending, sending, sent, delivered, read, failed, failed_transient, skipped,
--      cancelled, outcome_unknown) — 'failed_permanent' NÃO está lá. O que o
--      reschedule_multiplix_item faz ao esgotar as tentativas (v_attempt >= 3) é gravar
--      status='failed' + next_attempt_at=NULL e DEVOLVER a ação 'failed': o nome
--      e da ACAO, nao do estado. Logo o dead letter e o PAR
--      (status='failed' AND next_attempt_at IS NULL), que e o que esta função consulta.
--      Construir a consulta sobre 'failed_permanent' acharia zero linha para sempre — o
--      operador veria "nada" e concluiria que nao ha falha, que e o pior desfecho;
--   2) o "monitor" existente (AdminCRMDashboard -> callCRMIntegration('health')) é do
--      CRM/TalkX e não enxerga item do Multiplix. O dono decidiu: SEM TELA NOVA — expor por
--      função operacional com RLS de admin.
--
-- A consulta é de OPERADOR (admin/supervisor), então a função:
--   - exige admin/supervisor DENTRO dela (SECURITY DEFINER + checagem explícita), porque o
--     GRANT é para `authenticated` — sem isso qualquer usuário logado leria dead letters;
--   - é STABLE: só lê;
--   - não devolve PII além do necessário ao diagnóstico (o telefone vem mascarado, ver abaixo).

CREATE OR REPLACE FUNCTION public.list_multiplix_dead_letters(
  p_limit integer DEFAULT 100,
  p_dispatch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  item_id uuid,
  dispatch_id uuid,
  dispatch_name text,
  recipient_id uuid,
  block_id uuid,
  block_order smallint,
  attempt_count integer,
  error_class text,
  error_message text,
  failed_at timestamp with time zone,
  next_attempt_at timestamp with time zone,
  destino_mascarado text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_limit integer;
BEGIN
  -- O gate é aqui, não no GRANT: `authenticated` inclui todo usuário logado.
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'multiplix_dead_letters_forbidden'
      USING HINT = 'Somente admin/supervisor consulta a dead letter do Multiplix.';
  END IF;

  -- Teto duro: uma consulta operacional não pode virar varredura da tabela inteira.
  v_limit := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);

  RETURN QUERY
  SELECT
    i.id AS item_id,
    i.dispatch_id,
    d.name::text AS dispatch_name,
    i.recipient_id,
    i.block_id,
    b.block_order,
    i.attempt_count,
    i.error_class,
    i.error_message,
    i.updated_at AS failed_at,
    i.next_attempt_at,
    -- Diagnóstico não precisa do telefone completo: os 4 últimos dígitos bastam para o
    -- operador casar com o relato e não expõem o contato inteiro num log de tela.
    CASE
      WHEN r.destino_e164 IS NULL THEN NULL
      WHEN length(r.destino_e164) <= 4 THEN repeat('*', length(r.destino_e164))
      ELSE repeat('*', greatest(length(r.destino_e164) - 4, 0)) || right(r.destino_e164, 4)
    END AS destino_mascarado
  FROM public.multiplix_delivery_items AS i
  JOIN public.multiplix_dispatches AS d ON d.id = i.dispatch_id
  LEFT JOIN public.multiplix_blocks AS b ON b.id = i.block_id
  LEFT JOIN public.multiplix_recipients AS r ON r.id = i.recipient_id
  WHERE i.status = 'failed'
    -- Dead letter = tentativas esgotadas: failed E sem proxima tentativa. Um item
    -- 'failed' com next_attempt_at ainda marcado e falha fatal de UMA tentativa, nao
    -- dead letter — misturar os dois faria o operador reprocessar o que ja ia sozinho.
    AND i.status = 'failed'
    AND i.next_attempt_at IS NULL
    AND (p_dispatch_id IS NULL OR i.dispatch_id = p_dispatch_id)
  ORDER BY i.updated_at DESC, i.id
  LIMIT v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_multiplix_dead_letters(
  p_dispatch_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.is_admin_or_supervisor(auth.uid()) THEN
    RAISE EXCEPTION 'multiplix_dead_letters_forbidden'
      USING HINT = 'Somente admin/supervisor consulta a dead letter do Multiplix.';
  END IF;

  RETURN (
    SELECT count(*)
    FROM public.multiplix_delivery_items AS i
    WHERE i.status = 'failed'
      AND i.next_attempt_at IS NULL
      AND (p_dispatch_id IS NULL OR i.dispatch_id = p_dispatch_id)
  );
END;
$function$;

-- Ninguém além do usuário logado (o gate de admin é dentro da função; anon não tem vez).
REVOKE ALL ON FUNCTION public.list_multiplix_dead_letters(integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.count_multiplix_dead_letters(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_multiplix_dead_letters(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_multiplix_dead_letters(uuid) TO authenticated;
