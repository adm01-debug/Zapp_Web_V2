-- 20261113170200_away_message_rpcs
--
-- PRECISA DE APROVAÇÃO DO DONO ANTES DE APLICAR EM PRODUÇÃO (regra de negócio
-- nova em produção: a mensagem de ausência passa a ser enviada de verdade).
--
-- Sintoma (13/11/2026): a tela Configurações → Mensagens grava
-- `away_messages` (src/components/settings/MessagesSettings.tsx:122), e o
-- webhook já tem o motor (supabase/functions/_shared/evolution-webhook-messages.ts
-- `sendAwayMessageIfNeeded`, :402), que chama
--   supabase.rpc("should_send_away_message", { p_contact_id, p_connection_id })  (:417)
--   supabase.rpc("record_away_message",      { p_contact_id, p_connection_id })  (:467)
-- e, por desenho, trata QUALQUER erro da decisão como "não enviar" (:421-424).
-- As duas RPCs nunca tiveram migration: em produção
--   SELECT oid FROM pg_proc WHERE proname IN ('should_send_away_message',
--     'record_away_message') → 0 linhas;
-- `grep -rn should_send_away_message supabase/migrations` → 0 arquivos.
-- Resultado: a mensagem cadastrada nunca sai (B16 do inventário).
--
-- Contrato (extraído da edge e do teste evolution-webhook-messages.test.ts:144-146,
-- 286-291):
--   should_send_away_message(p_contact_id uuid, p_connection_id uuid) → text
--     texto a enviar, ou NULL quando não cabe (a edge testa `typeof === "string"`
--     e `.trim().length === 0`);
--   record_away_message(p_contact_id uuid, p_connection_id uuid) → boolean
--     registra o envio; idempotente na janela (true = registrou, false = já
--     havia registro na janela). A edge chama DEPOIS de enfileirar e ignora
--     falha (é trava, não caminho crítico).
--   Chamador: a edge roda com a service key → auth.role() = 'service_role';
--     mesmo guard e mesmos grants de claim_outbound_message /
--     complete_outbound_message / fail_outbound_message (proacl =
--     {postgres=X, service_role=X}; 20261111160000_outbound_post_started.sql:334-337).
--
-- Regras da decisão (cada uma "assumido — dono confirma"):
--   1) só se `away_messages.is_enabled` da conexão e `content` não vazio;
--   2) só FORA do horário de atendimento da conexão, com a mesma regra e o mesmo
--      fuso (America/Sao_Paulo) de public.is_within_business_hours(uuid):
--      dia sem linha em `business_hours` = aberto = não envia; `is_open=false`
--      = fechado o dia todo = envia; aberto = envia só antes de `open_time` ou
--      depois de `close_time`;
--   3) no máximo 1 vez por contato+conexão a cada 24 h (tabela nova
--      `away_message_log`, que esta migration cria — não existia tabela de
--      registro);
--   4) o texto volta como está (btrim); a tela não oferece variáveis, então não
--      há placeholder para resolver.
--   A regra "nunca com atendente atribuído" já é checada pela edge antes de
--   chamar a RPC (:410).
--
-- `away_message_log`: RLS ligada e SEM policy — só as RPCs (SECURITY DEFINER,
-- dono postgres) escrevem/leem; anon/authenticated sem grant algum (o default
-- privilege de postgres daria `arwdm` a authenticated — revogado aqui).
-- Duas chamadas simultâneas podem registrar duas linhas; o reenvio real já é
-- barrado pelo UNIQUE de messages (ux_messages_contact_client_message_id, id
-- determinístico por contato+dia UTC), então o log não precisa de UNIQUE.
--
-- Reversão:
--   DROP FUNCTION IF EXISTS public.should_send_away_message(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.record_away_message(uuid, uuid);
--   DROP TABLE IF EXISTS public.away_message_log;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.away_message_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  whatsapp_connection_id uuid NOT NULL
    REFERENCES public.whatsapp_connections(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.away_message_log IS
  'Registro de envio da mensagem de ausência por contato+conexão (janela de 24 h consultada por should_send_away_message). Só service_role, via RPC.';

CREATE INDEX IF NOT EXISTS idx_away_message_log_contato_conexao_sent_at
  ON public.away_message_log (contact_id, whatsapp_connection_id, sent_at DESC);

ALTER TABLE public.away_message_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.away_message_log FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.should_send_away_message(
  p_contact_id uuid,
  p_connection_id uuid
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_content text;
  v_enabled boolean;
  v_day integer;
  v_time time;
  v_is_open boolean;
  v_open_time time;
  v_close_time time;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) mensagem cadastrada e ligada para a conexão
  SELECT am.content, am.is_enabled
    INTO v_content, v_enabled
  FROM public.away_messages AS am
  WHERE am.whatsapp_connection_id = p_connection_id;
  IF NOT FOUND OR NOT COALESCE(v_enabled, false)
     OR NULLIF(btrim(v_content), '') IS NULL THEN
    RETURN NULL;
  END IF;

  -- 2) só fora do horário de atendimento (mesma regra de is_within_business_hours)
  v_day  := EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo'));
  v_time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  SELECT bh.is_open, bh.open_time, bh.close_time
    INTO v_is_open, v_open_time, v_close_time
  FROM public.business_hours AS bh
  WHERE bh.whatsapp_connection_id = p_connection_id
    AND bh.day_of_week = v_day;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF COALESCE(v_is_open, true)
     AND v_time >= v_open_time AND v_time <= v_close_time THEN
    RETURN NULL;
  END IF;

  -- 3) no máximo 1 por contato+conexão a cada 24 h
  IF EXISTS (
    SELECT 1 FROM public.away_message_log AS l
    WHERE l.contact_id = p_contact_id
      AND l.whatsapp_connection_id = p_connection_id
      AND l.sent_at > now() - interval '24 hours'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN btrim(v_content);
END;
$$;

COMMENT ON FUNCTION public.should_send_away_message(uuid, uuid) IS
  'PL-04: texto da mensagem de ausência a enviar ao contato, ou NULL quando não cabe (desligada, dentro do horário de atendimento ou já enviada há menos de 24 h). Só service_role (webhook).';

REVOKE ALL ON FUNCTION public.should_send_away_message(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.should_send_away_message(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_away_message(
  p_contact_id uuid,
  p_connection_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_contact_id IS NULL OR p_connection_id IS NULL THEN
    RAISE EXCEPTION 'invalid_away_message_record' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.away_message_log (contact_id, whatsapp_connection_id)
  SELECT p_contact_id, p_connection_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.away_message_log AS l
    WHERE l.contact_id = p_contact_id
      AND l.whatsapp_connection_id = p_connection_id
      AND l.sent_at > now() - interval '24 hours'
  )
  RETURNING id INTO v_id;

  RETURN v_id IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.record_away_message(uuid, uuid) IS
  'PL-04: registra o envio da mensagem de ausência (contato+conexão). Idempotente na janela de 24 h: true = registrou, false = já havia. Só service_role (webhook).';

REVOKE ALL ON FUNCTION public.record_away_message(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_away_message(uuid, uuid)
  TO service_role;
