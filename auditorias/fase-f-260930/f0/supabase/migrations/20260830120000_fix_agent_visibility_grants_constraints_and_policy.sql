-- 20260830120000_fix_agent_visibility_grants_constraints_and_policy
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 29: CHECK constraint agent_id <> can_see_agent_id (F14)
-- Evita que um special_agent seja "concedido" visão de si mesmo (redundante e enganoso).
ALTER TABLE public.agent_visibility_grants
  ADD CONSTRAINT agent_visibility_grants_no_self_grant
  CHECK (agent_id <> can_see_agent_id);

-- STEP 30: Endurecer policy SELECT de special_agents nos próprios grants
-- Policy atual só checa agent_id, não valida se o usuário realmente tem a role.
-- Adicionamos a verificação de role para evitar que um agent comum veja a tabela.
DROP POLICY IF EXISTS "Special agents can view own grants" ON public.agent_visibility_grants;
CREATE POLICY "Special agents can view own grants" ON public.agent_visibility_grants
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'special_agent'::app_role)
    AND agent_id IN (
      SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
    )
  );
