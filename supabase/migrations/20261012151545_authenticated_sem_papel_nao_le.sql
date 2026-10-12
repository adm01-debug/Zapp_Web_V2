-- authenticated_sem_papel_nao_le
-- Rollback: DROP POLICY IF EXISTS "Authenticated users can read audio memes" ON public.audio_memes; CREATE POLICY "Authenticated users can read audio memes" ON public.audio_memes FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view auto-close config" ON public.auto_close_config; CREATE POLICY "Authenticated users can view auto-close config" ON public.auto_close_config FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view away messages" ON public.away_messages; CREATE POLICY "Authenticated users can view away messages" ON public.away_messages FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view business hours" ON public.business_hours; CREATE POLICY "Authenticated users can view business hours" ON public.business_hours FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view routing rules" ON public.channel_routing_rules; CREATE POLICY "Authenticated can view routing rules" ON public.channel_routing_rules FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view chatbot flows" ON public.chatbot_flows; CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view csat config" ON public.csat_auto_config; CREATE POLICY "Authenticated can view csat config" ON public.csat_auto_config FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view custom emojis" ON public.custom_emojis; CREATE POLICY "Authenticated users can view custom emojis" ON public.custom_emojis FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products; CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view queue goals" ON public.queue_goals; CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view queue skills" ON public.queue_skill_requirements; CREATE POLICY "Authenticated can view queue skills" ON public.queue_skill_requirements FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.queues; CREATE POLICY "Authenticated users can view queues" ON public.queues FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view pipeline stages" ON public.sales_pipeline_stages; CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view SLA configurations" ON public.sla_configurations; CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view stickers" ON public.stickers; CREATE POLICY "Authenticated users can view stickers" ON public.stickers FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view connection queues" ON public.whatsapp_connection_queues; CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view whatsapp flows" ON public.whatsapp_flows; CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view whatsapp groups" ON public.whatsapp_groups; CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.whatsapp_templates; CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can read all presence" ON public.agent_presence; CREATE POLICY "Authenticated can read all presence" ON public.agent_presence FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS authenticated_read_ai_model_prices ON public.ai_model_prices; CREATE POLICY authenticated_read_ai_model_prices ON public.ai_model_prices FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS departments_select ON public.departments; CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS dept_invites_select_authenticated ON public.department_invites; CREATE POLICY dept_invites_select_authenticated ON public.department_invites FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS feature_flags_select_authenticated ON public.feature_flags; CREATE POLICY feature_flags_select_authenticated ON public.feature_flags FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view reputation" ON public.number_reputation; CREATE POLICY "Authenticated can view reputation" ON public.number_reputation FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS "Authenticated can view playbooks" ON public.playbooks; CREATE POLICY "Authenticated can view playbooks" ON public.playbooks FOR SELECT TO authenticated USING (true); DROP POLICY IF EXISTS authenticated_read_talkx_settings ON public.talkx_settings; CREATE POLICY authenticated_read_talkx_settings ON public.talkx_settings FOR SELECT TO authenticated USING (true); DROP FUNCTION IF EXISTS public.user_has_any_app_role();

-- authenticated_sem_papel_nao_le_gate
--
-- DEFEITO: 27 politicas de LEITURA eram "FOR SELECT TO authenticated USING (true)" em tabelas
-- de configuracao/dados operacionais. Em Supabase, "authenticated" nao e sinônimo de membro da
-- equipe: qualquer conta criada no Auth do projeto entra nesse papel. Como a leitura pela API
-- (PostgREST) e RLS pura, um usuario autenticado SEM nenhuma linha em public.user_roles lia
-- tudo (roteamento, filas, playbooks, landmarks comerciais etc.).
--
-- CORRECAO: a leitura passa a exigir que o usuario tenha papel atribuido em public.user_roles.
-- O helper public.user_has_any_app_role() (SECURITY DEFINER, mesmo padrao de
-- public.is_admin_or_supervisor) devolve true so quando existe linha de papel para auth.uid().
-- O gatilho NAO restringe quem administra nada: os papeis (admin/supervisor/agent) seguem com
-- exatamente o mesmo acesso de antes; apenas o usuario autenticado sem papel deixa de ler.
--
-- ESCOPO: exatamente 27 politicas de SELECT cujo qual e a constante true e cujo papel e
-- authenticated (conferidas em pg_policies do banco em 12/10/2026). Nenhuma dessas tabelas tem
-- politica de SELECT para anon (o anon segue sem ler, como ja estava) e nenhuma e lida antes do
-- login — conferido em src/ (varredura descrita no relato). Nenhum GRANT/papel de TABELA muda
-- aqui; a unica mudanca de ACL e a do helper novo (REVOKE de PUBLIC/anon, GRANT a authenticated).
-- As outras politicas USING(true) de department_invites (INSERT/DELETE) ficam FORA deste cartao.
--
-- DECISAO (department_invites): mantem o mesmo portao de papel (qualquer papel de app), SEM
-- estreitar para admin/supervisor. A leitura de convites e feita por DepartmentInvitesView, que e
-- alcancavel por membro nao-admin do departamento (TeamConversationList abre
-- DepartmentManagementDialog para qualquer membro); estreitar quebraria esse fluxo. Fica
-- registrado como decisao, nao como esquecimento.

CREATE OR REPLACE FUNCTION public.user_has_any_app_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  );
$$;

-- O helper e chamado pelo RLS na sessao do usuario final: so authenticated precisa de EXECUTE.
REVOKE ALL ON FUNCTION public.user_has_any_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_any_app_role() TO authenticated;

-- 27 politicas de SELECT: USING (true) -> USING (public.user_has_any_app_role())
DROP POLICY IF EXISTS "Authenticated users can read audio memes" ON public.audio_memes;
CREATE POLICY "Authenticated users can read audio memes" ON public.audio_memes
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view auto-close config" ON public.auto_close_config;
CREATE POLICY "Authenticated users can view auto-close config" ON public.auto_close_config
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view away messages" ON public.away_messages;
CREATE POLICY "Authenticated users can view away messages" ON public.away_messages
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view business hours" ON public.business_hours;
CREATE POLICY "Authenticated users can view business hours" ON public.business_hours
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view routing rules" ON public.channel_routing_rules;
CREATE POLICY "Authenticated can view routing rules" ON public.channel_routing_rules
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view chatbot flows" ON public.chatbot_flows;
CREATE POLICY "Authenticated can view chatbot flows" ON public.chatbot_flows
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view csat config" ON public.csat_auto_config;
CREATE POLICY "Authenticated can view csat config" ON public.csat_auto_config
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view custom emojis" ON public.custom_emojis;
CREATE POLICY "Authenticated users can view custom emojis" ON public.custom_emojis
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
CREATE POLICY "Authenticated users can view products" ON public.products
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view queue goals" ON public.queue_goals;
CREATE POLICY "Authenticated users can view queue goals" ON public.queue_goals
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view queue skills" ON public.queue_skill_requirements;
CREATE POLICY "Authenticated can view queue skills" ON public.queue_skill_requirements
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view queues" ON public.queues;
CREATE POLICY "Authenticated users can view queues" ON public.queues
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view pipeline stages" ON public.sales_pipeline_stages;
CREATE POLICY "Authenticated can view pipeline stages" ON public.sales_pipeline_stages
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view SLA configurations" ON public.sla_configurations;
CREATE POLICY "Authenticated users can view SLA configurations" ON public.sla_configurations
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view stickers" ON public.stickers;
CREATE POLICY "Authenticated users can view stickers" ON public.stickers
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view connection queues" ON public.whatsapp_connection_queues;
CREATE POLICY "Authenticated can view connection queues" ON public.whatsapp_connection_queues
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view whatsapp flows" ON public.whatsapp_flows;
CREATE POLICY "Authenticated can view whatsapp flows" ON public.whatsapp_flows
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view whatsapp groups" ON public.whatsapp_groups;
CREATE POLICY "Authenticated users can view whatsapp groups" ON public.whatsapp_groups
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated users can view templates" ON public.whatsapp_templates
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can read all presence" ON public.agent_presence;
CREATE POLICY "Authenticated can read all presence" ON public.agent_presence
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS authenticated_read_ai_model_prices ON public.ai_model_prices;
CREATE POLICY authenticated_read_ai_model_prices ON public.ai_model_prices
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select ON public.departments
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS dept_invites_select_authenticated ON public.department_invites;
CREATE POLICY dept_invites_select_authenticated ON public.department_invites
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS feature_flags_select_authenticated ON public.feature_flags;
CREATE POLICY feature_flags_select_authenticated ON public.feature_flags
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view reputation" ON public.number_reputation;
CREATE POLICY "Authenticated can view reputation" ON public.number_reputation
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS "Authenticated can view playbooks" ON public.playbooks;
CREATE POLICY "Authenticated can view playbooks" ON public.playbooks
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());

DROP POLICY IF EXISTS authenticated_read_talkx_settings ON public.talkx_settings;
CREATE POLICY authenticated_read_talkx_settings ON public.talkx_settings
  FOR SELECT TO authenticated USING (public.user_has_any_app_role());
