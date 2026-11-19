-- X065/BUG — no PRIMEIRO snapshot, a decisao do worker sobre a variante vale,
-- inclusive quando ela e "nenhuma variante".
--
-- O QUE ESTAVA ERRADO (achado da revisao da PR #3271, confirmado no banco ao
-- vivo antes do patch):
--
-- A 20261118210000 + o mapeamento em talkx-send fizeram o worker honrar a
-- variante atribuida no snapshot, e a correcao da precedencia X020 fez ele
-- passar `p_variant_id => NULL` quando o texto proprio da campanha vence. So
-- que passar NULL aqui NAO limpava nada:
--
--   variant_id = COALESCE(recipient.variant_id, p_variant_id)
--
-- `recipient.variant_id` ja vale A (gravado por snapshot_talkx_campaign_audience),
-- entao COALESCE(A, NULL) = A. A mensagem saia com o texto proprio da campanha
-- e a linha continuava dizendo "variante A" — e `talkx_campaign_variant_stats`
-- agrupa por essa coluna. Entrega e resposta desse envio entravam na estatistica
-- de uma variante que nao foi enviada, e `decide_talkx_ab_winner` escolheria a
-- vencedora com numero sujo.
--
-- A CORRECAO e o padrao que a PROPRIA funcao ja usa nos outros tres campos
-- (personalized_message, media_url_snapshot, media_type_snapshot):
--
--   CASE WHEN recipient.message_snapshot_at IS NULL THEN <parametro>
--        ELSE <valor existente> END
--
-- Ou seja: no primeiro snapshot quem decide e quem esta enviando; a partir dai
-- o snapshot e imutavel e a retentativa preserva. Isso mantem intacta a garantia
-- de idempotencia (a razao do COALESCE) e corrige o unico caso em que ele
-- mentia: NULL deliberado.
--
-- `variant_id_snapshot` segue a mesma regra, caindo para `recipient.variant_id`
-- quando o snapshot ja existe — preserva o historico de quem ja enviou.
--
-- NAO MUDA A ASSINATURA: mesma lista de parametros, mesmo RETURNS TABLE. Nenhum
-- chamador precisa mudar.
--
-- IMPACTO ATE AGORA: nenhum. `ab_enabled` e falso em todas as campanhas
-- (medido), entao nenhuma estatistica A/B foi produzida.
--
-- Rollback: recriar a versao anterior trocando os dois CASE pelos COALESCE.

CREATE OR REPLACE FUNCTION public.persist_talkx_recipient_message_snapshot(
  p_recipient_id uuid,
  p_claim_token uuid,
  p_personalized_message text,
  p_media_url text DEFAULT NULL::text,
  p_media_type text DEFAULT NULL::text,
  p_variant_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(personalized_message text, media_url_snapshot text, media_type_snapshot text, variant_id_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.talkx_recipients%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_recipient_id IS NULL OR p_claim_token IS NULL
     OR p_personalized_message IS NULL
     OR length(p_personalized_message) NOT BETWEEN 1 AND 65536
     OR (p_media_url IS NULL) IS DISTINCT FROM (p_media_type IS NULL)
     OR (p_media_url IS NOT NULL AND length(btrim(p_media_url)) NOT BETWEEN 1 AND 8192)
     OR (p_media_type IS NOT NULL AND p_media_type NOT IN ('image', 'video', 'document', 'audio')) THEN
    RAISE EXCEPTION 'invalid_talkx_recipient_message_snapshot' USING ERRCODE = '22023';
  END IF;

  UPDATE public.talkx_recipients AS recipient
     SET personalized_message = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_personalized_message
           ELSE recipient.personalized_message
         END,
         media_url_snapshot = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN NULLIF(btrim(p_media_url), '')
           ELSE recipient.media_url_snapshot
         END,
         media_type_snapshot = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_media_type
           ELSE recipient.media_type_snapshot
         END,
         -- X065: no primeiro snapshot vale a decisao do worker, NULL incluso.
         variant_id = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_variant_id
           ELSE recipient.variant_id
         END,
         variant_id_snapshot = CASE
           WHEN recipient.message_snapshot_at IS NULL THEN p_variant_id
           ELSE COALESCE(recipient.variant_id_snapshot, recipient.variant_id)
         END,
         message_snapshot_at = COALESCE(recipient.message_snapshot_at, statement_timestamp()),
         updated_at = statement_timestamp()
   WHERE recipient.id = p_recipient_id
     AND recipient.status = 'sending'
     AND recipient.delivery_claim_token = p_claim_token
  RETURNING recipient.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'talkx_delivery_claim_conflict' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT v_row.personalized_message,
         v_row.media_url_snapshot,
         v_row.media_type_snapshot,
         v_row.variant_id_snapshot;
END;
$function$
