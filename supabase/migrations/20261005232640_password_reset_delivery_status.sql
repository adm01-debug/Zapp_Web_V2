-- password_reset_delivery_status
-- Rollback: recria public.password_reset_requests_safe na forma anterior a esta
-- migration e dropa as 3 colunas de entrega.
-- Rollback (completo):
--   DROP VIEW IF EXISTS public.password_reset_requests_safe;
--   CREATE VIEW public.password_reset_requests_safe WITH (security_invoker = on) AS
--     SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
--            rejection_reason, token_expires_at, ip_address, user_agent, created_at, updated_at
--       FROM public.password_reset_requests;
--   GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
--   GRANT SELECT ON public.password_reset_requests_safe TO service_role;
--   ALTER TABLE public.password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_delivery_status_check;
--   ALTER TABLE public.password_reset_requests DROP COLUMN IF EXISTS delivery_status;
--   ALTER TABLE public.password_reset_requests DROP COLUMN IF EXISTS delivered_at;
--   ALTER TABLE public.password_reset_requests DROP COLUMN IF EXISTS delivery_error;
-- nomes-antigos-conferidos: password_reset_requests_safe — o mesmo nome e recriado nesta migration (a view nao muda de nome; so ganha as colunas de entrega)
--
-- R2-AUTH-007 (item 73): a aprovacao de reset nao tinha como registrar nem distinguir
-- 'sent' de 'failed'. Adiciona o estado de entrega na tabela e o expoe na view segura
-- que o painel ja consome.

ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE public.password_reset_requests ADD COLUMN IF NOT EXISTS delivery_error TEXT;

ALTER TABLE public.password_reset_requests DROP CONSTRAINT IF EXISTS password_reset_requests_delivery_status_check;
ALTER TABLE public.password_reset_requests ADD CONSTRAINT password_reset_requests_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('queued', 'sent', 'failed'));

DROP VIEW IF EXISTS public.password_reset_requests_safe;
CREATE VIEW public.password_reset_requests_safe
WITH (security_invoker = on)
AS
SELECT
  id,
  user_id,
  email,
  reason,
  status,
  reviewed_by,
  reviewed_at,
  rejection_reason,
  token_expires_at,
  delivery_status,
  delivered_at,
  created_at,
  updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
GRANT SELECT ON public.password_reset_requests_safe TO service_role;

COMMENT ON VIEW public.password_reset_requests_safe IS 'Safe view hiding reset_token, ip_address, and user_agent columns';
