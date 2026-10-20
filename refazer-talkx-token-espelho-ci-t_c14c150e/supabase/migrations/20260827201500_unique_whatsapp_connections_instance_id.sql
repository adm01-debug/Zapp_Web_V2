-- Adiciona constraint UNIQUE em whatsapp_connections.instance_id.
-- Previne instâncias duplicadas que causariam ambiguidade no roteamento Evolution.
-- O índice idx_wc_instance_id (btree) ja existia — o UNIQUE aproveita o mesmo índice.
-- Aplicado manualmente ao banco oficial em 2026-08-27; arquivo criado para paridade repo/banco.
ALTER TABLE public.whatsapp_connections
  ADD CONSTRAINT whatsapp_connections_instance_id_key UNIQUE (instance_id);
