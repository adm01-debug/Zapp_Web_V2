-- Composite index for the most common query pattern: active rules ordered by priority
CREATE INDEX IF NOT EXISTS idx_sla_rules_active_priority
  ON public.sla_rules (is_active, priority DESC);

-- Index for contact-specific lookups (highest priority in hierarchy)
CREATE INDEX IF NOT EXISTS idx_sla_rules_contact_id
  ON public.sla_rules (contact_id) WHERE contact_id IS NOT NULL;

-- Index for queue-based lookups
CREATE INDEX IF NOT EXISTS idx_sla_rules_queue_id
  ON public.sla_rules (queue_id) WHERE queue_id IS NOT NULL;

-- Index for agent-based lookups
CREATE INDEX IF NOT EXISTS idx_sla_rules_agent_id
  ON public.sla_rules (agent_id) WHERE agent_id IS NOT NULL;