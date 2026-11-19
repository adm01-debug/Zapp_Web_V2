INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.dispatch.manage_all', 'Multiplix: iniciar/pausar/cancelar disparo de outro operador', 'multiplix')
ON CONFLICT (name) DO NOTHING

INSERT INTO public.role_permissions (role, permission_id)
SELECT 'admin'::public.app_role, permission.id
  FROM public.permissions AS permission
 WHERE permission.name = 'multiplix.dispatch.manage_all'
   AND NOT EXISTS (
     SELECT 1 FROM public.role_permissions AS existing
      WHERE existing.role = 'admin'::public.app_role
        AND existing.permission_id = permission.id
   )
