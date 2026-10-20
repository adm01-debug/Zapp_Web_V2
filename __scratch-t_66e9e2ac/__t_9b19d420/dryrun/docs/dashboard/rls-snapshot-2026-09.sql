-- Snapshot de RLS policies das 7 tabelas do módulo Dashboard (ZAPP Web V2)
-- Gerado em: 2026-09-24 (Etapa E02 do PLANO_DASHBOARD_50_ETAPAS.md)
-- Fonte: pg_policies (banco Supabase ZAPP WEB V2, self-hosted)
-- Uso: referência de rollback/auditoria antes das mudanças de RLS da Fase 1 (E07-E12).
-- Consulta original:
--   select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('contacts','profiles','conversation_sla','conversation_events','conversation_closures','messages','queues')
--   order by tablename, cmd, policyname;

-- ============================================================
-- TABELA: contacts (3 policies)
-- ============================================================

-- [INSERT] "Users can insert contacts" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   is_admin_or_supervisor(auth.uid())
--   OR (assigned_to IS NOT NULL AND assigned_to IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))

-- [SELECT] "contacts_select_policy" (PERMISSIVE, authenticated)
-- USING:
--   is_admin_or_supervisor(auth.uid())
--   OR assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
--   OR EXISTS (SELECT 1 FROM queue_members qm WHERE qm.queue_id = contacts.queue_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true)

-- [UPDATE] "Users can update their assigned contacts" (PERMISSIVE, public)
-- USING:
--   assigned_to IN (SELECT get_visible_agent_ids(auth.uid()))
--   OR is_admin_or_supervisor(auth.uid())
--   OR (queue_id IS NOT NULL AND EXISTS (SELECT 1 FROM queue_members qm WHERE qm.queue_id = contacts.queue_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true))

-- ============================================================
-- TABELA: conversation_closures (2 policies)
-- ============================================================

-- [INSERT] "Agents can create closures for their contacts" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   is_contact_visible_to_user(contact_id, auth.uid())

-- [SELECT] "Agents or admins can view closures" (PERMISSIVE, authenticated)
-- USING:
--   is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())

-- ============================================================
-- TABELA: conversation_events (3 policies) — ver A7/E04: causa raiz do "parado há 22 dias"
-- NÃO era RLS (ver PLANO_DASHBOARD_50_ETAPAS.md, E04). Snapshot abaixo é o estado ANTES da E08 (Fase 1).
-- ============================================================

-- [INSERT] "Authorized users can insert events" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   (performed_by IS NULL OR performed_by = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
--   AND (
--     is_admin_or_supervisor(auth.uid())
--     OR contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to = (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid() LIMIT 1))
--   )

-- [SELECT] "Agents or admins can view conversation events" (PERMISSIVE, authenticated) — policy ANTIGA, mais ampla (tem caminho de fila)
-- USING:
--   is_contact_visible_to_user(contact_id, auth.uid()) OR is_admin_or_supervisor(auth.uid())

-- [SELECT] "conversation_events_select_policy" (PERMISSIVE, authenticated) — policy NOVA, mais estreita (só atribuído direto)
-- USING:
--   is_admin_or_supervisor(auth.uid())
--   OR contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
-- NOTA (A3/E08): 2 policies permissivas de SELECT coexistem. A antiga cobre fila via is_contact_visible_to_user;
-- a nova não. Efetivo = união (OR) das duas — já funciona hoje, mas é redundante/confuso. E08 consolida em uma.

-- ============================================================
-- TABELA: conversation_sla (3 policies)
-- ============================================================

-- [INSERT] "Admins can insert SLA" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   is_admin_or_supervisor(auth.uid())

-- [SELECT] "Authenticated users can view SLA data" (PERMISSIVE, authenticated) — subconjunto estrito da policy abaixo (ver E07, drop seguro)
-- USING:
--   contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT p.id FROM profiles p WHERE p.user_id = auth.uid()))
--   OR is_admin_or_supervisor(auth.uid())

-- [SELECT] "conversation_sla_select_policy" (PERMISSIVE, authenticated)
-- USING:
--   is_admin_or_supervisor(auth.uid())
--   OR contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))

-- [UPDATE] "Admins can update SLA" (PERMISSIVE, authenticated)
-- USING:
--   is_admin_or_supervisor(auth.uid())

-- ============================================================
-- TABELA: messages (3 policies)
-- ============================================================

-- [INSERT] "Users can insert messages" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   agent_id IS NULL
--   OR agent_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())
--   OR is_admin_or_supervisor(auth.uid())

-- [SELECT] "messages_select_policy" (PERMISSIVE, authenticated)
-- USING:
--   is_admin_or_supervisor(auth.uid())
--   OR contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
--   OR EXISTS (
--        SELECT 1 FROM contacts c JOIN queue_members qm ON qm.queue_id = c.queue_id
--        WHERE c.id = messages.contact_id AND qm.profile_id = get_profile_id_for_user(auth.uid()) AND qm.is_active = true
--      )

-- [UPDATE] "Users can update messages from their assigned contacts" (PERMISSIVE, authenticated)
-- USING:
--   contact_id IN (SELECT c.id FROM contacts c WHERE c.assigned_to IN (SELECT get_visible_agent_ids(auth.uid())))
--   OR is_admin_or_supervisor(auth.uid())

-- ============================================================
-- TABELA: profiles (5 policies, inclui 1 RESTRICTIVE)
-- ============================================================

-- [INSERT] "Users can insert their own profile safely" (PERMISSIVE, authenticated)
-- WITH CHECK:
--   auth.uid() = user_id
--   AND (role IS NULL OR role = 'agent')
--   AND (access_level IS NULL OR access_level = 'basic')
--   AND (permissions IS NULL OR permissions = '{}'::jsonb)

-- [SELECT] "Admin supervisor can view all profiles" (PERMISSIVE, authenticated)
-- USING:
--   is_admin_or_supervisor(auth.uid())

-- [SELECT] "Users can view own profile" (PERMISSIVE, authenticated) — ver A1: agente só vê o próprio registro
-- USING:
--   user_id = auth.uid()

-- [UPDATE] "Admins can update any profile" (PERMISSIVE, authenticated)
-- USING / WITH CHECK:
--   is_admin_or_supervisor(auth.uid())

-- [UPDATE] "Block sensitive field changes by non-admins" (RESTRICTIVE, authenticated)
-- WITH CHECK:
--   is_admin_or_supervisor(auth.uid())
--   OR (role, access_level, permissions, is_active não mudam em relação ao registro atual do próprio usuário)

-- [UPDATE] "Users can update own profile" (PERMISSIVE, authenticated)
-- USING / WITH CHECK:
--   auth.uid() = user_id

-- ============================================================
-- TABELA: queues (2 policies)
-- ============================================================

-- [ALL] "Admins can manage queues" (PERMISSIVE, authenticated)
-- USING / WITH CHECK:
--   is_admin_or_supervisor(auth.uid())

-- [SELECT] "Authenticated users can view queues" (PERMISSIVE, authenticated)
-- USING:
--   true
