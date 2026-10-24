-- 20260902000700_fix_search_contacts_order_tiebreaker
-- Superseded por 20260902230000 (fix_search_contacts_id_tiebreaker), que redefine
-- search_contacts com o tiebreaker final. Esta migration vira no-op explicito para
-- manter o replay valido em ambientes novos sem duplicar a alteracao.

DO $$
BEGIN
  RAISE NOTICE '20260902000700 superseded por 20260902230000 — no-op';
END $$;
