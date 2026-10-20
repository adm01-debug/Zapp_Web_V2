-- Strip PII/tokens de talkx_recipients da publicação supabase_realtime.
-- Achado da auditoria de 5 agentes (2026-09-27): as colunas personalized_message,
-- delivery_claim_token e delivery_last_claim_token estavam expostas no canal
-- Realtime — o mesmo hardening de multiplix_recipients (20260927210000) não havia
-- sido replicado aqui. Ambas as tabelas têm estrutura idêntica de entrega.

ALTER PUBLICATION supabase_realtime DROP TABLE public.talkx_recipients;

ALTER PUBLICATION supabase_realtime ADD TABLE public.talkx_recipients (
  id,
  campaign_id,
  contact_id,
  status,
  sent_at,
  delivered_at,
  error_message,
  created_at,
  updated_at,
  variant_id,
  external_id,
  delivery_claimed_at,
  delivery_claim_expires_at,
  delivery_claimed_by,
  delivery_attempt_count,
  provider_dispatch_started_at,
  variant_id_snapshot,
  message_snapshot_at,
  media_url_snapshot,
  media_type_snapshot,
  replied_at,
  reply_message_id,
  clicked_at,
  click_count,
  attempt_count,
  retry_after
);
