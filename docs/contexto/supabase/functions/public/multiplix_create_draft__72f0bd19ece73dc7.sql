CREATE OR REPLACE FUNCTION public.multiplix_create_draft(p_name text, p_template text, p_recipients jsonb, p_client_request_id uuid, p_created_by uuid, p_whatsapp_connection_id uuid DEFAULT NULL::uuid, p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_confirm_over_limit boolean DEFAULT false)
 RETURNS TABLE(dispatch_id uuid, recipient_count integer, created boolean, duplicated_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid;
  v_dispatch_id uuid;
  v_recipients jsonb;
  v_count integer;
  v_eligible_count integer;
  v_limit integer;
  v_created boolean := true;
  -- F30 tornou status um enum; um parametro/variavel `text` NAO e atribuivel a coluna enum sem cast
  -- (medido: 42804 "column status is of type multiplix_dispatch_status but expression is of type text").
  -- A variavel passa a ser do proprio tipo do F30.
  v_status public.multiplix_dispatch_status;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR btrim(p_name) = '' OR length(p_name) > 200 THEN
    RAISE EXCEPTION 'multiplix_draft_name_required' USING ERRCODE = '22023';
  END IF;
  IF p_template IS NULL OR btrim(p_template) = '' OR length(p_template) > 65536 THEN
    RAISE EXCEPTION 'multiplix_draft_template_required' USING ERRCODE = '22023';
  END IF;
  IF p_client_request_id IS NULL OR p_created_by IS NULL THEN
    RAISE EXCEPTION 'multiplix_draft_request_identity_required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = p_created_by) THEN
    RAISE EXCEPTION 'multiplix_draft_owner_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at <= statement_timestamp() THEN
    RAISE EXCEPTION 'multiplix_draft_schedule_must_be_future' USING ERRCODE = '22023';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' THEN
    RAISE EXCEPTION 'multiplix_draft_recipients_required' USING ERRCODE = '22023';
  END IF;

  -- F31/(a): elegibilidade em INGLES (era 'apto'). O valor 'eligible' e o mesmo do enum
  -- public.multiplix_eligibility do F30. A fronteira PT->EN vive em
  -- supabase/functions/_shared/multiplix-eligibility.ts (fromSinguEligibility) e a edge
  -- multiplix-audience (index.ts:320/326) traduz a saida PT do Singu ('apto'|'destino_invalido'|
  -- 'fora_do_escopo') para o enum canonico ANTES de chamar esta RPC. O Singu, externo, continua em PT.
  -- So entra quem o servidor classificou como elegivel: linha sem destino ou fora de escopo/suprimida
  -- nao vira destinatario. WITH ORDINALITY para preservar a ordem de entrada do jsonb.
  --
  -- TOLERANCIA TRANSITORIA (decisao do EXECUTOR, nao do plano — registrada no PR): o filtro aceita
  -- TAMBEM o literal PT 'apto'. Motivo MEDIDO: a edge em producao HOJE manda 'apto', e esta migration
  -- e aditiva (pode ser aplicada ANTES do deploy da edge nova). Sem a tolerancia existe uma janela —
  -- em QUALQUER das duas ordens de aplicacao (RPC nova + edge velha, ou edge nova + RPC velha) — em
  -- que TODOS os destinatarios sao descartados e o dispatch nasce vazio. Com ela as duas versoes da
  -- edge convivem, entao a ordem de aplicacao deixa de ser um risco de producao.
  -- REMOVER o literal 'apto' quando nao houver mais edge antiga em producao (rollout, Bloco J).
  SELECT COALESCE(jsonb_agg(e.entry ORDER BY e.ord), '[]'::jsonb)
    INTO v_recipients
    FROM jsonb_array_elements(p_recipients) WITH ORDINALITY AS e(entry, ord)
   WHERE COALESCE(e.entry->>'elegibilidade', 'eligible') IN ('eligible', 'apto')
     AND e.entry->>'company_id' IS NOT NULL
     AND e.entry->>'company_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_eligible_count := COALESCE(jsonb_array_length(v_recipients), 0);

  -- F31/(b) DEDUPE: 2 contatos com o MESMO numero no mesmo dispatch viram 1 linha. Criterio deterministico:
  -- DISTINCT ON sobre o destino NORMALIZADO (a mesma expressao do INSERT: NULLIF(btrim(COALESCE(...,'')),'')),
  -- mantendo a PRIMEIRA entrada na ordem do jsonb (menor ordinal) — a ordem em que o servidor resolveu o
  -- publico. Sem o dedupe aqui o UNIQUE (dispatch_id, destino_e164) estouraria 23505 em vez de colapsar.
  WITH src AS (
    SELECT NULLIF(btrim(COALESCE(e.entry->>'destino_e164', '')), '') AS destino,
           e.entry,
           e.ord
      FROM jsonb_array_elements(v_recipients) WITH ORDINALITY AS e(entry, ord)
  ),
  dedup AS (
    SELECT DISTINCT ON (destino) destino, entry, ord
      FROM src
     ORDER BY destino, ord
  )
  SELECT COALESCE(jsonb_agg(entry ORDER BY ord), '[]'::jsonb)
    INTO v_recipients
    FROM dedup;

  v_count := COALESCE(jsonb_array_length(v_recipients), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'multiplix_draft_no_eligible_recipients' USING ERRCODE = '22023';
  END IF;

  -- F17/ADR-007 D2: teto de destinatarios sem confirmacao explicita. A contagem e a de DESTINATARIOS REAIS
  -- (pos-dedupe), coerente com total_recipients e com recipient_count devolvido.
  SELECT COALESCE((settings.value)::text::integer, 200)
    INTO v_limit
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'multiplix_max_recipients_default';
  v_limit := COALESCE(v_limit, 200);
  IF v_count > v_limit AND NOT p_confirm_over_limit THEN
    RAISE EXCEPTION 'multiplix_over_recipient_limit: % acima do teto de % (confirme explicitamente)', v_count, v_limit
      USING ERRCODE = '22023';
  END IF;

  -- Idempotencia: o mesmo pedido (cliente reenviou/duplo clique) devolve o
  -- dispatch ja criado em vez de criar outro.
  SELECT dispatch.id INTO v_existing
    FROM public.multiplix_dispatches AS dispatch
   WHERE dispatch.client_request_id = p_client_request_id;

  IF FOUND THEN
    SELECT COALESCE(count(*), 0)::integer INTO v_count
      FROM public.multiplix_recipients AS recipient
     WHERE recipient.dispatch_id = v_existing;
    -- Nada foi colapsado nesta chamada (o dispatch ja existia): duplicated_count = 0.
    RETURN QUERY SELECT v_existing, v_count, false, 0;
    RETURN;
  END IF;

  v_status := CASE WHEN p_scheduled_at IS NULL
                   THEN 'draft'::public.multiplix_dispatch_status
                   ELSE 'scheduled'::public.multiplix_dispatch_status
              END;

  INSERT INTO public.multiplix_dispatches AS dispatch (
    name, message_template, status, total_recipients, scheduled_at,
    whatsapp_connection_id, created_by, client_request_id
  ) VALUES (
    btrim(p_name), p_template, v_status, v_count, p_scheduled_at,
    p_whatsapp_connection_id, p_created_by, p_client_request_id
  )
  RETURNING dispatch.id INTO v_dispatch_id;

  INSERT INTO public.multiplix_recipients AS recipient (
    dispatch_id, company_id, company_name_snapshot, destino_e164, destino_origem
  )
  SELECT
    v_dispatch_id,
    (entry->>'company_id')::uuid,
    NULLIF(btrim(COALESCE(entry->>'company_name', '')), ''),
    NULLIF(btrim(COALESCE(entry->>'destino_e164', '')), ''),
    NULLIF(btrim(COALESCE(entry->>'destino_origem', '')), '')
  FROM jsonb_array_elements(v_recipients) AS entry;

  -- duplicated_count = entradas elegiveis que o dedupe colapsou (aviso do plano: "1 linha + aviso").
  RETURN QUERY SELECT v_dispatch_id, v_count, v_created, (v_eligible_count - v_count);
END;
$function$
