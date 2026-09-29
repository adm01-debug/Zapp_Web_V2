-- =============================================================================
-- W4 -- BASELINE: indice de `public.contacts` exatamente como o canonico no HEAD.
-- =============================================================================
-- Fonte: `supabase/schema-manifest.json` (chaves `indexes`, prefixo `contacts.`) +
-- migrations. Este e o conjunto ANTES de qualquer proposta.
--
-- NOTA CENTRAL: os GIN trigram de name/nickname/surname/phone/company/job_title
-- existiram (20260328175125 / 20260511233446) e foram REMOVIDOS por
-- 20260902100004_e54_drop_dead_indexes_fix_search_contacts.sql com a justificativa
-- registrada no proprio arquivo:
--     "idx_contacts_name_trgm (592 kB, 0 scans) — seqscan vence em 1105 rows"
-- Ou seja: a decisao foi tomada quando a tabela tinha ~1.105 linhas. O baseline
-- reproduzido aqui e o HEAD (trgm so em `email`).
-- =============================================================================

-- 20260511233446 (BLOCK 08, idempotente)
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON public.contacts USING btree (assigned_to);
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON public.contacts USING btree (contact_type);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON public.contacts USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_asc ON public.contacts USING btree (name);
CREATE INDEX IF NOT EXISTS idx_contacts_queue_id ON public.contacts USING btree (queue_id);

-- 20260827120000 (FK backfill)
CREATE INDEX IF NOT EXISTS idx_contacts_channel_connection_id ON public.contacts (channel_connection_id);
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_connection_id ON public.contacts (whatsapp_connection_id);

-- 20260902150000 / 20260905090000 / 20260906000001
CREATE INDEX IF NOT EXISTS idx_contacts_updated_at ON public.contacts (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_conv_status_active
  ON public.contacts(conversation_status) WHERE conversation_status NOT IN ('resolved', 'archived');
CREATE INDEX IF NOT EXISTS idx_contacts_is_lid_legacy
  ON public.contacts(is_lid_legacy) WHERE is_lid_legacy = true;

-- 20260927130000 / 20260927360000 / 20260927620000
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_queue ON public.contacts(assigned_to, queue_id);
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to_gamif
  ON public.contacts(assigned_to) WHERE assigned_to IS NOT NULL;

-- 20260929370000 (HEAD) -- so serve para ACHAR excluidos (WHERE deleted_at IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_contacts_deleted_at
  ON public.contacts (deleted_at) WHERE deleted_at IS NOT NULL;
