CREATE UNIQUE INDEX ux_messages_dedup_v2 ON public.messages (whatsapp_connection_id, external_id, sender)

DROP INDEX public.ux_messages_dedup

ALTER INDEX public.ux_messages_dedup_v2 RENAME TO ux_messages_dedup
