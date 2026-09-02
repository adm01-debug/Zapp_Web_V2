-- GAP-05 auditoria 02/09/2026: dedup_baseline_20260901 nao existe.
-- Criar snapshot do estado atual dos contatos-LID para audit trail.
-- E35 (normalizePhone) foi deployado em PR #120 (merged 01/09 23:59);
-- este snapshot captura o estado pos-correc ao dos LIDs historicos
-- antes de qualquer backfill E33.
CREATE TABLE public.lid_audit_snapshot_20260902 (
  phone            text        NOT NULL,
  contact_id       uuid        NOT NULL,
  phone_length     int         NOT NULL,
  first_message_at timestamptz,
  last_message_at  timestamptz,
  message_count    int,
  created_at       timestamptz NOT NULL,
  snapshot_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.lid_audit_snapshot_20260902
  (phone, contact_id, phone_length, first_message_at, last_message_at, message_count, created_at)
SELECT
  c.phone,
  c.id AS contact_id,
  length(c.phone) AS phone_length,
  MIN(m.created_at) AS first_message_at,
  MAX(m.created_at) AS last_message_at,
  COUNT(m.id)::int AS message_count,
  c.created_at
FROM contacts c
LEFT JOIN messages m ON m.contact_id = c.id
WHERE length(c.phone) >= 14
GROUP BY c.id, c.phone, c.created_at;

-- Indice para queries de analise posterior
CREATE INDEX idx_lid_snapshot_phone ON public.lid_audit_snapshot_20260902 (phone);
CREATE INDEX idx_lid_snapshot_contact ON public.lid_audit_snapshot_20260902 (contact_id);

COMMENT ON TABLE public.lid_audit_snapshot_20260902 IS
  'Audit snapshot de contatos-LID (phone >= 14 digitos) capturado em 02/09/2026
   apos deploy de E35 (normalizePhone reject LIDs). Referencia para backfill E33
   (contact_identity_map LID->JID). Nao deletar antes de E33 ser implementado.';
