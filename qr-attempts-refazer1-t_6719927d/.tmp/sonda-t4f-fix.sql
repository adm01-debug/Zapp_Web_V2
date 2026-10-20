\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.probe_qr (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 seconds'),
  -- variante BUG: ancoras absolutas (o defeito recusado)
  CONSTRAINT probe_ttl CHECK (expires_at >= created_at + interval '15 seconds' AND expires_at <= created_at + interval '300 seconds'));
-- T4f isolado: criado ha 1 h, expiracao 60 s depois -> o relativo ACEITA, o absoluto RECUSA
INSERT INTO public.probe_qr (connection_id, created_at, expires_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', now() - interval '1 hour',
    (now() - interval '1 hour') + interval '60 seconds');
ROLLBACK;
