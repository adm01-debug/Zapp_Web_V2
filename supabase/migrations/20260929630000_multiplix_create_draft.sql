-- 20260929630000_multiplix_create_draft
-- Bloco A (F08) do docs/multiplix/PLANO_FINALIZACAO_MULTIPLIX_100_ETAPAS_2026-09-29.md.
-- Achado 7 (e 25) da auditoria de 2026-09-29.
--
-- Hoje o navegador decide quem recebe: useMultiplixDispatches.ts insere
-- multiplix_dispatches + multiplix_recipients em duas chamadas PostgREST, com
-- company_id/company_name_snapshot/destino_e164 vindos do front, sem nenhuma
-- revalidacao no servidor — staff manda para qualquer numero; e a criacao nao e
-- transacional (falha entre os dois INSERTs deixa dispatch com total_recipients>0
-- e zero destinatarios) nem idempotente (2 POSTs = 2 dispatches).
--
-- Esta RPC recebe as linhas JA RESOLVIDAS pelo servidor (a edge
-- multiplix-audience chama multiplix_resolve_recipients no banco do Singu com o
-- escopo do JWT e descarta elegibilidade <> 'apto') e faz dispatch +
-- destinatarios em UMA transacao, idempotente por client_request_id.
--
-- Divergencia do plano (registrada no PR): o plano descreve a assinatura como
-- `multiplix_create_draft(p_name, p_template, p_company_ids[], p_client_request_id)`.
-- O banco do ZAPP nao alcanca o banco do Singu (projeto Supabase distinto, sem
-- FDW/dblink), entao a re-resolucao dos IDs acontece na edge — que ja tem a
-- service key externa e o escopo do JWT — e a RPC recebe `p_recipients` (jsonb)
-- com o resultado dessa resolucao. O efeito de seguranca pedido em F08 e o mesmo:
-- o navegador deixa de mandar destinatario, `created_by` vem do JWT (nao do body)
-- e nada e criado fora de uma transacao.
--
-- CREATE FUNCTION (sem OR REPLACE): objeto novo, o arquivo roda uma vez. A RPC e
-- aditiva — nada em producao a chama ate o deploy da edge — e por isso pode ser
-- aplicada na tarefa, como manda a regra 6 da secao 1 do CLAUDE.md (o
-- supabase-usage-guard precisa do alvo existindo para o PR passar).
-- client_request_id: coluna criada aqui (o plano a agenda em F31/bloco C) porque
-- a idempotencia de F08 depende dela agora.

ALTER TABLE public.multiplix_dispatches ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_multiplix_dispatches_client_request_id
  ON public.multiplix_dispatches(client_request_id) WHERE client_request_id IS NOT NULL;

CREATE FUNCTION public.multiplix_create_draft(
  p_name text,
  p_template text,
  p_recipients jsonb,
  p_client_request_id uuid,
  p_created_by uuid,
  p_whatsapp_connection_id uuid DEFAULT NULL::uuid,
  p_scheduled_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_confirm_over_limit boolean DEFAULT false
)
 RETURNS TABLE(dispatch_id uuid, recipient_count integer, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_existing uuid;
  v_dispatch_id uuid;
  v_recipients jsonb;
  v_count integer;
  v_limit integer;
  v_created boolean := true;
  v_status text;
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

  -- So entra quem o servidor classificou como apto: linha sem destino ou marcada
  -- como fora de escopo/suprimida nao vira destinatario (era exatamente o que o
  -- composer descartava no cliente, com um filtro que o navegador podia ignorar).
  SELECT COALESCE(jsonb_agg(entry), '[]'::jsonb)
    INTO v_recipients
    FROM jsonb_array_elements(p_recipients) AS entry
   WHERE COALESCE(entry->>'elegibilidade', 'apto') = 'apto'
     AND entry->>'company_id' IS NOT NULL
     AND entry->>'company_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

  v_count := COALESCE(jsonb_array_length(v_recipients), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'multiplix_draft_no_eligible_recipients' USING ERRCODE = '22023';
  END IF;

  -- F17/ADR-007 D2: teto de destinatarios sem confirmacao explicita.
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
    RETURN QUERY SELECT v_existing, v_count, false;
    RETURN;
  END IF;

  v_status := CASE WHEN p_scheduled_at IS NULL THEN 'draft' ELSE 'scheduled' END;

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

  RETURN QUERY SELECT v_dispatch_id, v_count, v_created;
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_create_draft(text, text, jsonb, uuid, uuid, uuid, timestamp with time zone, boolean) TO service_role;
