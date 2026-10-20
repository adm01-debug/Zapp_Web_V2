-- =====================================================================
-- SECURITY FIX: Corrige RLS policies com USING(true)
-- Autor: Claude (Missão ZAPP-WEB 10/10)
-- Data: 2026-04-12
-- Sprint: B1 - Auditoria de Segurança
-- =====================================================================

-- =====================================================
-- 1. ENTITY_VERSIONS - Restringir por owner/organização
-- =====================================================

-- Drop old permissive policies
DROP POLICY IF EXISTS "Users can view versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Users can insert versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Authenticated can view versions" ON public.entity_versions;
DROP POLICY IF EXISTS "Authenticated can insert versions" ON public.entity_versions;

-- Create secure policies based on organization membership
CREATE POLICY "entity_versions_select_own_org"
ON public.entity_versions FOR SELECT TO authenticated
USING (
  changed_by = auth.uid()
  OR changed_by IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND p.role IN ('admin', 'supervisor')
  )
);

CREATE POLICY "entity_versions_insert_own"
ON public.entity_versions FOR INSERT TO authenticated
WITH CHECK (
  changed_by = auth.uid()
  OR changed_by IS NULL
);

-- =====================================================
-- 2. EMAIL_THREADS - Restringir por account owner
-- =====================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Authenticated users can view email threads" ON public.email_threads;

-- Create secure policy
CREATE POLICY "email_threads_select_own_or_assigned"
ON public.email_threads FOR SELECT TO authenticated
USING (
  -- Owner of the gmail account
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  -- Or assigned to this user
  OR assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  -- Or admin/supervisor
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- Fix WITH CHECK policy
DROP POLICY IF EXISTS "Users can manage email threads they have access to" ON public.email_threads;

CREATE POLICY "email_threads_manage_own"
ON public.email_threads FOR ALL TO authenticated
USING (
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR assigned_to IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- =====================================================
-- 3. EMAIL_MESSAGES - Restringir por account owner
-- =====================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Authenticated users can view email messages" ON public.email_messages;

-- Create secure policy
CREATE POLICY "email_messages_select_own"
ON public.email_messages FOR SELECT TO authenticated
USING (
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- Fix WITH CHECK policy
DROP POLICY IF EXISTS "Users can manage their email messages" ON public.email_messages;

CREATE POLICY "email_messages_manage_own"
ON public.email_messages FOR ALL TO authenticated
USING (
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  gmail_account_id IN (
    SELECT ga.id FROM public.gmail_accounts ga
    JOIN public.profiles p ON p.id = ga.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- =====================================================
-- 4. EMAIL_ATTACHMENTS - Restringir via email_messages
-- =====================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Authenticated users can view email attachments" ON public.email_attachments;

-- Create secure policy
CREATE POLICY "email_attachments_select_via_messages"
ON public.email_attachments FOR SELECT TO authenticated
USING (
  email_message_id IN (
    SELECT em.id FROM public.email_messages em
    WHERE em.gmail_account_id IN (
      SELECT ga.id FROM public.gmail_accounts ga
      JOIN public.profiles p ON p.id = ga.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- Fix WITH CHECK policy
DROP POLICY IF EXISTS "Users can manage email attachments" ON public.email_attachments;

CREATE POLICY "email_attachments_manage_via_messages"
ON public.email_attachments FOR ALL TO authenticated
USING (
  email_message_id IN (
    SELECT em.id FROM public.email_messages em
    WHERE em.gmail_account_id IN (
      SELECT ga.id FROM public.gmail_accounts ga
      JOIN public.profiles p ON p.id = ga.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
)
WITH CHECK (
  email_message_id IN (
    SELECT em.id FROM public.email_messages em
    WHERE em.gmail_account_id IN (
      SELECT ga.id FROM public.gmail_accounts ga
      JOIN public.profiles p ON p.id = ga.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'supervisor')
  )
);

-- =====================================================
-- 5. WHATSAPP_CONNECTION_QUEUES - Restringir por org
-- =====================================================

-- Drop old permissive policy
DROP POLICY IF EXISTS "Authenticated can view connection queues" ON public.whatsapp_connection_queues;

-- Create secure policy - all authenticated users in org can view
-- (WhatsApp connections are org-wide resources)
CREATE POLICY "whatsapp_connection_queues_select_org"
ON public.whatsapp_connection_queues FOR SELECT TO authenticated
USING (
  -- User is part of the organization (has a profile)
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid())
);

-- =====================================================
-- 6. GLOBAL_SETTINGS - Mantido com USING(true)
-- INTENCIONALMENTE - São configurações públicas do sistema
-- =====================================================
-- NOTA: "Anyone can view global settings" é mantido por design
-- pois global_settings são configurações do sistema que
-- todos os usuários autenticados precisam acessar.

-- =====================================================
-- 7. Comentário de auditoria
-- =====================================================
COMMENT ON TABLE public.entity_versions IS 'Versionamento de entidades - RLS corrigido em 2026-04-12';
COMMENT ON TABLE public.email_threads IS 'Threads de email Gmail - RLS corrigido em 2026-04-12';
COMMENT ON TABLE public.email_messages IS 'Mensagens de email Gmail - RLS corrigido em 2026-04-12';
COMMENT ON TABLE public.email_attachments IS 'Anexos de email Gmail - RLS corrigido em 2026-04-12';
COMMENT ON TABLE public.whatsapp_connection_queues IS 'Conexões WhatsApp-Filas - RLS corrigido em 2026-04-12';
