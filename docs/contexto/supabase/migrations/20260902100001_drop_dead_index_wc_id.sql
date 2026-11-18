-- GAP-01 auditoria 02/09/2026: idx_messages_whatsapp_connection_id tinha 0 scans
     -- desde reset. ux_messages_dedup(whatsapp_connection_id, external_id, sender)
     -- ja cobre wc_id como col[0] — o planner usa para FK constraint check via
     -- leading column scan. DROP elimina 96 kB de write overhead gratuito em
     -- cada INSERT de mensagem.
     DROP INDEX public.idx_messages_whatsapp_connection_id;
