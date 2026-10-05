-- password_reset_safe_view_keep_ip
-- Rollback: recria public.password_reset_requests_safe na forma deixada por
--   20261005232640_password_reset_delivery_status.sql (com delivery_status/delivered_at
--   e SEM ip_address/user_agent) e volta o COMMENT anterior.
-- Rollback (completo):
--   DROP VIEW IF EXISTS public.password_reset_requests_safe;
--   CREATE VIEW public.password_reset_requests_safe WITH (security_invoker = on) AS
--     SELECT id, user_id, email, reason, status, reviewed_by, reviewed_at,
--            rejection_reason, token_expires_at, delivery_status, delivered_at,
--            created_at, updated_at
--       FROM public.password_reset_requests;
--   GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
--   GRANT SELECT ON public.password_reset_requests_safe TO service_role;
--   COMMENT ON VIEW public.password_reset_requests_safe IS 'Safe view hiding reset_token, ip_address, and user_agent columns';
-- nomes-antigos-conferidos: password_reset_requests_safe — o mesmo nome e recriado nesta migration (a view nao muda de nome)
--
-- R2-AUTH-007 (item 73): a migration 20261005232640 recriou a view segura sem as
-- colunas ip_address/user_agent que a forma em vigor (20260411111454) expunha, e o
-- painel administrativo mostra "IP: {ip_address}" — a linha desapareceria sem que o
-- cartao pedisse mudanca de contrato. Esta migration devolve a view ao contrato de
-- hoje ACRESCENTANDO as colunas de entrega (aditivo puro) e corrige o COMMENT, que
-- descrevia uma ocultacao que a view nao praticava.

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
  ip_address,
  user_agent,
  delivery_status,
  delivered_at,
  created_at,
  updated_at
FROM public.password_reset_requests;

GRANT SELECT ON public.password_reset_requests_safe TO authenticated;
GRANT SELECT ON public.password_reset_requests_safe TO service_role;

COMMENT ON VIEW public.password_reset_requests_safe IS 'Solicitacoes de reset para revisao (sem reset_token): status, revisao, IP e estado de entrega (delivery_status/delivered_at)';
