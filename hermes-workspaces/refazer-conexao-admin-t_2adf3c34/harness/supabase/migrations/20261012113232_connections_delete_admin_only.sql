-- connections_delete_admin_only
-- Rollback: restaura a política de DELETE anterior (supervisor também excluía).
-- Rollback (SQL executável, na ordem):
--   DROP POLICY IF EXISTS "Admins can delete connections" ON public.whatsapp_connections;
--   CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections FOR DELETE TO authenticated USING (public.is_admin_or_supervisor(auth.uid()));
--
-- Excluir conexão é destrutivo: apaga a linha de whatsapp_connections e, pela
-- Edge (evolution-api, ação delete-instance), a instância na Evolution. A policy
-- de DELETE criada em 20260319134839 aceitava is_admin_or_supervisor, então um
-- supervisor apagava a conexão. Agora só is_admin. A Edge usa service_role
-- (ignora RLS), por isso o gate estrito também é aplicado lá.
-- SELECT/INSERT/UPDATE ficam intactas: authenticated vê (agentes precisam do
-- instance_id para enviar) e admin/supervisor continuam gerenciando cadastro.
DROP POLICY IF EXISTS "Admins can delete connections" ON public.whatsapp_connections;

CREATE POLICY "Admins can delete connections" ON public.whatsapp_connections
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));
