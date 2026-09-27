-- 20260926150000_seed_multiplix_audience_permissions
-- Catalogo de permissoes do Multiplix (E015, docs/multiplix/PERMISSOES.md). Puramente
-- aditivo: insere as 5 permissoes nomeadas na tabela permissions, sem nenhuma linha em
-- role_permissions. Isso NAO muda quem tem acesso ao Multiplix hoje — a edge
-- multiplix-audience so abre escopo via is_admin() (ZAPP) ate essas permissoes serem
-- atribuidas a um role real (RETORNA vazio via user_has_permission ate la, comportamento
-- seguro por padrao ja documentado no PERMISSOES.md).
--
-- Atribuicao a role fica para quando existirem contas reais de Compras/Logistica/Comercial
-- no ZAPP: hoje os 6 usuarios existentes (public.profiles) sao só admin/teste/CI — nenhum
-- corresponde aos comercial01..09@promobrindes.com.br que sao os vendedores reais no Singu
-- (ja apontado no PERMISSOES.md). Atribuir role_permissions agora seria decidir acesso para
-- ninguem real; decisao de negocio (quem fica em qual papel) fica para quando essas contas
-- existirem.
INSERT INTO public.permissions (name, description, category) VALUES
  ('multiplix.audience.suppliers', 'Multiplix: enviar para fornecedores', 'multiplix'),
  ('multiplix.audience.carriers', 'Multiplix: enviar para transportadoras', 'multiplix'),
  ('multiplix.audience.customers.own', 'Multiplix: enviar para a propria carteira de clientes', 'multiplix'),
  ('multiplix.audience.customers.all', 'Multiplix: enviar para todos os clientes', 'multiplix'),
  ('multiplix.audience.admin', 'Multiplix: ignora todas as regras de escopo', 'multiplix')
ON CONFLICT (name) DO NOTHING;
