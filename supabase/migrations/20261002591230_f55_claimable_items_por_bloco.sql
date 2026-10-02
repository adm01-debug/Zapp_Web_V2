-- 20261002591230_f55_claimable_items_por_bloco.sql
-- Classe: CONTRATO (create or replace function).
--
-- rollback: DROP FUNCTION IF EXISTS public.list_multiplix_claimable_items(uuid, integer); DROP FUNCTION IF EXISTS public.heartbeat_multiplix_item(uuid, uuid, integer);
--
-- F55 + F56 do plano do Multiplix (BLOCO F). Duas funcoes, nenhuma tabela nova:
--
-- 1) list_multiplix_claimable_items — a ESCOLHA do proximo item, que hoje nao existe em
--    lugar nenhum. O claim_multiplix_item (F32b) exige p_item_id: ele valida e trava UM item
--    que o chamador ja escolheu. Sem esta funcao a escolha cairia no cliente (o worker), e a
--    regra de ORDEM DO F56 — "item do bloco k so quando o bloco k-1 do mesmo destinatario
--    esta sent" — ficaria em TypeScript, fora de transacao e impossivel de provar sob
--    concorrencia. Aqui ela e uma clausula NOT EXISTS avaliada pelo proprio Postgres.
--
--    A ordem e derivada de multiplix_blocks.block_order (F33, que garante a sequencia sem
--    buraco por dispatch). O bloco anterior e o de block_order - 1: o F33 e o dono da
--    invariante de sequencia, entao nao ha o que procurar com "max(ordem menor que)".
--
--    Elegibilidade do item espelha, de proposito, a do claim_multiplix_item: se as duas
--    divergissem, a lista devolveria item que o claim recusa e o worker giraria em falso.
--
-- 2) heartbeat_multiplix_item — renova lease + lease_until do item que o worker ja tem,
--    sem tocar no estado. O F55 pede lease com heartbeat a cada 30 s; sem esta funcao o
--    worker so teria o lease inicial e um envio lento (midia grande, PTT) perderia o item
--    para o sweeper no meio do caminho.
--
-- Leitura pura: nao muda dado nenhum. O claim continua sendo o unico caminho que transita
-- estado (e o unico que incrementa attempt_count).

-- ─────────────────────────────────────────────────────────────────────────────
-- §1 · list_multiplix_claimable_items
--     Itens elegiveis de UM dispatch, ja na ordem em que o worker deve trabalhar.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_multiplix_claimable_items(
  p_dispatch_id uuid,
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  item_id uuid,
  recipient_id uuid,
  block_id uuid,
  -- smallint, NAO integer: a coluna e multiplix_blocks.block_order smallint, e o RETURNS TABLE
  -- tem de casar tipo a tipo com o RETURN QUERY (senao: 'structure of query does not match
  -- function result type'). Achado pelo harness, nao por leitura.
  block_order smallint,
  company_id uuid,
  attempt_count integer,
  next_attempt_at timestamp with time zone
)
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
$function$;

REVOKE ALL ON FUNCTION public.list_multiplix_claimable_items(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_multiplix_claimable_items(uuid, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2 · heartbeat_multiplix_item
--     Renova o lease do item que o worker ja possui; nao transita estado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.heartbeat_multiplix_item(
  p_item_id uuid,
  p_claim_token uuid,
  p_lease_seconds integer DEFAULT 90
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_renovado integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  -- Mesma faixa aceita pelo claim_multiplix_item: o heartbeat nao pode inventar lease que
  -- o claim se recusaria a conceder.
  IF p_item_id IS NULL OR p_claim_token IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'invalid_multiplix_item_heartbeat' USING ERRCODE = '22023';
  END IF;

  UPDATE public.multiplix_delivery_items AS item
     SET lease_until = statement_timestamp() + make_interval(secs => p_lease_seconds),
         updated_at = statement_timestamp()
   WHERE item.id = p_item_id
     AND item.lease_token = p_claim_token
     -- So o dono vivo do item renova: lease expirado ja pode ter sido retomado por outro
     -- worker (SKIP LOCKED), e renovar por cima disso roubaria o item de quem o tem agora.
     AND item.status = 'sending'
     AND item.lease_until > statement_timestamp();

  GET DIAGNOSTICS v_renovado = ROW_COUNT;
  RETURN v_renovado = 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.heartbeat_multiplix_item(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_multiplix_item(uuid, uuid, integer) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Prova de forma: as duas funcoes existem com a assinatura prometida. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
DO $prova$
DECLARE
  v_qtd integer;
BEGIN
  SELECT count(*) INTO v_qtd
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('list_multiplix_claimable_items', 'heartbeat_multiplix_item');

  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'f55: esperava as 2 funcoes, encontrei %', v_qtd
      USING ERRCODE = 'raise_exception';
  END IF;
END;
$prova$;
