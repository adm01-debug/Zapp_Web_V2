INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.audience.suppliers', 'Multiplix: enviar para fornecedores', 'multiplix'),
  ('multiplix.audience.carriers', 'Multiplix: enviar para transportadoras', 'multiplix'),
  ('multiplix.audience.customers.own', 'Multiplix: enviar para a propria carteira de clientes', 'multiplix'),
  ('multiplix.audience.customers.all', 'Multiplix: enviar para todos os clientes', 'multiplix'),
  ('multiplix.audience.admin', 'Multiplix: ignora todas as regras de escopo', 'multiplix')
ON CONFLICT (name) DO NOTHING
