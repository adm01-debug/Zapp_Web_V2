-- FIX-S09-002: Bucket multiplix-voice — sem policies RLS e sem restricao de MIME
-- Problema: Bucket criado em 2026-10-03 sem policies de RLS e sem restricao de MIME type.
--
-- NAO APLICAR EM PRODUCAO SEM APROVACAO DO JOAQUIM

-- PASSO 1: Definir MIME types permitidos
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/webm','audio/aac']
WHERE id = 'multiplix-voice';

-- PASSO 2: Criar policy de RLS para o bucket
CREATE POLICY "multiplix-voice-service-role" ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'multiplix-voice')
  WITH CHECK (bucket_id = 'multiplix-voice');

-- Verificacao:
SELECT id, name, public, allowed_mime_types, file_size_limit
FROM storage.buckets
WHERE id = 'multiplix-voice';

-- ROLLBACK:
/*
UPDATE storage.buckets SET allowed_mime_types = NULL WHERE id = 'multiplix-voice';
DROP POLICY IF EXISTS "multiplix-voice-service-role" ON storage.objects;
*/

-- RISCO DE REGRESSAO: BAIXO
-- O acesso atual ja e service_role only pela ausencia de policies (RLS bloqueante).
