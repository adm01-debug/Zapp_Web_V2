-- Etapa 49: restringir INSERT em email_threads e email_messages a service_role
-- O front nao faz insert direto (confirmado por auditoria: 0 inserções diretas)
-- service_role bypassa RLS — edges continuam funcionando
DROP POLICY IF EXISTS "Users can insert threads for own accounts" ON public.email_threads;
DROP POLICY IF EXISTS "Users can insert messages for own accounts" ON public.email_messages;
