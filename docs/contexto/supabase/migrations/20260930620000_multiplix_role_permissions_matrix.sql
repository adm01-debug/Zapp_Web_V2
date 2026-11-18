INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.dispatch.create', 'Multiplix: criar e operar os proprios disparos (nav e rota por permissao nomeada)', 'multiplix')
ON CONFLICT (name) DO NOTHING

INSERT INTO public.role_permissions (role, permission_id)
SELECT v.role, p.id
  FROM (VALUES
    ('admin'::public.app_role,      'multiplix.audience.admin'),
    ('admin'::public.app_role,      'multiplix.dispatch.create'),
    ('admin'::public.app_role,      'multiplix.dispatch.manage_all'),
    ('supervisor'::public.app_role, 'multiplix.audience.suppliers'),
    ('supervisor'::public.app_role, 'multiplix.audience.carriers'),
    ('supervisor'::public.app_role, 'multiplix.audience.customers.all'),
    ('supervisor'::public.app_role, 'multiplix.dispatch.create'),
    ('agent'::public.app_role,      'multiplix.audience.customers.own'),
    ('agent'::public.app_role,      'multiplix.dispatch.create')
  ) AS v(role, permission_name)
  JOIN public.permissions AS p ON p.name = v.permission_name
ON CONFLICT (role, permission_id) DO NOTHING
