-- Audit 24/09 (achado MEDIO do agente de banco) -- catalog_send_events.SELECT e
-- catalog_favorites (FOR ALL) nao tinham "TO authenticated": a policy so
-- filtra por linha (USING), mas roda pro role "public", que no Postgres/RLS
-- do Supabase inclui a role "anon". Mitigado na pratica porque a app exige
-- login pra chamar essas rotas, mas fica inconsistente com o irmao
-- (catalog_send_events.INSERT ja corrigido em 20260924123033) e com o padrao
-- do resto do RLS do catalogo.
--
-- Mesmo USING de antes -- so restringe pra role authenticated, sem mudar
-- comportamento de quem ja loga.

DROP POLICY IF EXISTS "Users can view own catalog send events" ON public.catalog_send_events;

CREATE POLICY "Users can view own catalog send events"
ON public.catalog_send_events
FOR SELECT
TO authenticated
USING (
  agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
  OR is_admin_or_supervisor(auth.uid())
);

DROP POLICY IF EXISTS "Users can manage own catalog favorites" ON public.catalog_favorites;

CREATE POLICY "Users can manage own catalog favorites"
ON public.catalog_favorites
FOR ALL
TO authenticated
USING (user_id = auth.uid());
