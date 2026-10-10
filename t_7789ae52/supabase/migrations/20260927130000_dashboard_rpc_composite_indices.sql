-- Composite indices for dashboard_kpi RPC query performance
-- conversation_closures: filters on created_at, often with contact_id
CREATE INDEX IF NOT EXISTS idx_closures_created_contact
  ON public.conversation_closures(created_at, contact_id);

-- conversation_sla: filters on first_message_at, often with contact_id
CREATE INDEX IF NOT EXISTS idx_sla_first_msg_contact
  ON public.conversation_sla(first_message_at, contact_id);

-- contacts: filters on assigned_to, often with queue_id
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_queue
  ON public.contacts(assigned_to, queue_id);
