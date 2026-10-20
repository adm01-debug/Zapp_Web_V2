-- E32 (Fase 4 — Identidade LID/JID): tabela de mapeamento Linked-Device ID → JID
-- WhatsApp entrega LIDs (linked-device IDs) em vez de JIDs em alguns eventos
-- quando SenderAlt não está presente no payload do Evolution GO.
-- Esta tabela persiste o par LID/JID para resolver corretamente a identidade.
-- Estado: 270 contatos-LID no banco (14-18 dígitos), 68 criados em 01/09/2026.
-- Diagnóstico de LID: phone com length >= 14 sem DDI E.164 reconhecível.

CREATE TABLE public.contact_identity_map (
  lid         text PRIMARY KEY,
  jid         text        NOT NULL,
  first_seen  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz NOT NULL DEFAULT now(),
  source      text
);

COMMENT ON TABLE public.contact_identity_map
  IS 'Mapeamento de WhatsApp Linked-Device IDs (LIDs) para JIDs reais. '
     'Usado para resolver identidade de contatos quando Evolution GO entrega LIDs.';
COMMENT ON COLUMN public.contact_identity_map.lid
  IS 'Linked-Device ID — identificador de 14-18 dígitos sem DDI E.164 válido';
COMMENT ON COLUMN public.contact_identity_map.jid
  IS 'JID real — phone E.164 válido (ex: 5511999999999)';
COMMENT ON COLUMN public.contact_identity_map.source
  IS 'Origem do mapeamento: SenderAlt (webhook), manual, inference';

-- Índice para lookup reverso JID → LID
CREATE INDEX idx_contact_identity_map_jid
  ON public.contact_identity_map (jid);

-- RLS: apenas service_role escreve; supervisor+ lê
ALTER TABLE public.contact_identity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_full_access
  ON public.contact_identity_map
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY supervisor_read
  ON public.contact_identity_map
  FOR SELECT TO authenticated
  USING (is_admin_or_supervisor(auth.uid()));
