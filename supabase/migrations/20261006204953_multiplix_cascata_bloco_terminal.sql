-- multiplix_cascata_bloco_terminal
-- versão 20261006204953 reservada para hermes-multiplix-fila-blocos-sucessores-294-26100617458c7f em 2026-10-06T20:49:53Z (hermes-db-migrar --nova)
-- Rollback: reaplicar o corpo anterior das duas funções, que está em supabase/migrations/20261001231230_f32b_multiplix_item_queue_rpcs.sql (§5 complete_multiplix_item e §8 sweep_multiplix_stuck_items). Não há tabela, coluna, índice nem enum novo para desfazer.
--
-- R2-DB-006 (item 294 do BACKLOG_VERIFICADO, P2) — "Fila de blocos Multiplix deixa
-- sucessores pending atrás de um item terminal".
--
-- DEFEITO: `list_multiplix_claimable_items` (F55) só libera o bloco k quando o bloco k-1 do
-- MESMO destinatário está sent/delivered/read. Quando o predecessor fecha em um estado
-- TERMINAL-sem-envio — `skipped` (opt-out, sem destino, variável pendente), `failed` (falha
-- permanente) ou `outcome_unknown` (lease expirado depois do POST) —, nenhum caminho do motor
-- movia os sucessores: eles ficavam `pending` para sempre. Pending não é elegível (o filtro de
-- ordem os exclui), o sweeper só olhava `sending`, e a drenagem por itens recusa qualquer
-- pending restante — resultado: fila sem progresso e dispatch preso em 'sending'.
--
-- DECISÃO (dona da área, mensageria): predecessor terminal CANCELA a cadeia daquele
-- destinatário; não libera e não retém.
--   * "Liberar" (mandar o bloco 2..N sem o bloco 1) quebraria a ordem que o F56 existe para
--     garantir e é ENVIO REAL a cliente real — não se decide isso numa migration.
--   * "Reter para reconciliação" é exatamente o estado `pending` de hoje: o defeito.
--   * Cancelar não envia nada, é terminal e destrava a drenagem.
-- O enum `multiplix_item_status` (F30) já tem `cancelled` e não era usado em lugar nenhum
-- (medido: 0 usos no repositório): é o estado que faltava. `failed`/`outcome_unknown` NÃO são
-- usados na cascata de propósito — o sucessor nunca foi tentado; quem falhou foi o
-- predecessor, e ele já entra em `failed_count`/`outcome_unknown_count`.
--
-- O QUE MUDA (só as duas funções):
--   1) `complete_multiplix_item` (§1): depois de fechar o item como skipped/failed/
--      outcome_unknown, cancela os itens AINDA NÃO TENTADOS (pending/failed_transient) do
--      mesmo (dispatch, destinatário) com block_order MAIOR. É transitivo por construção —
--      cancela a cadeia inteira, não só o bloco imediatamente seguinte. Item já enviado
--      (sent/delivered/read) e item em voo (sending, lease vivo de outro worker) não são
--      tocados.
--   2) `sweep_multiplix_stuck_items` (§2): (a) ao fechar um item preso como `outcome_unknown`,
--      a mesma cascata vale para os sucessores dele; (b) reconcilia as linhas JÁ presas antes
--      desta migration: item pending/failed_transient que tem QUALQUER predecessor de
--      block_order menor já terminal-sem-envio é inalcançável pelo critério do F55 e passa a
--      `cancelled`. O sweeper roda no tick do cron (F58b), então a limpeza histórica converge
--      sozinha — sem (b), as linhas antigas ficariam pending para sempre.
--
-- O QUE NÃO MUDA: a ordenação do F55/F56 (nenhum claim muda de regra), a assinatura e o
-- formato de retorno das duas funções, os contadores do dispatch (item cancelado não é falha)
-- e a ACL (repetida, idempotente). Nenhum envio, retomada ou reenvio é introduzido: a
-- transição criada só leva item não tentado para um estado terminal sem envio.
--
-- Depende de: F30 (enum multiplix_item_status), F32a (tabela), F32b (corpos substituídos).
-- Ordem: depois de 20261002571230_f58b (nada desta migration é referenciado por ela).

-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · complete_multiplix_item — fecha o item e cancela a cadeia do destinatário
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_multiplix_item(p_item_id uuid, p_claim_token uuid, p_status text, p_error_message text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_dispatch_id  uuid;
  v_recipient_id uuid;
  v_block_id     uuid;
  v_block_order  smallint;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR p_status IS NULL OR p_status NOT IN ('failed', 'skipped', 'outcome_unknown')
     OR length(COALESCE(p_error_message, '')) > 1000 THEN
    RAISE EXCEPTION 'invalid_multiplix_delivery_completion' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
  SET status = p_status::public.multiplix_item_status,
      error_message = NULLIF(btrim(p_error_message), ''),
      lease_token = NULL,
      lease_until = NULL,
      worker_id = NULL,
      updated_at = statement_timestamp()
  WHERE item.id = p_item_id
    AND item.status = 'sending'
    AND item.lease_token = p_claim_token
  RETURNING item.dispatch_id, item.recipient_id, item.block_id
       INTO v_dispatch_id, v_recipient_id, v_block_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'multiplix_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  -- R2-DB-006: o item terminal sem envio cancela a cadeia DO MESMO destinatário. A ordem do
  -- bloco vem da tabela de blocos (o item só guarda block_id); a comparação é por
  -- block_order MAIOR, então todos os blocos seguintes daquele destinatário fecham juntos.
  SELECT blk.block_order
    INTO v_block_order
    FROM public.multiplix_blocks AS blk
   WHERE blk.id = v_block_id;

  IF v_block_order IS NOT NULL THEN
    UPDATE public.multiplix_delivery_items AS succ
       SET status = 'cancelled',
           error_class = 'cascade_block_terminal',
           error_message = 'Cancelado em cascata (R2-DB-006): o bloco de ordem '
                           || v_block_order::text
                           || ' deste destinatario encerrou como ' || p_status
                           || ' e o envio em ordem nao continua'
                           || COALESCE(' | erro anterior: ' || succ.error_message, ''),
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
      FROM public.multiplix_blocks AS succ_blk
     WHERE succ.dispatch_id = v_dispatch_id
       AND succ.recipient_id = v_recipient_id
       AND succ.block_id = succ_blk.id
       AND succ_blk.block_order > v_block_order
       AND succ.status IN ('pending', 'failed_transient');
  END IF;

  -- contadores recalculados (idempotente) — ver §1 do cabecalho do F32b
  UPDATE public.multiplix_dispatches AS dispatch
  SET failed_count = (
        SELECT count(*) FROM public.multiplix_delivery_items AS i
         WHERE i.dispatch_id = dispatch.id AND i.status = 'failed'
      ),
      outcome_unknown_count = (
        SELECT count(*) FROM public.multiplix_delivery_items AS i
         WHERE i.dispatch_id = dispatch.id AND i.status = 'outcome_unknown'
      ),
      updated_at = statement_timestamp()
  WHERE dispatch.id = v_dispatch_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_multiplix_item(uuid, uuid, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · sweep_multiplix_stuck_items — fecha o preso E reconcilia a cadeia inalcançável
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sweep_multiplix_stuck_items(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_swept            integer := 0;
  v_dispatches       uuid[];
  v_canceladas       integer := 0;
  v_disp_canceladas  uuid[];
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'invalid_multiplix_sweep_limit' USING ERRCODE = '22023';
  END IF;

  -- (a) item preso: POST já feito ao provedor, lease vencido. Sem confirmação => outcome_unknown.
  WITH stuck AS (
    SELECT item.id, item.dispatch_id
      FROM public.multiplix_delivery_items AS item
     WHERE item.status = 'sending'
       AND item.lease_until < statement_timestamp()
       AND item.provider_dispatch_started_at IS NOT NULL
     ORDER BY item.lease_until
     LIMIT p_limit
     FOR UPDATE OF item SKIP LOCKED
  ), swept AS (
    UPDATE public.multiplix_delivery_items AS item
       SET status = 'outcome_unknown',
           error_message = 'Sem confirmacao do provedor (lease expirado apos o POST) — reconciliar pelo webhook',
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
      FROM stuck
     WHERE item.id = stuck.id
    RETURNING item.dispatch_id
  )
  SELECT COALESCE(count(*), 0), COALESCE(array_agg(DISTINCT swept.dispatch_id), ARRAY[]::uuid[])
    INTO v_swept, v_dispatches
    FROM swept;

  -- Statement separado de proposito: dentro do mesmo statement os CTEs nao veem as
  -- linhas que os outros CTEs escrevem, e o recalc leria o valor antigo.
  IF v_swept > 0 THEN
    UPDATE public.multiplix_dispatches AS dispatch
       SET outcome_unknown_count = (
             SELECT count(*) FROM public.multiplix_delivery_items AS i
              WHERE i.dispatch_id = dispatch.id AND i.status = 'outcome_unknown'
           ),
           updated_at = statement_timestamp()
     WHERE dispatch.id = ANY (v_dispatches);
  END IF;

  -- (b) R2-DB-006: sucessores inalcançáveis. Um item do bloco k só é reivindicável quando o
  -- bloco k-1 do mesmo destinatário chegou a sent/delivered/read (F55); se QUALQUER bloco
  -- anterior daquele destinatário já está terminal-sem-envio, a cadeia nunca chega em k. Vale
  -- para as linhas que já estavam presas antes desta migration E para os sucessores dos itens
  -- que o passo (a) acabou de fechar (o snapshot do statement anterior já os enxerga aqui).
  -- Roda em statement próprio pelo mesmo motivo do recalc acima.
  WITH alvo AS (
    SELECT succ.id, causa.ordem, causa.status
      FROM public.multiplix_delivery_items AS succ
      JOIN public.multiplix_blocks AS succ_blk
        ON succ_blk.id = succ.block_id
      JOIN LATERAL (
        SELECT prev_blk.block_order AS ordem,
               prev.status AS status
          FROM public.multiplix_delivery_items AS prev
          JOIN public.multiplix_blocks AS prev_blk ON prev_blk.id = prev.block_id
         WHERE prev.dispatch_id = succ.dispatch_id
           AND prev.recipient_id = succ.recipient_id
           AND prev_blk.block_order < succ_blk.block_order
           AND prev.status IN ('skipped', 'failed', 'cancelled', 'outcome_unknown')
         ORDER BY prev_blk.block_order
         LIMIT 1
      ) AS causa ON true
     WHERE succ.status IN ('pending', 'failed_transient')
     ORDER BY succ.id
     LIMIT p_limit
     FOR UPDATE OF succ SKIP LOCKED
  ), canceladas AS (
    UPDATE public.multiplix_delivery_items AS succ
       SET status = 'cancelled',
           error_class = 'cascade_block_terminal',
           error_message = 'Cancelado em cascata (R2-DB-006): o bloco de ordem '
                           || alvo.ordem::text
                           || ' deste destinatario encerrou como ' || alvo.status::text
                           || ' e o envio em ordem nao continua'
                           || COALESCE(' | erro anterior: ' || succ.error_message, ''),
           lease_token = NULL,
           lease_until = NULL,
           worker_id = NULL,
           updated_at = statement_timestamp()
      FROM alvo
     WHERE succ.id = alvo.id
    RETURNING succ.dispatch_id
  )
  SELECT COALESCE(count(*), 0), COALESCE(array_agg(DISTINCT canceladas.dispatch_id), ARRAY[]::uuid[])
    INTO v_canceladas, v_disp_canceladas
    FROM canceladas;

  IF v_canceladas > 0 THEN
    -- `cancelled` nao entra em failed_count/outcome_unknown_count/delivered_count: nenhum
    -- contador precisa ser recalculado. O carimbo serve para a tela/consulta saber que a
    -- fila daquele dispatch mudou.
    UPDATE public.multiplix_dispatches AS dispatch
       SET updated_at = statement_timestamp()
     WHERE dispatch.id = ANY (v_disp_canceladas);
  END IF;

  -- Retorno: total de itens destravados no sweep (fechados como outcome_unknown + sucessores
  -- cancelados). O valor sempre foi descartado pelos chamadores (o cron faz PERFORM) e o
  -- contrato e "quantos itens deixaram de estar presos", nao "quantos viraram outcome_unknown".
  RETURN v_swept + v_canceladas;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_multiplix_stuck_items(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_multiplix_stuck_items(integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prova de forma: as duas funções foram substituídas e continuam SECURITY DEFINER com
-- search_path fixo (nada de PUBLIC execute). Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_def  text;
  v_qtd  integer;
BEGIN
  SELECT count(*) INTO v_qtd
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('complete_multiplix_item', 'sweep_multiplix_stuck_items');
  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'cascata_bloco_terminal: esperava as 2 funcoes, encontrei %', v_qtd;
  END IF;

  SELECT pg_get_functiondef('public.complete_multiplix_item(uuid,uuid,text,text)'::regprocedure)
    INTO v_def;
  IF position('cancelled' IN v_def) = 0 THEN
    RAISE EXCEPTION 'cascata_bloco_terminal: complete_multiplix_item sem a cascata de cancelamento';
  END IF;

  SELECT pg_get_functiondef('public.sweep_multiplix_stuck_items(integer)'::regprocedure)
    INTO v_def;
  IF position('cascade_block_terminal' IN v_def) = 0 THEN
    RAISE EXCEPTION 'cascata_bloco_terminal: sweep_multiplix_stuck_items sem a reconciliacao dos sucessores';
  END IF;
END;
$prova$;
