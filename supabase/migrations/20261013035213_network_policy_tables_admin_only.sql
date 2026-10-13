-- network_policy_tables_admin_only
-- Rollback: remove as policies de escrita FOR INSERT/UPDATE/DELETE (is_admin) das duas tabelas e recria as policies FOR ALL com is_admin_or_supervisor (supervisor volta a escrever).
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Admins can insert IP whitelist" ON public.ip_whitelist;
--   DROP POLICY IF EXISTS "Admins can update IP whitelist" ON public.ip_whitelist;
--   DROP POLICY IF EXISTS "Admins can delete IP whitelist" ON public.ip_whitelist;
--   CREATE POLICY "Admins can manage IP whitelist" ON public.ip_whitelist FOR ALL TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
--   DROP POLICY IF EXISTS "Admins can insert geo settings" ON public.geo_blocking_settings;
--   DROP POLICY IF EXISTS "Admins can update geo settings" ON public.geo_blocking_settings;
--   DROP POLICY IF EXISTS "Admins can delete geo settings" ON public.geo_blocking_settings;
--   CREATE POLICY "Admins can manage geo settings" ON public.geo_blocking_settings FOR ALL TO authenticated USING (public.is_admin_or_supervisor(auth.uid())) WITH CHECK (public.is_admin_or_supervisor(auth.uid()));
--
-- NET-POLICY-ADMIN-ONLY: as policies de escrita de ip_whitelist e geo_blocking_settings
-- eram FOR ALL com is_admin_or_supervisor() — ou seja, um supervisor podia reescrever a
-- whitelist de IP e o bloqueio geográfico do sistema. Escrita nessas duas tabelas passa a
-- exigir is_admin(); a LEITURA continua com as policies SELECT já existentes
-- ("Admins can view IP whitelist" e "Geo blocking visible to admins only"), ambas com
-- is_admin_or_supervisor(), de modo que supervisor continua VENDO os dados.
-- Nenhum GRANT/papel/ACL é alterado por esta migration — só policies.

-- 1. ip_whitelist — sai a policy FOR ALL, entram as três de escrita só para admin
DROP POLICY IF EXISTS "Admins can manage IP whitelist" ON public.ip_whitelist;

CREATE POLICY "Admins can insert IP whitelist" ON public.ip_whitelist
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update IP whitelist" ON public.ip_whitelist
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete IP whitelist" ON public.ip_whitelist
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- 2. geo_blocking_settings — mesma correção
DROP POLICY IF EXISTS "Admins can manage geo settings" ON public.geo_blocking_settings;

CREATE POLICY "Admins can insert geo settings" ON public.geo_blocking_settings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update geo settings" ON public.geo_blocking_settings
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete geo settings" ON public.geo_blocking_settings
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
