-- PROPOSTA P006 — NÃO APLICADA — Auditoria 2026-10-22
-- Objeto: storage.objects — policy 'Conversation members can read team chat files'
-- Problema: A policy usa role 'public' em vez de 'authenticated'.
--   Na prática, anon é bloqueado pelas condições USING (auth.uid() retorna NULL para anon),
--   mas o role 'public' aplica a policy ao papel anon. Mudança futura nas condições USING
--   pode expor arquivos de chat de equipe para usuários não autenticados.
--
--   Evidência:
--     SELECT policyname, roles, cmd FROM pg_policies
--     WHERE schemaname='storage' AND 'public' = ANY(roles);
--     → {policyname: 'Conversation members can read team chat files', roles: ['public'], cmd: 'SELECT'}
--
-- Impacto se não corrigido: Risco de manutenção — sem impacto imediato, mas superfície de risco para
--   futura exposição acidental de arquivos de team chat.
--
-- ROLLBACK:
--   ALTER POLICY "Conversation members can read team chat files"
--     ON storage.objects TO public;
--
-- ATENÇÃO: O nome exato da policy e as condições USING devem ser confirmados via:
--   SELECT policyname, qual FROM pg_policies
--   WHERE schemaname='storage' AND policyname='Conversation members can read team chat files';
--   Substituir o USING abaixo pelo qual real antes de aplicar.

ALTER POLICY "Conversation members can read team chat files"
  ON storage.objects
  TO authenticated;
-- Manter o USING original intacto — apenas a role muda.
