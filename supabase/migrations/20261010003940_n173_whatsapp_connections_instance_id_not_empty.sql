-- n173-whatsapp-connections-instance-id-not-empty
-- Rollback: ALTER TABLE public.whatsapp_connections DROP CONSTRAINT IF EXISTS whatsapp_connections_instance_id_not_empty;
-- Rollback (SQL executável, na ordem):
--   ALTER TABLE public.whatsapp_connections DROP CONSTRAINT IF EXISTS whatsapp_connections_instance_id_not_empty;
--
-- N-173: impedir conexao de WhatsApp sem identificador da instancia.
-- A coluna instance_id da whatsapp_connections nasceu como TEXT nullable
-- (20251215024517). Sem CHECK, INSERT com NULL ou '' cria "fantasmas" que
-- escapam da trava de duplicidade (whatsapp_connections_instance_id_key).
-- O indice idx_wc_instance_id ja foi dropado na migration 20260902000300.

ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_instance_id_not_empty
  CHECK (NULLIF(btrim(instance_id), '') IS NOT NULL)
  NOT VALID;
