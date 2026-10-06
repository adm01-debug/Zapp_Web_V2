-- Teste de regressão do R2-DB-006 (item 294 do BACKLOG_VERIFICADO, P2):
-- "Fila de blocos Multiplix deixa sucessores pending atrás de um item terminal".
--
-- O QUE ESTE TESTE PROVA (com o código REAL, contra o banco LOCAL do conjunto — nunca produção):
--   T0  `complete_multiplix_item` continua recusando status fora de failed/skipped/outcome_unknown;
--   T1  predecessor `skipped` (opt-out) cancela a CADEIA daquele destinatário (bloco 2 e 3), e o
--       cancelamento não vaza para outro destinatário do mesmo dispatch;
--   T2  predecessor `failed` (falha permanente) cancela a cadeia;
--   T3  predecessor `outcome_unknown` (lease expirado depois do POST) cancela a cadeia;
--   T4  predecessor `skipped` por destino inválido cancela a cadeia;
--   T5  o sweeper reconcilia as linhas JÁ presas antes da correção (pending atrás de terminal);
--   T6  o sweeper fecha o item preso em `sending` (outcome_unknown) E cancela os sucessores dele;
--   T7  cadeia com predecessor `pending` (ainda progredível) NÃO é cancelada — nada de falso positivo;
--   T8  a ordenação do F55 continua valendo: só o próximo bloco do destinatário é ofertado;
--   T9  não sobra item pending inalcançável, os contadores do dispatch não inflam com `cancelled`,
--       e a drenagem por itens fecha o dispatch quando nada mais está aberto.
--
-- Fixture sintética e determinística (prefixo c0de), sem telefone/empresa de cliente real: os
-- uuid são inventados e destino_e164 é da faixa reservada de ficção (5551...). Todo o teste vive
-- dentro de UM DO: se qualquer asserção falha, o bloco inteiro (fixture incluída) é desfeito.
--
-- Uso: zapp-db-local psql . <conjunto> -v ON_ERROR_STOP=1 < supabase/tests/multiplix_cascata_bloco_terminal.sql
-- Sem EXCEPTION = suíte verde.

DO $$
DECLARE
  -- dispatches
  v_d1 uuid := 'c0de0000-0000-4000-8000-000000000001';
  v_d2 uuid := 'c0de0000-0000-4000-8000-000000000002';
  v_empresa uuid := 'c0de0000-0000-4000-8000-000000000901';
  v_dono uuid := 'c0de0000-0000-4000-8000-000000000902';
  -- blocos do D1 (ordem 0, 1, 2) e do D2 (ordem 0, 1)
  v_b0 uuid := 'c0de0000-0000-4000-8000-000000000301';
  v_b1 uuid := 'c0de0000-0000-4000-8000-000000000302';
  v_b2 uuid := 'c0de0000-0000-4000-8000-000000000303';
  v_b0d2 uuid := 'c0de0000-0000-4000-8000-000000000311';
  v_b1d2 uuid := 'c0de0000-0000-4000-8000-000000000312';
  -- destinatários: r1 skip/opt-out, r2 falha permanente, r3 resultado incerto, r4 linha já presa,
  -- r5 POST sem confirmação, r6 cadeia saudável, r7 skip/sem destino
  v_r1 uuid := 'c0de0000-0000-4000-8000-000000000101';
  v_r2 uuid := 'c0de0000-0000-4000-8000-000000000102';
  v_r3 uuid := 'c0de0000-0000-4000-8000-000000000103';
  v_r4 uuid := 'c0de0000-0000-4000-8000-000000000104';
  v_r5 uuid := 'c0de0000-0000-4000-8000-000000000105';
  v_r6 uuid := 'c0de0000-0000-4000-8000-000000000106';
  v_r7 uuid := 'c0de0000-0000-4000-8000-000000000107';
  v_ra uuid := 'c0de0000-0000-4000-8000-000000000201';
  v_rb uuid := 'c0de0000-0000-4000-8000-000000000202';
  -- itens do D1 por (destinatário, bloco)
  v_r1_b0 uuid := 'c0de0000-0000-4000-8000-000000000401';
  v_r1_b1 uuid := 'c0de0000-0000-4000-8000-000000000402';
  v_r1_b2 uuid := 'c0de0000-0000-4000-8000-000000000403';
  v_r2_b0 uuid := 'c0de0000-0000-4000-8000-000000000411';
  v_r2_b1 uuid := 'c0de0000-0000-4000-8000-000000000412';
  v_r3_b0 uuid := 'c0de0000-0000-4000-8000-000000000421';
  v_r3_b1 uuid := 'c0de0000-0000-4000-8000-000000000422';
  v_r4_b0 uuid := 'c0de0000-0000-4000-8000-000000000431';
  v_r4_b1 uuid := 'c0de0000-0000-4000-8000-000000000432';
  v_r4_b2 uuid := 'c0de0000-0000-4000-8000-000000000433';
  v_r5_b0 uuid := 'c0de0000-0000-4000-8000-000000000441';
  v_r5_b1 uuid := 'c0de0000-0000-4000-8000-000000000442';
  v_r6_b0 uuid := 'c0de0000-0000-4000-8000-000000000451';
  v_r6_b1 uuid := 'c0de0000-0000-4000-8000-000000000452';
  v_r7_b0 uuid := 'c0de0000-0000-4000-8000-000000000461';
  v_r7_b1 uuid := 'c0de0000-0000-4000-8000-000000000462';
  v_ra_b0 uuid := 'c0de0000-0000-4000-8000-000000000471';
  v_ra_b1 uuid := 'c0de0000-0000-4000-8000-000000000472';
  v_rb_b0 uuid := 'c0de0000-0000-4000-8000-000000000481';
  v_rb_b1 uuid := 'c0de0000-0000-4000-8000-000000000482';
  v_lease_1 uuid := 'c0de0000-0000-4000-8000-000000000501';
  v_lease_2 uuid := 'c0de0000-0000-4000-8000-000000000502';
  v_lease_3 uuid := 'c0de0000-0000-4000-8000-000000000503';
  v_lease_4 uuid := 'c0de0000-0000-4000-8000-000000000504';
  v_lease_5 uuid := 'c0de0000-0000-4000-8000-000000000505';
  v_lease_6 uuid := 'c0de0000-0000-4000-8000-000000000506';
  -- apoio
  v_status   text;
  v_classe   text;
  v_msg      text;
  v_qtd      integer;
  v_item     uuid;
  v_sweep    integer;
  v_infin    integer;
BEGIN
  -- O motor Multiplix aceita só service_role (o resto das chamadas é superusuário do conjunto).
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  -- ───────────────────────────── fixture ─────────────────────────────
  DELETE FROM public.multiplix_dispatches WHERE id IN (v_d1, v_d2);

  INSERT INTO public.multiplix_dispatches (id, name, message_template, status, created_by)
  VALUES (v_d1, 'fixture c0de R2-DB-006', 'bloco {{1}}', 'sending'::public.multiplix_dispatch_status, v_dono),
         (v_d2, 'fixture c0de drenagem',  'bloco {{1}}', 'sending'::public.multiplix_dispatch_status, v_dono);

  INSERT INTO public.multiplix_blocks (id, dispatch_id, block_order, block_type, template_text)
  VALUES (v_b0, v_d1, 0, 'text', 'bloco 0'),
         (v_b1, v_d1, 1, 'text', 'bloco 1'),
         (v_b2, v_d1, 2, 'text', 'bloco 2'),
         (v_b0d2, v_d2, 0, 'text', 'bloco 0'),
         (v_b1d2, v_d2, 1, 'text', 'bloco 1');

  INSERT INTO public.multiplix_recipients (id, dispatch_id, company_id, company_name_snapshot, destino_e164, status)
  VALUES (v_r1, v_d1, v_empresa, 'fixture r1', '555199990001', 'pending'),
         (v_r2, v_d1, v_empresa, 'fixture r2', '555199990002', 'pending'),
         (v_r3, v_d1, v_empresa, 'fixture r3', '555199990003', 'pending'),
         (v_r4, v_d1, v_empresa, 'fixture r4', '555199990004', 'pending'),
         (v_r5, v_d1, v_empresa, 'fixture r5', '555199990005', 'pending'),
         (v_r6, v_d1, v_empresa, 'fixture r6', '555199990006', 'pending'),
         (v_r7, v_d1, v_empresa, 'fixture r7', '555199990007', 'pending'),
         (v_ra, v_d2, v_empresa, 'fixture ra', '555199990011', 'pending'),
         (v_rb, v_d2, v_empresa, 'fixture rb', '555199990012', 'pending');

  -- r1/r2/r3/r7: bloco 0 na mão do worker (sending + lease vivo); r4: linha JÁ presa (bloco 0
  -- terminal sem envio e o bloco 1 pending, como o banco fica depois do defeito); r5: POST feito
  -- e lease vencido; r6: cadeia saudável, ninguém reivindicou nada.
  INSERT INTO public.multiplix_delivery_items
    (id, dispatch_id, recipient_id, block_id, dispatch_version, status, lease_token, lease_until, provider_dispatch_started_at, error_message)
  VALUES
    (v_r1_b0, v_d1, v_r1, v_b0, 1, 'sending', v_lease_1, statement_timestamp() + interval '60 seconds', NULL, NULL),
    (v_r1_b1, v_d1, v_r1, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r1_b2, v_d1, v_r1, v_b2, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r2_b0, v_d1, v_r2, v_b0, 1, 'sending', v_lease_2, statement_timestamp() + interval '60 seconds', NULL, NULL),
    (v_r2_b1, v_d1, v_r2, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r3_b0, v_d1, v_r3, v_b0, 1, 'sending', v_lease_3, statement_timestamp() + interval '60 seconds', NULL, NULL),
    (v_r3_b1, v_d1, v_r3, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r4_b0, v_d1, v_r4, v_b0, 1, 'skipped',  NULL, NULL, NULL, 'Contato na lista negra (opt-out)'),
    (v_r4_b1, v_d1, v_r4, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r4_b2, v_d1, v_r4, v_b2, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r5_b0, v_d1, v_r5, v_b0, 1, 'sending', v_lease_5, statement_timestamp() - interval '5 minutes',
                                                     statement_timestamp() - interval '6 minutes', NULL),
    (v_r5_b1, v_d1, v_r5, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r6_b0, v_d1, v_r6, v_b0, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r6_b1, v_d1, v_r6, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_r7_b0, v_d1, v_r7, v_b0, 1, 'sending', v_lease_6, statement_timestamp() + interval '60 seconds', NULL, NULL),
    (v_r7_b1, v_d1, v_r7, v_b1, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_ra_b0, v_d2, v_ra, v_b0d2, 1, 'sending', v_lease_4, statement_timestamp() + interval '60 seconds', NULL, NULL),
    (v_ra_b1, v_d2, v_ra, v_b1d2, 1, 'pending', NULL, NULL, NULL, NULL),
    (v_rb_b0, v_d2, v_rb, v_b0d2, 1, 'sent', NULL, NULL, NULL, NULL),
    (v_rb_b1, v_d2, v_rb, v_b1d2, 1, 'sent', NULL, NULL, NULL, NULL);

  -- ───────────────────────── T0 · a guarda de status continua de pé ─────────────────────────
  BEGIN
    PERFORM public.complete_multiplix_item(v_r1_b0, v_lease_1, 'sent'::text, NULL);
    RAISE EXCEPTION 'T0 FALHOU: complete_multiplix_item aceitou o status sent';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_multiplix_delivery_completion' THEN
      RAISE;
    END IF;
  END;

  -- ─────────────────── T1 · skipped (opt-out) cancela a cadeia do destinatário ───────────────────
  PERFORM public.complete_multiplix_item(v_r1_b0, v_lease_1, 'skipped'::text, 'Contato na lista negra (opt-out)');

  SELECT status::text, error_class INTO v_status, v_classe
    FROM public.multiplix_delivery_items WHERE id = v_r1_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T1 FALHOU: sucessor do bloco opt-out ficou em %, esperado cancelled (R2-DB-006)', v_status;
  END IF;
  IF v_classe <> 'cascade_block_terminal' THEN
    RAISE EXCEPTION 'T1 FALHOU: error_class do cancelamento veio %', COALESCE(v_classe, 'NULL');
  END IF;

  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r1_b2;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T1 FALHOU: a cascata nao chegou ao bloco 3 (status %)', v_status;
  END IF;

  IF EXISTS (SELECT 1 FROM public.multiplix_delivery_items
              WHERE id IN (v_r1_b1, v_r1_b2)
                AND (lease_token IS NOT NULL OR lease_until IS NOT NULL OR worker_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'T1 FALHOU: item cancelado ficou com lease/worker preso';
  END IF;

  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r2_b1;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'T1 FALHOU: a cascata de r1 vazou para outro destinatario do mesmo dispatch (r2 bloco 1 = %)', v_status;
  END IF;

  -- ─────────────────── T2 · failed (falha permanente) cancela a cadeia ───────────────────
  PERFORM public.complete_multiplix_item(v_r2_b0, v_lease_2, 'failed'::text, 'Falha ao montar a mensagem do bloco');
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r2_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T2 FALHOU: sucessor de item failed ficou em %, esperado cancelled', v_status;
  END IF;

  -- ─────────────────── T3 · outcome_unknown cancela a cadeia ───────────────────
  PERFORM public.complete_multiplix_item(v_r3_b0, v_lease_3, 'outcome_unknown'::text, 'Sem id do provedor');
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r3_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T3 FALHOU: sucessor de item outcome_unknown ficou em %, esperado cancelled', v_status;
  END IF;

  -- ─────────────────── T4 · skipped por destino inválido cancela a cadeia ───────────────────
  PERFORM public.complete_multiplix_item(v_r7_b0, v_lease_6, 'skipped'::text, 'Sem destino de WhatsApp');
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r7_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T4 FALHOU: sucessor de "sem destino" ficou em %, esperado cancelled', v_status;
  END IF;

  -- ───────── T5/T6/T7 · sweeper: destrava o que já estava preso, fecha o sending e não exagera ─────────
  v_sweep := public.sweep_multiplix_stuck_items(10000);
  -- 1 item preso fechado como outcome_unknown (r5, bloco 0) + 3 sucessores presos cancelados
  -- (r4 blocos 1 e 2, atrás de um skipped antigo, e r5 bloco 1). Os sucessores de r1/r2/r3/r7
  -- já foram cancelados pelo complete_multiplix_item e não aparecem mais como pending aqui.
  IF v_sweep < 4 THEN
    RAISE EXCEPTION 'T5 FALHOU: o sweeper destravou % item(ns); esperava ao menos 4 (1 sending vencido + 3 sucessores presos)', v_sweep;
  END IF;

  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r4_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T5 FALHOU: linha JÁ presa (pending atras de predecessor skipped) continuou em %', v_status;
  END IF;
  -- transitividade: o bloco 2 do r4 (atras de um pending atras de um terminal) tambem sai
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r4_b2;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T5 FALHOU: a reconciliacao nao chegou ao bloco 3 do r4 (status %)', v_status;
  END IF;
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r4_b0;
  IF v_status <> 'skipped' THEN
    RAISE EXCEPTION 'T5 FALHOU: o sweeper mexeu no item terminal (r4 bloco 0 = %)', v_status;
  END IF;

  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r5_b0;
  IF v_status <> 'outcome_unknown' THEN
    RAISE EXCEPTION 'T6 FALHOU: item com POST feito e lease vencido virou %, esperado outcome_unknown', v_status;
  END IF;
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r5_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T6 FALHOU: sucessor do item fechado pelo sweeper ficou em %, esperado cancelled', v_status;
  END IF;

  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r6_b0;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'T7 FALHOU: o sweeper cancelou cadeia com predecessor ainda progredivel (r6 bloco 1 = %)', v_status;
  END IF;
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_r6_b1;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'T7 FALHOU: o sweeper cancelou sucessor de predecessor pending (r6 bloco 2 = %)', v_status;
  END IF;

  -- ───────── T8 · a ordenação do F55 continua valendo: só o próximo bloco é ofertado ─────────
  SELECT count(*) INTO v_qtd FROM public.list_multiplix_claimable_items(v_d1, 50);
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: a lista claimable devolveu % item(ns), esperava 1 (so o bloco 0 de r6)', v_qtd;
  END IF;
  SELECT item_id INTO v_item FROM public.list_multiplix_claimable_items(v_d1, 50) LIMIT 1;
  IF v_item <> v_r6_b0 THEN
    RAISE EXCEPTION 'T8 FALHOU: a lista ofereceu um item que nao e o proximo da ordem (%)', v_item;
  END IF;

  -- com o bloco 0 confirmado, o bloco 1 de r6 passa a ser ofertado (a cadeia segue normal)
  UPDATE public.multiplix_delivery_items
     SET status = 'sent', sent_at = statement_timestamp()
   WHERE id = v_r6_b0;

  SELECT count(*) INTO v_qtd FROM public.list_multiplix_claimable_items(v_d1, 50);
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'T8 FALHOU: depois de confirmar o bloco 0, a lista devolveu % item(ns), esperava 1 (bloco 1 de r6)', v_qtd;
  END IF;
  SELECT item_id INTO v_item FROM public.list_multiplix_claimable_items(v_d1, 50) LIMIT 1;
  IF v_item <> v_r6_b1 THEN
    RAISE EXCEPTION 'T8 FALHOU: depois de confirmar o bloco 0, a lista ofereceu % em vez do bloco 1 de r6', v_item;
  END IF;

  -- ───────── T9 · nada de pending inalcançável, contadores honestos, drenagem por itens ─────────
  SELECT count(*) INTO v_infin
    FROM public.multiplix_delivery_items AS succ
    JOIN public.multiplix_blocks AS succ_blk ON succ_blk.id = succ.block_id
   WHERE succ.dispatch_id IN (v_d1, v_d2)
     AND succ.status IN ('pending', 'sending', 'failed_transient')
     AND EXISTS (
       SELECT 1
         FROM public.multiplix_delivery_items AS prev
         JOIN public.multiplix_blocks AS prev_blk ON prev_blk.id = prev.block_id
        WHERE prev.dispatch_id = succ.dispatch_id
          AND prev.recipient_id = succ.recipient_id
          AND prev_blk.block_order < succ_blk.block_order
          AND prev.status IN ('skipped', 'failed', 'cancelled', 'outcome_unknown')
     );
  IF v_infin <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: sobraram % item(ns) pending/sending atras de predecessor terminal', v_infin;
  END IF;

  SELECT failed_count INTO v_qtd FROM public.multiplix_dispatches WHERE id = v_d1;
  IF v_qtd <> 1 THEN
    RAISE EXCEPTION 'T9 FALHOU: failed_count do dispatch veio % (o cancelamento nao pode contar como falha)', v_qtd;
  END IF;
  SELECT outcome_unknown_count INTO v_qtd FROM public.multiplix_dispatches WHERE id = v_d1;
  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'T9 FALHOU: outcome_unknown_count veio % (esperado 2: r3 pelo complete e r5 pelo sweeper)', v_qtd;
  END IF;

  -- Segundo dispatch (D2): o mesmo caminho de opt-out e a fila zerada quando a cascata fecha.
  -- A drenagem por itens (`complete_multiplix_dispatch_if_items_drained`) NÃO é chamada aqui de
  -- propósito: ela carrega o defeito R2-DB-007 (CASE text -> coluna do enum, sem cast) e levanta
  -- em qualquer conclusão — é de outro cartão. O que este teste confere é a CONDIÇÃO que ela usa
  -- (nenhum item pending/sending/failed_transient restante): com ela satisfeita, a fila por itens
  -- é drenável; a conclusão do dispatch depende da correção do R2-DB-007.
  PERFORM public.complete_multiplix_item(v_ra_b0, v_lease_4, 'skipped'::text, 'Contato na lista negra (opt-out)');
  SELECT status::text INTO v_status FROM public.multiplix_delivery_items WHERE id = v_ra_b1;
  IF v_status <> 'cancelled' THEN
    RAISE EXCEPTION 'T9 FALHOU: no segundo dispatch o sucessor do opt-out ficou em %', v_status;
  END IF;
  SELECT count(*) INTO v_qtd
    FROM public.multiplix_delivery_items
   WHERE dispatch_id = v_d2
     AND status IN ('pending', 'sending', 'failed_transient');
  IF v_qtd <> 0 THEN
    RAISE EXCEPTION 'T9 FALHOU: o dispatch 2 ficou com % item(ns) aberto(s) e nao drena por itens', v_qtd;
  END IF;

  DELETE FROM public.multiplix_dispatches WHERE id IN (v_d1, v_d2);
  IF EXISTS (SELECT 1 FROM public.multiplix_delivery_items WHERE dispatch_id IN (v_d1, v_d2)) THEN
    RAISE EXCEPTION 'limpeza FALHOU: sobraram itens da fixture';
  END IF;

  RAISE NOTICE 'multiplix_cascata_bloco_terminal: suite OK (T0-T9; opt-out/sem destino/failed/outcome_unknown, sweeper e fila zerada)';
END $$;
