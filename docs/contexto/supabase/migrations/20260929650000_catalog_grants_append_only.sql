REVOKE ALL PRIVILEGES (id, user_id, product_id, product_name, product_sku, primary_image_url, created_at)
  ON TABLE public.catalog_favorites FROM anon, authenticated

REVOKE ALL PRIVILEGES (id, product_id, product_name, product_sku, variant_label, contact_id, agent_id,
  template, images_count, message_length, status, message_ids, created_at)
  ON TABLE public.catalog_send_events FROM anon, authenticated

REVOKE ALL PRIVILEGES ON TABLE public.catalog_favorites FROM anon, authenticated

REVOKE ALL PRIVILEGES ON TABLE public.catalog_send_events FROM anon, authenticated

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_favorites TO authenticated

GRANT SELECT, INSERT ON TABLE public.catalog_send_events TO authenticated

COMMENT ON TABLE public.catalog_favorites IS
  'Favoritos do catálogo por agente (E50). RLS por dono (policy ALL TO authenticated); grants '
  'de cliente depois do CT-01: SELECT/INSERT/UPDATE/DELETE para authenticated, nada para anon.'

COMMENT ON TABLE public.catalog_send_events IS
  'Log append-only de envios de produto do catálogo (E28). Uma linha por envio, com status '
  'sent/partial/failed e message_ids. Depois do CT-02 o cliente authenticated tem só '
  'SELECT e INSERT; mexer no log depois de gravado exige service_role.'
