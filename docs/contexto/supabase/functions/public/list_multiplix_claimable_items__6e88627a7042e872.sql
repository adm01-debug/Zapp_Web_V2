CREATE OR REPLACE FUNCTION public.list_multiplix_claimable_items(p_dispatch_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(item_id uuid, recipient_id uuid, block_id uuid, block_order smallint, company_id uuid, attempt_count integer, next_attempt_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_dispatch_id IS NULL
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_multiplix_claimable_list' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT item.id,
         item.recipient_id,
         item.block_id,
         blk.block_order,
         recipient.company_id,
         item.attempt_count,
         item.next_attempt_at
    FROM public.multiplix_delivery_items AS item
    JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
    JOIN public.multiplix_recipients AS recipient ON recipient.id = item.recipient_id
    JOIN public.multiplix_blocks AS blk ON blk.id = item.block_id
   WHERE item.dispatch_id = p_dispatch_id
     AND dispatch.status = 'sending'
     -- Estado elegivel, igual ao do claim_multiplix_item (F32b): 'sending' so se o lease
     -- venceu E o envio ao provedor ainda nao comecou — item que ja foi ao provedor nunca
     -- e reciclado por aqui, quem resolve e o sweeper (outcome_unknown).
     AND (
       item.status IN ('pending', 'failed_transient')
       OR (
         item.status = 'sending'
         AND item.lease_until <= statement_timestamp()
         AND item.provider_dispatch_started_at IS NULL
       )
     )
     -- Backoff por item (F12 transportado ao item): nao entregar antes da hora.
     AND (item.next_attempt_at IS NULL OR item.next_attempt_at <= statement_timestamp())
     -- F56 · ORDEM POR DESTINATARIO: o bloco anterior deste MESMO destinatario precisa estar
     -- concluido. 'delivered'/'read' contam como concluido porque sao posteriores a 'sent'
     -- no ciclo de vida; 'sent' e o piso que o F56 nomeia.
     AND NOT EXISTS (
       SELECT 1
         FROM public.multiplix_delivery_items AS prev
         JOIN public.multiplix_blocks AS prev_blk ON prev_blk.id = prev.block_id
        WHERE prev.dispatch_id = item.dispatch_id
          AND prev.recipient_id = item.recipient_id
          AND prev_blk.block_order = blk.block_order - 1
          AND prev.status NOT IN ('sent', 'delivered', 'read')
     )
   -- Ordem de trabalho: primeiro quem nunca tentou / ja passou o backoff, depois o mais
   -- antigo. Determinismo importa: dois workers chamando isto N vezes seguidas precisam
   -- enxergar a mesma fila (o desempate final e o id).
   ORDER BY blk.block_order, item.next_attempt_at NULLS FIRST, item.created_at, item.id
   LIMIT p_limit;
END;
$function$
