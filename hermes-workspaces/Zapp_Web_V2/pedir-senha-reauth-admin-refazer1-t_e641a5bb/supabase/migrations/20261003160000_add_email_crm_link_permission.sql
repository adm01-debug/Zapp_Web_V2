-- A named permission makes the Email CRM write path auditable and independent
-- from a broad role check.  The initial matrix preserves the existing scope:
-- only admins and supervisors may persist a manual CRM identity link.
INSERT INTO public.permissions (name, description, category) VALUES
  ('crm.email_contact_link.manage', 'CRM: vincular manualmente a empresa do contato por e-mail', 'crm')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_id)
SELECT matrix.role, permissions.id
FROM (VALUES
  ('admin'::public.app_role),
  ('supervisor'::public.app_role)
) AS matrix(role)
JOIN public.permissions ON permissions.name = 'crm.email_contact_link.manage'
ON CONFLICT (role, permission_id) DO NOTHING;
