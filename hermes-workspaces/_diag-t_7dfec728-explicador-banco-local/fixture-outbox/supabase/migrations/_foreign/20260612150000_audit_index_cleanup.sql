-- ============================================================
-- Migration: Audit fixes from exhaustive technical review
-- Date: 2026-06-12
-- ============================================================

-- ▸ DROP duplicate / never-used indexes
-- (Reduces write amplification and index maintenance overhead)

-- Duplicate on evolution_conversations_wpp2 (0 scans, 128 KB)
DROP INDEX IF EXISTS public.idx_conv_wpp2_last_msg;

-- Duplicate on department_invitations (same cols as the UNIQUE constraint)
DROP INDEX IF EXISTS public.idx_dept_inv_code;

-- Trgm indexes on evolution_contacts with 0 scans (1.5 MB + 264 KB + 120 KB)
DROP INDEX IF EXISTS public.idx_contacts_name_trgm;
DROP INDEX IF EXISTS public.idx_contacts_last_name_trgm;
DROP INDEX IF EXISTS public.idx_contacts_company_trgm;

-- Unused search-vector and message-count indexes (488 KB + 136 KB)
DROP INDEX IF EXISTS public.idx_evolution_contacts_search_vector;
DROP INDEX IF EXISTS public.idx_evolution_contacts_message_count;

-- Unused assigned indexes (272 KB + 160 KB)
DROP INDEX IF EXISTS public.idx_contacts_assigned;
DROP INDEX IF EXISTS public.idx_conversations_wpp2_assigned;

-- Duplicate on solicitacoes_vale
DROP INDEX IF EXISTS public.idx_solic_pendente;

-- ▸ ADD missing critical indexes

-- conversations.contact_id  (missing FK index → full table scans on joins)
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id
  ON public.conversations(contact_id);

-- evolution_conversations.contact_id (partitioned table parent)
CREATE INDEX IF NOT EXISTS idx_evolution_conversations_contact_id
  ON public.evolution_conversations(contact_id);

-- evolution_conversations: status + assignment filter (queue dashboards)
CREATE INDEX IF NOT EXISTS idx_evolution_conversations_status_assigned
  ON public.evolution_conversations(status, assigned_to)
  WHERE assigned_to IS NOT NULL;

-- outbound_message_queue: pending/retry polling (processed by workers)
CREATE INDEX IF NOT EXISTS idx_outbound_queue_status_created
  ON public.outbound_message_queue(status, created_at DESC)
  WHERE status IN ('pending', 'retry');

-- app_notifications: timeline scans (used by notification bell)
CREATE INDEX IF NOT EXISTS idx_app_notifications_created_at
  ON public.app_notifications(created_at DESC);
