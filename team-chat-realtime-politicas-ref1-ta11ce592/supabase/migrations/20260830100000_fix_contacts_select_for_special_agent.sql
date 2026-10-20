-- 20260830100000_fix_contacts_select_for_special_agent
-- RECUPERADO do ledger oficial (read-only) em 2026-08-30 — G-12 fase 1.
-- Conteudo = statements exatos registrados em supabase_migrations.schema_migrations
-- (o que efetivamente rodou em producao; substitui placeholders nao-reproduziveis).

-- STEP 25: Corrigir contacts_select_policy para incluir special_agent (F07/G2)
-- Problema detectado na simulação:
--   (1) policy usava get_profile_id_for_user() (single) — special_agent não enxergava carteira estendida
--   (2) assigned_to IS NULL abria TODOS os não-atribuídos para qualquer authenticated
-- Solução:
--   - Usar get_visible_agent_ids() (unifica agent e special_agent)
--   - Reservar "IS NULL" para admin/supervisor (contatos não atribuídos são admin-only)
DROP POLICY IF EXISTS "contacts_select_policy" ON public.contacts;
CREATE POLICY "contacts_select_policy" ON public.contacts
  FOR SELECT TO authenticated
  USING (
    is_admin_or_supervisor(auth.uid())
    OR assigned_to IN (
      SELECT get_visible_agent_ids(auth.uid())
    )
  );

-- Policy admin separada para contatos não atribuídos também usa is_admin_or_supervisor
-- (já existe "Admins can view all contacts including unassigned" — compatível)
