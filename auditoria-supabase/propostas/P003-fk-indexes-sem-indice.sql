-- PROPOSTA P003 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: 20 FKs sem índice na coluna referenciante (S4-01)
-- Problema: DELETE/UPDATE em tabelas pai dispara sequential scan em cada tabela filha afetada.
--   talkx_campaigns tem 6 FKs para profiles sem índice — exclusão de profile gera 6 seq scans.
--
--   Evidência (Q3 de S4): 20 colunas de FK sem índice correspondente, incluindo:
--     talkx_campaigns.(launched_by, cancelled_by, consent_confirmed_by, owner, paused_by, responsible_id, template_version_id)
--     multiplix_delivery_items.(recipient_id, block_id, voice_asset_id)
--     conversation_events.(from_queue_id, to_queue_id)
--     talkx_templates.current_version_id
--
-- Impacto se não corrigido: Em produção com volume crescente, operações de manutenção
--   (exclusão de profile, update de template_version) tornam-se proibitivamente lentas.
--
-- ROLLBACK (em ordem inversa):
--   DROP INDEX IF EXISTS idx_talkx_campaigns_launched_by;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_cancelled_by;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_consent_confirmed_by;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_owner;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_paused_by;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_responsible_id;
--   DROP INDEX IF EXISTS idx_talkx_campaigns_template_version_id;
--   DROP INDEX IF EXISTS idx_multiplix_delivery_items_recipient_id;
--   DROP INDEX IF EXISTS idx_multiplix_delivery_items_block_id;
--   DROP INDEX IF EXISTS idx_multiplix_delivery_items_voice_asset_id;
--   DROP INDEX IF EXISTS idx_conversation_events_from_queue_id;
--   DROP INDEX IF EXISTS idx_conversation_events_to_queue_id;
--   DROP INDEX IF EXISTS idx_talkx_templates_current_version_id;
--
-- NOTA: Usar CREATE INDEX (não CONCURRENTLY) pois o gateway envolve em transação (CLAUDE.md regra 5).

-- talkx_campaigns — 6 FKs para profiles/outros sem índice
CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_launched_by
  ON public.talkx_campaigns (launched_by)
  WHERE launched_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_cancelled_by
  ON public.talkx_campaigns (cancelled_by)
  WHERE cancelled_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_consent_confirmed_by
  ON public.talkx_campaigns (consent_confirmed_by)
  WHERE consent_confirmed_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_owner
  ON public.talkx_campaigns (owner)
  WHERE owner IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_paused_by
  ON public.talkx_campaigns (paused_by)
  WHERE paused_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_responsible_id
  ON public.talkx_campaigns (responsible_id)
  WHERE responsible_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_talkx_campaigns_template_version_id
  ON public.talkx_campaigns (template_version_id)
  WHERE template_version_id IS NOT NULL;

-- multiplix_delivery_items
CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_recipient_id
  ON public.multiplix_delivery_items (recipient_id)
  WHERE recipient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_block_id
  ON public.multiplix_delivery_items (block_id)
  WHERE block_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_multiplix_delivery_items_voice_asset_id
  ON public.multiplix_delivery_items (voice_asset_id)
  WHERE voice_asset_id IS NOT NULL;

-- conversation_events
CREATE INDEX IF NOT EXISTS idx_conversation_events_from_queue_id
  ON public.conversation_events (from_queue_id)
  WHERE from_queue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_events_to_queue_id
  ON public.conversation_events (to_queue_id)
  WHERE to_queue_id IS NOT NULL;

-- talkx_templates
CREATE INDEX IF NOT EXISTS idx_talkx_templates_current_version_id
  ON public.talkx_templates (current_version_id)
  WHERE current_version_id IS NOT NULL;
