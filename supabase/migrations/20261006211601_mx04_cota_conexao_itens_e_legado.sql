-- mx04_cota_conexao_itens_e_legado
-- versao 20261006211601 reservada para hermes-t-bd09f163-2610061810b4d4 em 2026-10-06 (hermes-db-migrar --nova)
--
-- Rollback: devolve os DOIS corpos ANTERIORES pela MESMA funcao/assinatura e reaplica a ACL identica.
-- Rollback: Esta migration nao toca tabela, dado, trigger, cron nem publication: reverter e so o corpo das duas funcoes.
-- Rollback: (os comentarios internos dos corpos anteriores nao entram; o SQL e o mesmo fora eles)
-- Rollback: CREATE OR REPLACE FUNCTION public.multiplix_connection_daily_usage(p_connection_id uuid)  RETURNS jsonb  LANGUAGE plpgsql  STABLE  SECURITY DEFINER  SET search_path TO 'public', 'pg_temp' AS $function$ DECLARE   v_limit integer;   v_sent integer;   v_day_start timestamptz; BEGIN   IF COALESCE(auth.role(), '') <> 'service_role' THEN     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';   END IF;   IF p_connection_id IS NULL THEN     RAISE EXCEPTION 'invalid_multiplix_connection' USING ERRCODE = '22023';   END IF;    SELECT COALESCE((settings.value)::text::integer, 0)     INTO v_limit     FROM public.talkx_settings AS settings    WHERE settings.key = 'daily_limit_per_connection';    v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';    SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_sent FROM (     SELECT count(*) AS sent       FROM public.talkx_recipients AS recipient       JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id      WHERE campaign.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_day_start     UNION ALL     SELECT count(*)       FROM public.multiplix_recipients AS recipient       JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id      WHERE dispatch.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_day_start   ) AS usage;    RETURN jsonb_build_object(     'limit', COALESCE(v_limit, 0),     'sent', COALESCE(v_sent, 0),     'remaining', GREATEST(COALESCE(v_limit, 0) - COALESCE(v_sent, 0), 0),     'day_start', v_day_start   ); END; $function$;  REVOKE ALL ON FUNCTION public.multiplix_connection_daily_usage(uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.multiplix_connection_daily_usage(uuid) TO service_role;
-- Rollback: CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $function$ DECLARE   v_minute_limit integer;   v_day_limit integer;   v_minute_sent integer;   v_day_sent integer;   v_minute_start timestamptz;   v_day_start timestamptz;   v_next_day_at timestamptz; BEGIN   IF COALESCE(auth.role(), '') <> 'service_role' THEN     RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';   END IF;   IF p_connection_id IS NULL THEN     RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';   END IF;    SELECT COALESCE((settings.value)::text::integer, 6)     INTO v_minute_limit     FROM public.talkx_settings settings    WHERE settings.key = 'max_per_minute_per_connection';    SELECT COALESCE((settings.value)::text::integer, 500)     INTO v_day_limit     FROM public.talkx_settings settings    WHERE settings.key = 'daily_limit_per_connection';    v_minute_start := statement_timestamp() - interval '1 minute';   v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')                  AT TIME ZONE 'America/Sao_Paulo';   v_next_day_at := v_day_start + interval '1 day';    SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_minute_sent FROM (     SELECT count(*) AS sent       FROM public.talkx_recipients recipient       JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id      WHERE campaign.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_minute_start     UNION ALL     SELECT count(*)       FROM public.multiplix_recipients recipient       JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id      WHERE dispatch.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_minute_start   ) AS usage;    SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_day_sent FROM (     SELECT count(*) AS sent       FROM public.talkx_recipients recipient       JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id      WHERE campaign.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_day_start     UNION ALL     SELECT count(*)       FROM public.multiplix_recipients recipient       JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id      WHERE dispatch.whatsapp_connection_id = p_connection_id        AND recipient.sent_at >= v_day_start   ) AS usage;    RETURN jsonb_build_object(     'minute_limit', v_minute_limit,     'minute_sent', v_minute_sent,     'minute_remaining', GREATEST(v_minute_limit - v_minute_sent, 0),     'day_limit', v_day_limit,     'day_sent', v_day_sent,     'day_remaining', GREATEST(v_day_limit - v_day_sent, 0),     'next_day_at', v_next_day_at   ); END; $function$;  REVOKE ALL ON FUNCTION public.talkx_connection_send_budget(uuid)   FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.talkx_connection_send_budget(uuid)   TO service_role;
-- ============================================================================
-- MX04 (#48) — a cota por conexao conta o ITEM enviado (contrato atual) e o
-- legado por destinatario sem contar duas vezes, e nao aceita medicao invalida
-- ============================================================================
-- Classe: contrato. CREATE OR REPLACE das DUAS funcoes de cota por conexao
--   (public.multiplix_connection_daily_usage e public.talkx_connection_send_budget)
--   com as MESMAS assinaturas e o MESMO REVOKE/GRANT (ACL so postgres+service_role),
--   e o MESMO formato de retorno (as chaves que o worker e o cron leem).
--
-- DEFEITO (MX04, auditoria independente): as duas funcoes somavam o consumo do
-- Multiplix por public.multiplix_recipients.sent_at. O motor atual e a fila POR ITEM
-- (F32/F55): o worker carimba public.multiplix_delivery_items.sent_at e NAO escreve
-- sent_at no destinatario. Resultado: todo envio do Multiplix por item desaparecia do
-- teto diario/minuto compartilhado com o Talk X.
--
-- O QUE ESTA MIGRATION MUDA (so isto):
--   1. Consumo do Multiplix = 1 por ITEM enviado (mensagem), nao por destinatario.
--      Um destinatario com 3 blocos consumiu 3.
--   2. Disparo LEGADO (sem itens) continua contando por destinatario — mas so quando o
--      disparo NAO tem nenhum item, para nada contar duas vezes na virada de modelo.
--   3. Disparo/campanha SEM conexao carimbada (o composer nao oferece escolha; o worker
--      resolve para a primeira conexao conectada) passa a consumir o teto DESSA conexao
--      conectada. Antes esse trafego nao consumia teto nenhum.
--   4. Medicao invalida ganha politica explicita: o valor do teto so vale quando e
--      numero JSON inteiro nao-negativo que cabe em integer seguro (ate 9 digitos);
--      qualquer outra forma ('"500"', 'abc', '500.5', true ou 3000000000) cai no
--      default da propria funcao (0 = fail-closed no Multiplix; 6/minuto e 500/dia
--      no Talk X) em vez de levantar 22P02/22003 no cast. O retorno passa a ser sempre
--      numerico — 'remaining' nunca vem ausente nem nao-numerico — para o worker nao
--      confundir medicao quebrada com "sem teto".
--
-- NAO MUDA: nomes/assinaturas, as demais chaves do jsonb, a janela do dia (dia local de
-- Sao Paulo, ADR-007 D2), a janela de minuto (ultimo minuto) e a ACL (REVOKE de
-- PUBLIC/anon/authenticated + GRANT so a service_role, pelos mesmos argumentos).
--
-- O QUE FICA FORA (registrado, nao silenciado): o lado EDGE de resolveDailyRoom
-- (supabase/functions/multiplix-send/index.ts) devolve `null` = "sem cota" quando a
-- resposta nao traz 'remaining' numerico. Depois desta migration isso e inalcancavel a
-- partir do banco (o campo sempre vem numero), mas o ramo permissivo continua no codigo
-- da edge e e do worker (edge), nao do banco.
--
-- EFEITO COLATERAL: nenhum trigger, job de cron ou publication muda. O cron
-- 'multiplix-send-trigger' segue lendo o mesmo campo 'remaining' de
-- multiplix_connection_daily_usage (F17c), agora com o numero certo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.multiplix_connection_daily_usage(p_connection_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_limit integer;
  v_sent integer;
  v_day_start timestamptz;
  v_charges_unstamped boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_multiplix_connection' USING ERRCODE = '22023';
  END IF;

  -- Politica explicita de medicao invalida: o teto so vale como numero JSON inteiro
  -- nao-negativo de ate 9 digitos; qualquer outra forma cai no default desta funcao
  -- (0 = fail-closed). Ausente ja caia em 0; ilegivel/grande demais deixava de
  -- derrubar a chamada inteira com 22P02/22003.
  SELECT CASE
           WHEN jsonb_typeof(settings.value) = 'number'
            AND settings.value::text ~ '^[0-9]{1,9}$'
           THEN settings.value::text::integer
           ELSE 0
         END
    INTO v_limit
    FROM public.talkx_settings AS settings
   WHERE settings.key = 'daily_limit_per_connection';
  v_limit := COALESCE(v_limit, 0);

  -- O teto e por dia local de Sao Paulo (mesma referencia do ADR-007 D2).
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';

  -- Trafego sem conexao carimbada vai pela primeira conexao conectada: o composer
  -- ainda nao escolhe conexao e o worker cai na primeira connected que encontra.
  -- Para o teto dela valer tambem para esse trafego, o NULL e cobrado dessa
  -- primeira conexao. Sem conexao conectada a comparacao e NULL e nada e cobrado
  -- (mesmo comportamento de antes: nao ha a quem cobrar).
  v_charges_unstamped := p_connection_id = (
    SELECT connection.id
      FROM public.whatsapp_connections AS connection
     WHERE connection.status = 'connected'
     ORDER BY connection.created_at, connection.id
     LIMIT 1
  );

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients AS recipient
      JOIN public.talkx_campaigns AS campaign ON campaign.id = recipient.campaign_id
     WHERE (campaign.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND campaign.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_day_start
    UNION ALL
    -- Contrato ATUAL do Multiplix (F32/F55): quem carimba e o ITEM; uma mensagem por
    -- bloco, entao N blocos do mesmo destinatario consomem N.
    SELECT count(*)
      FROM public.multiplix_delivery_items AS item
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = item.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND item.sent_at >= v_day_start
    UNION ALL
    -- LEGADO (fila por destinatario, anterior ao F32): so o disparo SEM itens entra
    -- por aqui; o que tem itens ja foi contado acima e nao conta duas vezes.
    SELECT count(*)
      FROM public.multiplix_recipients AS recipient
      JOIN public.multiplix_dispatches AS dispatch ON dispatch.id = recipient.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_day_start
       AND NOT EXISTS (
             SELECT 1
               FROM public.multiplix_delivery_items AS item_of_dispatch
              WHERE item_of_dispatch.dispatch_id = dispatch.id
           )
  ) AS usage;

  RETURN jsonb_build_object(
    'limit', COALESCE(v_limit, 0),
    'sent', COALESCE(v_sent, 0),
    'remaining', GREATEST(COALESCE(v_limit, 0) - COALESCE(v_sent, 0), 0),
    'day_start', v_day_start
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.multiplix_connection_daily_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.multiplix_connection_daily_usage(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- A MESMA fonte de consumo para o orcamento do Talk X (o teto e compartilhado
-- entre os dois modulos na mesma conexao, que e o ponto do F17/X018).
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.talkx_connection_send_budget(p_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_minute_limit integer;
  v_day_limit integer;
  v_minute_sent integer;
  v_day_sent integer;
  v_minute_start timestamptz;
  v_day_start timestamptz;
  v_next_day_at timestamptz;
  v_charges_unstamped boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_talkx_connection' USING ERRCODE = '22023';
  END IF;

  -- Politica explicita de medicao invalida: valor ilegivel ou grande demais cai no
  -- default desta funcao (6 por minuto, 500 por dia) em vez de levantar 22P02/22003
  -- no cast.
  SELECT CASE
           WHEN jsonb_typeof(settings.value) = 'number'
            AND settings.value::text ~ '^[0-9]{1,9}$'
           THEN settings.value::text::integer
           ELSE 6
         END
    INTO v_minute_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'max_per_minute_per_connection';
  v_minute_limit := COALESCE(v_minute_limit, 6);

  SELECT CASE
           WHEN jsonb_typeof(settings.value) = 'number'
            AND settings.value::text ~ '^[0-9]{1,9}$'
           THEN settings.value::text::integer
           ELSE 500
         END
    INTO v_day_limit
    FROM public.talkx_settings settings
   WHERE settings.key = 'daily_limit_per_connection';
  v_day_limit := COALESCE(v_day_limit, 500);

  v_minute_start := statement_timestamp() - interval '1 minute';
  v_day_start := date_trunc('day', statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')
                 AT TIME ZONE 'America/Sao_Paulo';
  v_next_day_at := v_day_start + interval '1 day';

  -- Mesma regra da cota do Multiplix: sem conexao carimbada, o consumo e cobrado da
  -- primeira conexao conectada (a que o worker escolhe nesse caso).
  v_charges_unstamped := p_connection_id = (
    SELECT connection.id
      FROM public.whatsapp_connections AS connection
     WHERE connection.status = 'connected'
     ORDER BY connection.created_at, connection.id
     LIMIT 1
  );

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_minute_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients recipient
      JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id
     WHERE (campaign.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND campaign.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_minute_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_delivery_items item
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = item.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND item.sent_at >= v_minute_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_recipients recipient
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_minute_start
       AND NOT EXISTS (
             SELECT 1
               FROM public.multiplix_delivery_items item_of_dispatch
              WHERE item_of_dispatch.dispatch_id = dispatch.id
           )
  ) AS usage;

  SELECT COALESCE(sum(usage.sent), 0)::integer INTO v_day_sent FROM (
    SELECT count(*) AS sent
      FROM public.talkx_recipients recipient
      JOIN public.talkx_campaigns campaign ON campaign.id = recipient.campaign_id
     WHERE (campaign.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND campaign.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_day_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_delivery_items item
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = item.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND item.sent_at >= v_day_start
    UNION ALL
    SELECT count(*)
      FROM public.multiplix_recipients recipient
      JOIN public.multiplix_dispatches dispatch ON dispatch.id = recipient.dispatch_id
     WHERE (dispatch.whatsapp_connection_id = p_connection_id
            OR (v_charges_unstamped AND dispatch.whatsapp_connection_id IS NULL))
       AND recipient.sent_at >= v_day_start
       AND NOT EXISTS (
             SELECT 1
               FROM public.multiplix_delivery_items item_of_dispatch
              WHERE item_of_dispatch.dispatch_id = dispatch.id
           )
  ) AS usage;

  RETURN jsonb_build_object(
    'minute_limit', v_minute_limit,
    'minute_sent', v_minute_sent,
    'minute_remaining', GREATEST(v_minute_limit - v_minute_sent, 0),
    'day_limit', v_day_limit,
    'day_sent', v_day_sent,
    'day_remaining', GREATEST(v_day_limit - v_day_sent, 0),
    'next_day_at', v_next_day_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.talkx_connection_send_budget(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.talkx_connection_send_budget(uuid)
  TO service_role;
