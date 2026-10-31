-- PROPOSTA P005 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: storage.buckets — id: multiplix-voice
-- Problema: Bucket privado multiplix-voice não tem file_size_limit definido (NULL).
--   Os outros buckets privados têm limites: audio-messages=50MB, whatsapp-media=100MB.
--   Sem limite, uploads podem consumir storage ilimitado — bug de cliente ou abuso gera custos inesperados.
--
--   Evidência:
--     SELECT id, name, public, file_size_limit FROM storage.buckets ORDER BY name;
--     → {id: "multiplix-voice", public: false, file_size_limit: null}
--
-- Impacto se não corrigido: Custo inesperado no Supabase Storage por uploads sem teto.
--
-- ROLLBACK:
--   UPDATE storage.buckets SET file_size_limit = NULL WHERE id = 'multiplix-voice';
--
-- NOTA: Valor sugerido 52428800 = 50 MB, alinhado com audio-messages.
--   Ajustar conforme uso real de assets de voz do Multiplix.

UPDATE storage.buckets
SET file_size_limit = 52428800  -- 50 MB em bytes
WHERE id = 'multiplix-voice';
