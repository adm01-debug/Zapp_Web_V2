-- E52: idx_messages_channel_connection_id
-- Evidence: 464 kB, 0 index scans; channel_connections has 0 rows (feature inactive)
-- Safe to remove: no queries depend on this index (confirmed via pg_stat_user_indexes)
DROP INDEX IF EXISTS public.idx_messages_channel_connection_id;

-- E53: idx_contacts_type
-- Evidence: 0 index scans; duplicate of idx_contacts_contact_type (same column contact_type)
-- Keeping idx_contacts_contact_type which has the same coverage
DROP INDEX IF EXISTS public.idx_contacts_type;
